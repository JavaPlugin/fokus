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
  const auth = createAuth(h.db, env, { send: async (m) => void outbox.push(m) });
  app = createApp({ db: h.db, auth, env });
});
afterEach(() => h.close());

const json = (method: string, path: string, body: unknown, cookie?: string) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

/** Öffnet den Link aus der letzten Mail und liefert das Session-Cookie. */
async function clickMagicLink(): Promise<string> {
  const mail = outbox.at(-1);
  if (!mail) throw new Error('keine Mail');
  const link = mail.text.match(/https?:\/\/\S+/)![0];
  const url = new URL(link);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  expect([200, 302]).toContain(res.status);
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  expect(cookies.join(';')).toContain('session_token');
  return cookies.join('; ');
}

async function setupAdmin(): Promise<string> {
  const r = await json('POST', '/api/setup/admin', {
    code: 'richtiger-code',
    email: 'Niko@Example.de',
    name: 'Niko',
  });
  expect(r.status).toBe(204);
  return clickMagicLink();
}

describe('health', () => {
  it('meldet ok, Version und Migrationsstand', async () => {
    const r = await app.request('/health');
    expect(r.status).toBe(200);
    const b = (await r.json()) as {
      status: string;
      migrations: { applied: number; expected: number };
    };
    expect(b.status).toBe('ok');
    expect(b.migrations.applied).toBe(b.migrations.expected);
  });
});

describe('Einrichtungs-Assistent', () => {
  it('lehnt einen falschen Setup-Code ab', async () => {
    const r = await json('POST', '/api/setup/verify', { code: 'falsch' });
    expect(r.status).toBe(403);
    const r2 = await json('POST', '/api/setup/admin', {
      code: 'falsch',
      email: 'a@b.de',
      name: 'A',
    });
    expect(r2.status).toBe(403);
    expect(outbox).toHaveLength(0);
  });

  it('bremst nach 10 Fehlversuchen', async () => {
    for (let i = 0; i < 10; i++) await json('POST', '/api/setup/verify', { code: 'falsch' });
    const r = await json('POST', '/api/setup/verify', { code: 'richtiger-code' });
    expect(r.status).toBe(429);
  });

  it('prüft die Adresse', async () => {
    const r = await app.request('/api/setup/status', {
      headers: { host: 'fokus.test', 'x-forwarded-proto': 'https' },
    });
    expect(await r.json()).toMatchObject({ setupCompleted: false, hostMatches: true, https: true });
  });

  it('legt den Admin an, meldet per Link an und schließt ab', async () => {
    const cookie = await setupAdmin();
    expect(outbox[0]!.to).toBe('niko@example.de');

    const me = await (await app.request('/api/me', { headers: { cookie } })).json();
    expect(me).toMatchObject({ email: 'niko@example.de', role: 'admin' });

    // Abschließen braucht Code UND Admin-Sitzung
    expect((await json('POST', '/api/setup/complete', { code: 'richtiger-code' })).status).toBe(
      401,
    );
    expect(
      (await json('POST', '/api/setup/complete', { code: 'richtiger-code' }, cookie)).status,
    ).toBe(204);

    // Danach sind alle Setup-Endpunkte gesperrt
    expect((await json('POST', '/api/setup/verify', { code: 'richtiger-code' })).status).toBe(410);
    expect(
      (
        await json('POST', '/api/setup/admin', {
          code: 'richtiger-code',
          email: 'x@y.de',
          name: 'X',
        })
      ).status,
    ).toBe(410);
  });
});

