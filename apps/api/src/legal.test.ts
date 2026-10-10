import { LEGAL_DEFAULTS } from '@fokus/core';
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
let a: string;

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
async function invite(email: string) {
  const inv = (await req<{ url: string }>('POST', '/api/admin/invites', a, {})).data;
  await req('POST', '/api/invites/accept', '', {
    acceptTerms: true,
    token: new URL(inv.url).searchParams.get('token'),
    email,
    name: 'B',
  });
  return login();
}
type Doc = { body: string; stand: string | null; version: number };

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
});
afterEach(() => h.close());

describe('Rechtstexte', () => {
  it('öffentlich lesbar (Standard ohne Version), nur Admins schreiben, 10 Versionen', async () => {
    const pub = await req<Doc>('GET', '/api/legal/datenschutz', '');
    expect(pub.status).toBe(200);
    expect(pub.data).toMatchObject({ body: LEGAL_DEFAULTS.datenschutz, version: 0 });
    expect((await req('GET', '/api/legal/geheim', '')).status).toBe(404);

    const b = await invite('b@test.de');
    expect((await req('PUT', '/api/admin/legal/impressum', b, { body: 'x' })).status).toBe(403);
    expect((await req('PUT', '/api/admin/legal/impressum', '', { body: 'x' })).status).toBe(401);

    for (let i = 1; i <= 12; i++) {
      const r = await req<Doc>('PUT', '/api/admin/legal/impressum', a, {
        body: `# Impressum ${i}`,
        stand: '2026-10-08',
      });
      expect(r.data.version).toBe(i);
    }
    expect((await req<Doc>('GET', '/api/legal/impressum', '')).data).toMatchObject({
      body: '# Impressum 12',
      stand: '2026-10-08',
      version: 12,
    });
    const versions = (await req<Doc[]>('GET', '/api/admin/legal/impressum/versions', a)).data;
    expect(versions.map((v) => v.version)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect((await req('GET', '/api/admin/legal/impressum/versions', b)).status).toBe(403);
    // Ohne Text geht nicht
    expect((await req('PUT', '/api/admin/legal/impressum', a, { body: '  ' })).status).toBe(400);
    const log = (await req<{ action: string }[]>('GET', '/api/admin/audit', a)).data;
    expect(log.some((r) => r.action === 'PUT /api/admin/legal/impressum')).toBe(true);
  });

  it('geänderte Nutzungsbedingungen: Hinweis für bestehende Konten bis „Gelesen“', async () => {
    const b = await invite('b@test.de');
    expect((await req('GET', '/api/me/terms', b)).data).toEqual({ version: 0, changed: false });
    await new Promise((r) => setTimeout(r, 5));
    await req('PUT', '/api/admin/legal/nutzungsbedingungen', a, { body: '## Neu' });
    expect((await req('GET', '/api/me/terms', b)).data).toEqual({ version: 1, changed: true });
    expect((await req('PUT', '/api/me/terms-seen', b)).status).toBe(204);
    expect((await req('GET', '/api/me/terms', b)).data).toEqual({ version: 1, changed: false });
    // Neues Konto nach der Änderung: kein Hinweis
    await new Promise((r) => setTimeout(r, 5));
    const c = await invite('c@test.de');
    expect((await req('GET', '/api/me/terms', c)).data).toMatchObject({ changed: false });
    expect((await req('GET', '/api/me/terms', '')).status).toBe(401);
  });
});
