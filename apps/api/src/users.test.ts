import { createDb, passkey, type DbHandle } from '@fokus/db';
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

const req = async <T = never>(method: string, path: string, cookie: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};
async function login(): Promise<string> {
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
const idOf = async (cookie: string) =>
  (await req<{ id: string }>('GET', '/api/me', cookie)).data.id;

type U = { id: string; name: string; role: string; banned: boolean; passkeys: number };

let a: string;
let aId: string;
async function invite(email: string, name: string) {
  const inv = (await req<{ url: string }>('POST', '/api/admin/invites', a, {})).data;
  await req('POST', '/api/invites/accept', '', {
    acceptTerms: true,
    token: new URL(inv.url).searchParams.get('token'),
    email,
    name,
  });
  return login();
}

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({ db: h.db, auth: createAuth(h.db, env, mailer), env, mailer });
  await req('POST', '/api/setup/admin', '', {
    code: 'richtiger-code',
    email: 'a@test.de',
    name: 'A',
  });
  a = await login();
  await req('POST', '/api/setup/complete', a, { code: 'richtiger-code' });
  aId = await idOf(a);
});
afterEach(() => h.close());

describe('Admin: Nutzer verwalten', () => {
  it('Liste ohne Finanzdaten, Schutzregeln für sich selbst und den letzten Admin', async () => {
    const b = await invite('b@test.de', 'Bea');
    const bId = await idOf(b);
    const list = (await req<U[]>('GET', '/api/admin/users', a)).data;
    expect(list.map((u) => u.name)).toEqual(['A', 'Bea']);
    expect(Object.keys(list[0]!).sort()).toEqual(
      [
        'banned',
        'createdAt',
        'email',
        'emailVerified',
        'id',
        'lastSeen',
        'name',
        'passkeys',
        'role',
      ].sort(),
    );
    // Nicht-Admin: nichts
    expect((await req('GET', '/api/admin/users', b)).status).toBe(403);
    expect((await req('PUT', `/api/admin/users/${aId}/role`, b, { role: 'user' })).status).toBe(
      403,
    );

    // Selbst: nicht herabstufen, sperren oder löschen; letzter Admin bleibt
    expect((await req('PUT', `/api/admin/users/${aId}/role`, a, { role: 'user' })).status).toBe(
      409,
    );
    expect((await req('PUT', `/api/admin/users/${aId}/ban`, a, { banned: true })).status).toBe(409);
    expect((await req('DELETE', `/api/admin/users/${aId}`, a, { name: 'A' })).status).toBe(409);
    // Better-Auth-Admin-Endpunkte umgehen die Regeln nicht
    expect(
      (await req('POST', '/api/auth/admin/set-role', a, { userId: aId, role: 'user' })).status,
    ).toBe(403);
    expect((await req('POST', '/api/auth/admin/remove-user', a, { userId: bId })).status).toBe(403);

    // B zum Admin, dann kann A von B herabgestuft werden, aber B nicht mehr (letzter Admin)
    expect((await req('PUT', `/api/admin/users/${bId}/role`, a, { role: 'admin' })).status).toBe(
      204,
    );
    const b2 = b; // Rolle gilt sofort (Sitzung liest den Nutzer)
    expect((await req('PUT', `/api/admin/users/${aId}/role`, b2, { role: 'user' })).status).toBe(
      204,
    );
    expect((await req('PUT', `/api/admin/users/${bId}/role`, b2, { role: 'user' })).status).toBe(
      409,
    );
  });

  it('sperren beendet Sitzungen, Passkeys zurücksetzen, Link erneut senden, alles im Protokoll', async () => {
    const b = await invite('b@test.de', 'Bea');
    const bId = await idOf(b);
    await h.db.insert(passkey).values({
      userId: bId,
      publicKey: 'x',
      credentialID: 'cred',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
    });
    expect((await req<U[]>('GET', '/api/admin/users', a)).data[1]!.passkeys).toBe(1);
    expect((await req('DELETE', `/api/admin/users/${bId}/passkeys`, a)).status).toBe(204);
    expect((await req<U[]>('GET', '/api/admin/users', a)).data[1]!.passkeys).toBe(0);

    const before = outbox.length;
    expect((await req('POST', `/api/admin/users/${bId}/link`, a)).status).toBe(204);
    expect(outbox.slice(before).map((m) => m.to)).toEqual(['b@test.de']);

    expect((await req('PUT', `/api/admin/users/${bId}/ban`, a, { banned: true })).status).toBe(204);
    expect((await req('GET', '/api/me', b)).status).toBe(401);
    expect((await req('POST', `/api/admin/users/${bId}/link`, a)).status).toBe(409);
    expect((await req('PUT', `/api/admin/users/${bId}/ban`, a, { banned: false })).status).toBe(
      204,
    );
    expect((await req('DELETE', `/api/admin/users/${bId}/sessions`, a)).status).toBe(204);

    const log = (await req<{ action: string }[]>('GET', '/api/admin/audit', a)).data.map(
      (r) => r.action,
    );
    expect(log).toEqual(
      expect.arrayContaining([
        `DELETE /api/admin/users/${bId}/passkeys`,
        `POST /api/admin/users/${bId}/link`,
        `PUT /api/admin/users/${bId}/ban`,
        `DELETE /api/admin/users/${bId}/sessions`,
      ]),
    );
  });

  it('löschen mit Namen', async () => {
    const b = await invite('b@test.de', 'Bea');
    const bId = await idOf(b);
    expect((await req('DELETE', `/api/admin/users/${bId}`, a, { name: 'Falsch' })).status).toBe(
      400,
    );
    expect((await req('DELETE', `/api/admin/users/${bId}`, a, { name: 'Bea' })).status).toBe(204);
    expect((await req<U[]>('GET', '/api/admin/users', a)).data.map((u) => u.name)).toEqual(['A']);
    expect(
      (await req<{ action: string }[]>('GET', '/api/admin/audit', a)).data.map((r) => r.action),
    ).toContain(`DELETE /api/admin/users/${bId}`);
  });

  it('Konto selbst löschen', async () => {
    const b = await invite('b@test.de', 'Bea');
    expect((await req('DELETE', '/api/me', b)).status).toBe(204);
    expect((await req<U[]>('GET', '/api/admin/users', a)).data.map((u) => u.name)).toEqual(['A']);
  });
});
