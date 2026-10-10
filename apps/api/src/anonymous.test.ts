// Ohne Anmeldung: jede Route außer den ausdrücklich öffentlichen antwortet 401, nie mit Daten.
// Jede API-Antwort ist nicht cachebar. FK_E2E ist in Produktion verboten.
import { createDb, type DbHandle } from '@fokus/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, isPublicApi } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite:memory',
  PUBLIC_URL: 'https://fokus.test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  SETUP_CODE: 'richtiger-code',
});
const ID = '00000000-0000-4000-8000-000000000001';
let h: DbHandle;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  app = createApp({ db: h.db, auth: createAuth(h.db, env, { send: async () => {} }), env });
});
afterAll(() => h.close());

describe('Ohne Anmeldung', () => {
  it('jede nicht öffentliche Route: 401, ohne Daten; alle Antworten no-store', async () => {
    const routes = app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/'));
    expect(routes.length).toBeGreaterThan(50);
    const leaks: string[] = [];
    for (const r of routes) {
      const path = r.path.replace(/:[a-zA-Z]+/g, ID).replace('*', 'x');
      const res = await app.request(path, {
        method: r.method,
        headers: { 'content-type': 'application/json' },
        body: r.method === 'GET' ? undefined : '{}',
      });
      const label = `${r.method} ${r.path}`;
      if (!path.startsWith('/api/seo/'))
        expect(res.headers.get('cache-control'), label).toBe('no-store');
      if (isPublicApi(r.method, path, false)) {
        expect(res.status, label).toBeLessThan(500);
        continue;
      }
      if (res.status !== 401) leaks.push(`${res.status} ${label}`);
      else expect(await res.json(), label).toEqual({ error: 'Nicht angemeldet.' });
    }
    expect(leaks).toEqual([]);
  });

  it('öffentlich ist nur, was dazu gehört', () => {
    expect(isPublicApi('GET', '/api/notify', false)).toBe(false);
    expect(isPublicApi('GET', '/api/me', false)).toBe(false);
    expect(isPublicApi('GET', '/api/e2e/mails', false)).toBe(false);
    expect(isPublicApi('GET', '/api/e2e/mails', true)).toBe(true);
    expect(isPublicApi('POST', '/api/register', false)).toBe(true);
    expect(isPublicApi('GET', '/api/register', false)).toBe(false);
  });

  it('FK_E2E in Produktion: Start bricht ab', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://x@y/z',
        PUBLIC_URL: 'https://fokus.test',
        BETTER_AUTH_SECRET: 'x'.repeat(40),
        SETUP_CODE: 'richtiger-code',
        SMTP_HOST: 'smtp.example',
        FK_E2E: '1',
      }),
    ).toThrow(/FK_E2E/);
  });
});
