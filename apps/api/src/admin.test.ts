import { createDb, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite:memory',
  PUBLIC_URL: 'https://fokus.test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  SETUP_CODE: 'richtiger-code',
  FK_VERSION: 'v0.3.0',
  UPDATER_URL: 'http://updater:8080',
  UPDATER_SECRET: 'u'.repeat(40),
};

let h: DbHandle;
let app: ReturnType<typeof createApp>;
let outbox: Mail[];
let seen: { url: string; auth: string | null; body: string | null }[];
let updaterUp: boolean;

function build(env = loadEnv(base)) {
  const auth = createAuth(h.db, env, { send: async (m) => void outbox.push(m) });
  const fakeUpdater: typeof fetch = async (input, init) => {
    if (!updaterUp) throw new TypeError('fetch failed');
    const url = String(input);
    seen.push({
      url,
      auth: new Headers(init?.headers).get('authorization'),
      body: (init?.body as string) ?? null,
    });
    if (url.includes('/backups/fokus_1.dump'))
      return new Response('DUMP', { headers: { 'content-length': '4' } });
    if (url.endsWith('/install'))
      return Response.json({ id: 'job-1', status: 'running' }, { status: 202 });
    return Response.json({ ok: true, path: new URL(url).pathname });
  };
  app = createApp({ db: h.db, auth, env, updaterFetch: fakeUpdater });
}

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  seen = [];
  updaterUp = true;
  build();
});
afterEach(() => h.close());

const req = (method: string, path: string, cookie?: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function login(): Promise<string> {
  const link = outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0];
  const url = new URL(link);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function adminAndUser() {
  await req('POST', '/api/setup/admin', undefined, {
    code: 'richtiger-code',
    email: 'a@test.de',
    name: 'A',
  });
  const admin = await login();
  await req('POST', '/api/setup/complete', admin, { code: 'richtiger-code' });
  const inv = (await (await req('POST', '/api/admin/invites', admin, {})).json()) as {
    url: string;
  };
  await req('POST', '/api/invites/accept', undefined, {
    acceptTerms: true,
    token: new URL(inv.url).searchParams.get('token'),
    email: 'b@test.de',
    name: 'B',
  });
  return { admin, user: await login() };
}

describe('Admin-Panel', () => {
  it('ist nur für Admins', async () => {
    const { user } = await adminAndUser();
    expect((await req('GET', '/api/admin/system')).status).toBe(401);
    expect((await req('GET', '/api/admin/system', user)).status).toBe(403);
    expect(
      (await req('POST', '/api/admin/updates/install', user, { version: 'v0.4.0' })).status,
    ).toBe(403);
    expect(seen).toEqual([]);
  });

  it('reicht Updates mit Secret weiter und Testversionen nur, wenn eingeschaltet', async () => {
    const { admin } = await adminAndUser();
    const res = await req('POST', '/api/admin/updates/install', admin, { version: 'v0.4.0' });
    expect(res.status).toBe(202);
    expect(seen[0]).toMatchObject({
      url: 'http://updater:8080/install',
      auth: `Bearer ${'u'.repeat(40)}`,
    });
    expect(JSON.parse(seen[0]!.body!)).toEqual({ version: 'v0.4.0', allowPrerelease: false });

    expect(
      (await req('PUT', '/api/admin/settings', admin, { showTestReleases: true })).status,
    ).toBe(204);
    await req('POST', '/api/admin/updates/install', admin, { version: 'v0.4.1-broken' });
    expect(JSON.parse(seen[1]!.body!).allowPrerelease).toBe(true);
    await req('GET', '/api/admin/updates', admin);
    expect(seen[2]!.url).toBe('http://updater:8080/status?prerelease=1');
  });

  it('zeigt den Systemstatus auch ohne Updater', async () => {
    const { admin } = await adminAndUser();
    updaterUp = false;
    const sys = (await (await req('GET', '/api/admin/system', admin)).json()) as Record<
      string,
      unknown
    >;
    expect(sys).toMatchObject({
      version: 'v0.3.0',
      users: 2,
      registrationMode: 'invite',
      updater: null,
    });
    expect(sys.dbBytes).toBeGreaterThan(0);
    const res = await req('GET', '/api/admin/updates', admin);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain('nicht erreichbar');
  });

  it('streamt Backups als Download und prüft den Namen', async () => {
    const { admin } = await adminAndUser();
    const res = await req('GET', '/api/admin/backups/fokus_1.dump', admin);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="fokus_1.dump"');
    expect(await res.text()).toBe('DUMP');
    expect((await req('GET', '/api/admin/backups/..%2F.env', admin)).status).toBe(400);
  });

  it('schaltet die Registrierung um', async () => {
    const { admin } = await adminAndUser();
    await req('PUT', '/api/admin/settings', admin, { registrationMode: 'open' });
    expect(
      (
        await req('POST', '/api/register', undefined, {
          acceptTerms: true,
          email: 'c@test.de',
          name: 'C',
        })
      ).status,
    ).toBe(204);
    expect(
      (await req('PUT', '/api/admin/settings', admin, { registrationMode: 'alle' })).status,
    ).toBe(400);
  });
});

describe('Health im Test-Release', () => {
  it('meldet sich mit FK_SELFTEST_BROKEN absichtlich nie gesund', async () => {
    build(loadEnv({ ...base, FK_SELFTEST_BROKEN: '1' }));
    const res = await app.request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'selftest-broken', version: 'v0.3.0' });
  });
});
