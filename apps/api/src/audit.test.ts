import { createDb, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite:memory',
  PUBLIC_URL: 'https://fokus.test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  SETUP_CODE: 'richtiger-code',
});

let h: DbHandle;
let app: ReturnType<typeof createApp>;
let outbox: Mail[];

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({ db: h.db, auth: createAuth(h.db, env, mailer), env, mailer });
});
afterEach(() => h.close());

const req = async (method: string, path: string, cookie: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as never };
};
async function login(): Promise<string> {
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

type Row = {
  action: string;
  actorEmail: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
};

describe('Audit-Log', () => {
  it('protokolliert Admin-Aktionen mit wer/was, ohne Geheimnisse; nur Admins sehen es', async () => {
    await req('POST', '/api/setup/admin', '', {
      code: 'richtiger-code',
      email: 'a@test.de',
      name: 'A',
    });
    const a = await login();
    await req('POST', '/api/setup/complete', a, { code: 'richtiger-code' });
    const inv = (await req('POST', '/api/admin/invites', a, {})).data as { url: string };
    await req('POST', '/api/invites/accept', '', {
      acceptTerms: true,
      token: new URL(inv.url).searchParams.get('token'),
      email: 'b@test.de',
      name: 'B',
    });
    const b = await login();
    const bId = ((await req('GET', '/api/me', b)).data as { id: string }).id;

    await req('PUT', '/api/admin/settings', a, { registrationMode: 'open' });
    expect((await req('PUT', `/api/admin/users/${bId}/ban`, a, { banned: true })).status).toBe(204);
    // Versuch eines Nicht-Admins wird nicht protokolliert (und scheitert)
    expect(
      (await req('PUT', '/api/admin/settings', b, { registrationMode: 'invite' })).status,
    ).toBe(401);

    const log = (await req('GET', '/api/admin/audit', a)).data as Row[];
    const actions = log.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'POST /api/admin/invites',
        'PUT /api/admin/settings',
        `PUT /api/admin/users/${bId}/ban`,
      ]),
    );
    expect(log.find((r) => r.action === 'PUT /api/admin/settings')).toMatchObject({
      actorEmail: 'a@test.de',
      detail: { registrationMode: 'open' },
    });
    expect(log.find((r) => r.action.endsWith('/ban'))?.detail).toEqual({ banned: true });
    expect(log).toHaveLength(3);
    expect((await req('GET', '/api/admin/audit', b)).status).toBeGreaterThanOrEqual(401);
  });
});
