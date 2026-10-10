// Jede Admin-Route (eigene und Better-Auth-Admin) lehnt Nicht-Admins und Fremde ab.
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

const ID = '00000000-0000-4000-8000-000000000001';

describe('Admin-Routen', () => {
  it('nur für Admins: Nutzer bekommt 401/403, ohne Anmeldung ebenso', async () => {
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
    expect((await req('GET', '/api/me', b)).data).toMatchObject({ role: 'user' });

    const routes = app.routes.filter(
      (r) => r.method !== 'ALL' && /^\/api\/admin(\/|$)/.test(r.path),
    );
    expect(routes.length).toBeGreaterThan(15);
    const better = [
      'list-users',
      'set-role',
      'ban-user',
      'unban-user',
      'remove-user',
      'impersonate-user',
      'create-user',
      'set-user-password',
    ].map((x) => ({ method: x === 'list-users' ? 'GET' : 'POST', path: `/api/auth/admin/${x}` }));
    for (const r of [...routes, ...better]) {
      const path = r.path.replace(/:[a-zA-Z]+/g, ID);
      for (const cookie of [b, '']) {
        const body =
          r.method === 'GET'
            ? undefined
            : {
                userId: ID,
                role: 'admin',
                email: 'x@test.de',
                name: 'X',
                password: 'geheim-geheim-1',
                newPassword: 'geheim-geheim-1',
              };
        const { status } = await req(r.method, path, cookie, body);
        expect([401, 403], `${r.method} ${path} ${cookie ? 'Nutzer' : 'anonym'}`).toContain(status);
      }
    }
    // B ist danach immer noch kein Admin
    expect((await req('GET', '/api/me', b)).data).toMatchObject({ role: 'user' });
  });
});
