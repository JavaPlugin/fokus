import { appSettings, createDb, user, type DbHandle } from '@fokus/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';
import { purgeUnverified, SURGE_PER_HOUR } from './signup';

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
let ip = 0;

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({ db: h.db, auth: createAuth(h.db, env, mailer), env, mailer });
  // Admin einrichten, Registrierung öffnen
  await post('/api/setup/admin', { code: 'richtiger-code', email: 'admin@test.de', name: 'Admin' });
  await h.db.update(user).set({ emailVerified: true }).where(eq(user.email, 'admin@test.de'));
  await h.db
    .insert(appSettings)
    .values({ id: 1, setupCompleted: true, registrationMode: 'open' })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { setupCompleted: true, registrationMode: 'open' },
    });
  outbox = [];
});
afterEach(() => h.close());

function post(path: string, body: unknown, from = `10.0.0.${++ip}`) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': from },
    body: JSON.stringify(body),
  });
}
const register = (email: string, extra: object = {}, from?: string) =>
  post(
    '/api/register',
    { acceptTerms: true, email, name: 'Neu', startedAt: Date.now() - 10_000, ...extra },
    from,
  );
const users = async () => (await h.db.select({ email: user.email }).from(user)).map((u) => u.email);

describe('Registrierung für einen öffentlichen Dienst', () => {
  it('normal: Konto unbestätigt, Anmeldelink per Mail', async () => {
    expect((await register('neu@test.de')).status).toBe(204);
    const [u] = await h.db.select().from(user).where(eq(user.email, 'neu@test.de'));
    expect(u?.emailVerified).toBe(false);
    expect(outbox.map((m) => m.to)).toEqual(['neu@test.de']);
  });

  it('nur mit akzeptierten Nutzungsbedingungen, Zeitpunkt gespeichert', async () => {
    const r = await post('/api/register', {
      email: 'ohne@test.de',
      name: 'Neu',
      startedAt: Date.now() - 10_000,
    });
    expect(r.status).toBe(400);
    expect(await users()).not.toContain('ohne@test.de');
    await register('mit@test.de');
    const [u] = await h.db.select().from(user).where(eq(user.email, 'mit@test.de'));
    expect(u?.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('Bots: Honeypot oder zu schnell → still nichts', async () => {
    expect((await register('bot1@test.de', { website: 'http://spam' })).status).toBe(204);
    expect((await register('bot2@test.de', { startedAt: Date.now() - 300 })).status).toBe(204);
    expect(await users()).not.toEqual(expect.arrayContaining(['bot1@test.de']));
    expect(await users()).not.toContain('bot2@test.de');
    expect(outbox).toEqual([]);
  });

  it('höchstens 3 Links pro Adresse und Tag, 5 pro IP und Stunde', async () => {
    for (let i = 0; i < 3; i++) expect((await register('viel@test.de')).status).toBe(204);
    expect((await register('viel@test.de')).status).toBe(429);
    for (let i = 0; i < 5; i++)
      expect((await register(`ip${i}@test.de`, {}, '9.9.9.9')).status).toBe(204);
    expect((await register('ip5@test.de', {}, '9.9.9.9')).status).toBe(429);
  });

  it('Massen-Anmeldung: automatisch „Nur Einladung“ und Hinweis an die Admins', async () => {
    await h.db
      .insert(user)
      .values(
        Array.from({ length: SURGE_PER_HOUR }, (_, i) => ({ email: `m${i}@test.de`, name: 'M' })),
      );
    expect((await register('spaet@test.de')).status).toBe(403);
    const [s] = await h.db.select().from(appSettings);
    expect(s?.registrationMode).toBe('invite');
    expect(outbox.map((m) => [m.to, m.subject])).toEqual([
      ['admin@test.de', 'FOKUS: Registrierung automatisch geschlossen'],
    ]);
    expect((await register('noch@test.de')).status).toBe(403);
  });

  it('unbestätigte Konten verschwinden nach 24 Stunden, bestätigte und Admins bleiben', async () => {
    await register('nie@test.de');
    await register('ja@test.de');
    await h.db.update(user).set({ emailVerified: true }).where(eq(user.email, 'ja@test.de'));
    expect(await purgeUnverified(h.db, new Date(Date.now() + 23 * 3600_000))).toBe(0);
    expect(await purgeUnverified(h.db, new Date(Date.now() + 25 * 3600_000))).toBe(1);
    expect((await users()).sort()).toEqual(['admin@test.de', 'ja@test.de']);
  });
});
