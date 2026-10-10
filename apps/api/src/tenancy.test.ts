// Mandantentrennung: Nutzer B kommt mit keiner Anfrage an Daten von Nutzer A heran, auch nicht
// mit As IDs. Jede Antwort an B ist ein Fehler oder enthält nichts von A; As Daten bleiben gleich.
// Neue Fachdaten (Aufgaben, Blöcke …) bringen ihre Angriffe in `attacks` und ihre Lesewege in `reads` mit.
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
  app = createApp({
    db: h.db,
    auth: createAuth(h.db, env, mailer),
    env,
    mailer,
    webhookFetch: (async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
    webhookResolve: async () => ['93.184.216.34'],
  });
});
afterEach(() => h.close());

const req = async <T = never>(method: string, path: string, cookie: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text(), json: () => null as T };
};
const json = async <T>(method: string, path: string, cookie: string, body?: unknown) =>
  JSON.parse((await req(method, path, cookie, body)).text) as T;

async function login(): Promise<string> {
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function twoUsers() {
  await req('POST', '/api/setup/admin', '', {
    code: 'richtiger-code',
    email: 'a@test.de',
    name: 'A',
  });
  const a = await login();
  await req('POST', '/api/setup/complete', a, { code: 'richtiger-code' });
  const inv = await json<{ url: string }>('POST', '/api/admin/invites', a, {});
  await req('POST', '/api/invites/accept', '', {
    acceptTerms: true,
    token: new URL(inv.url).searchParams.get('token'),
    email: 'b@test.de',
    name: 'B',
  });
  return { a, b: await login() };
}

describe('Mandantentrennung', () => {
  it('B erreicht mit As IDs nichts und sieht nichts von A', async () => {
    const { a, b } = await twoUsers();
    const key = await json<{ keys: { id: string }[] }>('POST', '/api/me/keys', a, {
      name: 'Geheim-A',
    });
    const hook = await json<{ webhooks: { id: string }[] }>('POST', '/api/me/webhooks', a, {
      url: 'https://hook.example/a',
      events: ['focus.started'],
    });
    const keysBefore = (await req('GET', '/api/me/keys', a)).text;
    const hooksBefore = (await req('GET', '/api/me/webhooks', a)).text;
    const ids = [key.keys[0]!.id, hook.webhooks[0]!.id];

    const attacks: [string, string, unknown?][] = [
      ['DELETE', `/api/me/keys/${ids[0]}`],
      ['DELETE', `/api/me/webhooks/${ids[1]}`],
      ['POST', `/api/me/webhooks/${ids[1]}/test`],
    ];
    for (const [method, path, body] of attacks) {
      const r = await req(method, path, b, body);
      expect(r.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
      expect(r.status, `${method} ${path}: kein Serverfehler`).toBeLessThan(500);
      expect(r.text, `${method} ${path}`).not.toMatch(/Geheim-A/);
    }

    // Was B liest, enthält nichts von A
    const reads = ['/api/me/keys', '/api/me/webhooks', '/api/me/export', '/api/notify'];
    for (const path of reads) {
      const r = await req('GET', path, b);
      expect(r.text, path).not.toMatch(/Geheim-A/);
      for (const id of ids) expect(r.text, path).not.toContain(id);
    }

    // Admin (A) sieht von allen nur Zählwerte, keine Inhalte
    const usage = await req('GET', '/api/admin/usage', a);
    expect(usage.status).toBe(200);
    expect(usage.text).not.toMatch(/Geheim/);
    for (const v of Object.values(JSON.parse(usage.text) as Record<string, object>))
      expect(Object.keys(v).sort()).toEqual(['lastSeen', 'tasks']);
    expect((await req('GET', '/api/admin/usage', b)).status).toBe(403);

    // As Daten unverändert
    expect((await req('GET', '/api/me/keys', a)).text).toBe(keysBefore);
    expect((await req('GET', '/api/me/webhooks', a)).text).toBe(hooksBefore);
  });
});