describe('Registrierung', () => {
  it('erlaubt keine Anmeldung unbekannter Adressen per Magic Link', async () => {
    const r = await json('POST', '/api/auth/sign-in/magic-link', { email: 'fremd@example.de' });
    expect(outbox).toHaveLength(0);
    expect(r.status).toBeLessThan(500);
  });

  it('lehnt Registrierung ohne Einladung ab', async () => {
    const r = await json('POST', '/api/register', {
      acceptTerms: true,
      email: 'neu@example.de',
      name: 'Neu',
    });
    expect(r.status).toBe(403);
  });

  it('nimmt eine Einladung genau einmal an', async () => {
    const admin = await setupAdmin();
    await json('POST', '/api/setup/complete', { code: 'richtiger-code' }, admin);

    const inv = await json('POST', '/api/admin/invites', {}, admin);
    expect(inv.status).toBe(201);
    const token = new URL(((await inv.json()) as { url: string }).url).searchParams.get('token');

    const ok = await json('POST', '/api/invites/accept', {
      acceptTerms: true,
      token,
      email: 'lena@example.de',
      name: 'Lena',
    });
    expect(ok.status).toBe(204);
    const lena = await clickMagicLink();
    const me = await (await app.request('/api/me', { headers: { cookie: lena } })).json();
    expect(me).toMatchObject({ email: 'lena@example.de', role: 'user' });

    const again = await json('POST', '/api/invites/accept', {
      acceptTerms: true,
      token,
      email: 'max@example.de',
      name: 'Max',
    });
    expect(again.status).toBe(404);

    // Normale Nutzer dürfen keine Einladungen erzeugen
    expect((await json('POST', '/api/admin/invites', {}, lena)).status).toBe(403);
  });
});

describe('Konto löschen', () => {
  it('schützt den letzten Admin und löscht normale Nutzer samt Sitzung', async () => {
    const admin = await setupAdmin();
    expect(
      (await app.request('/api/me', { method: 'DELETE', headers: { cookie: admin } })).status,
    ).toBe(409);

    await json('POST', '/api/setup/complete', { code: 'richtiger-code' }, admin);
    const inv = (await (await json('POST', '/api/admin/invites', {}, admin)).json()) as {
      url: string;
    };
    const token = new URL(inv.url).searchParams.get('token');
    await json('POST', '/api/invites/accept', {
      acceptTerms: true,
      token,
      email: 'max@example.de',
      name: 'Max',
    });
    const max = await clickMagicLink();

    expect(
      (await app.request('/api/me', { method: 'DELETE', headers: { cookie: max } })).status,
    ).toBe(204);
    expect((await app.request('/api/me', { headers: { cookie: max } })).status).toBe(401);
  });
});

describe('Öffentlich', () => {
  it('zeigt Impressumsangaben und Registrierungsmodus ohne Anmeldung', async () => {
    const admin = await setupAdmin();
    const legal = { name: 'Niko Muster', address: 'Weg 1\n12345 Ort', email: 'kontakt@example.de' };
    const put = await json(
      'PUT',
      '/api/admin/settings',
      { legal, registrationMode: 'open' },
      admin,
    );
    expect(put.status).toBe(204);
    const s = (await (await app.request('/api/setup/status')).json()) as Record<string, unknown>;
    expect(s).toMatchObject({ registrationMode: 'open', legal });
  });

  it('bremst offene Registrierungen nach 5 je Stunde', async () => {
    const admin = await setupAdmin();
    await json('PUT', '/api/admin/settings', { registrationMode: 'open' }, admin);
    await json('POST', '/api/setup/complete', { code: 'richtiger-code' }, admin);
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push(
        (
          await json('POST', '/api/register', {
            acceptTerms: true,
            email: `n${i}@example.de`,
            name: 'N',
          })
        ).status,
      );
    expect(codes).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it('exportiert die eigenen Daten als Datei', async () => {
    const admin = await setupAdmin();
    const r = await app.request('/api/me/export', { headers: { cookie: admin } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="fokus-/);
    const b = (await r.json()) as { format: string; data: { settings: unknown[] } };
    expect(b.format).toBe('fokus');
    expect(b.data.settings).toEqual([]);
    expect((await app.request('/api/me/export')).status).toBe(401);
  });
});
