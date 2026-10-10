import { apiKey, createDb, type DbHandle } from '@fokus/db';
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
let cookie: string;

const req = async <T = never>(method: string, path: string, body?: unknown, headers = {}) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};
/** Aufruf nur mit Schlüssel (ohne Sitzung), wie ein Kurzbefehl. */
const v1 = async <T = { ok: boolean }>(key: string | null, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({ db: h.db, auth: createAuth(h.db, env, mailer), env, mailer });
  cookie = '';
  await req('POST', '/api/setup/admin', { code: 'richtiger-code', email: 'a@test.de', name: 'A' });
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
});
afterEach(() => h.close());

describe('API-Schlüssel', () => {
  it('anlegen (nur einmal sichtbar), auflisten ohne Klartext, widerrufen', async () => {
    const r = await req<{ key: string; keys: { id: string; prefix: string; name: string }[] }>(
      'POST',
      '/api/me/keys',
      { name: 'Kurzbefehl' },
    );
    expect(r.status).toBe(201);
    expect(r.data.key).toMatch(/^fk_[A-Za-z0-9_-]{32}$/);
    expect(r.data.keys[0]).toMatchObject({ name: 'Kurzbefehl', prefix: r.data.key.slice(0, 9) });
    expect(JSON.stringify((await req('GET', '/api/me/keys')).data)).not.toContain(r.data.key);
    expect((await v1(r.data.key, '/api/v1/ping')).status).toBe(200);
    await req('DELETE', `/api/me/keys/${r.data.keys[0]!.id}`);
    expect((await v1(r.data.key, '/api/v1/ping')).status).toBe(401);
    expect((await req('GET', '/api/me/keys')).data).toEqual([]);
  });

  it('ohne, mit falschem Schlüssel oder ohne Recht: 401/403', async () => {
    expect((await v1(null, '/api/v1/ping')).status).toBe(401);
    expect((await v1('fk_' + 'x'.repeat(32), '/api/v1/ping')).status).toBe(401);
    // Schlüssel ohne das Recht (z. B. nach Wegfall eines Rechts): 403
    const r = await req<{ key: string }>('POST', '/api/me/keys', { name: 'Alt' });
    await h.db.update(apiKey).set({ scopes: [] });
    expect((await v1(r.data.key, '/api/v1/ping')).status).toBe(403);
    expect(
      (await req('POST', '/api/me/keys', { name: 'x', scopes: ['summary:read'] })).status,
    ).toBe(400);
    expect((await req('POST', '/api/me/keys', { name: 'x', scopes: ['alles'] })).status).toBe(400);
  });

  it('fremde Schlüssel sieht und widerruft man nicht', async () => {
    const r = await req<{ keys: { id: string }[] }>('POST', '/api/me/keys', { name: 'A' });
    const cookieA = cookie;
    cookie = '';
    expect((await req('GET', '/api/me/keys')).status).toBe(401);
    cookie = cookieA;
    expect((await req('DELETE', `/api/me/keys/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await req('GET', '/api/me/keys')).data).toHaveLength(r.data.keys.length);
  });
});

describe('/api/v1', () => {
  it('Ping mit gültigem Schlüssel', async () => {
    const key = (await req<{ key: string }>('POST', '/api/me/keys', { name: 'Kurzbefehl' })).data
      .key;
    expect((await v1(key, '/api/v1/ping')).status).toBe(200);
  });
});
