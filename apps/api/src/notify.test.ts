import { createDb, emailTemplateVersion, user, type DbHandle } from '@fokus/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';
import { renderMail } from './mail-templates';
import { berlin, createNotifier, createReminderJob } from './notify';
import { createPush } from './push';

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
let pushed: { endpoint: string; payload: string }[];
let cookie: string;
let userId: string;

const req = async (method: string, path: string, body?: unknown, c = cookie) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie: c },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as never };
};

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  pushed = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({
    db: h.db,
    auth: createAuth(h.db, env, mailer),
    env,
    mailer,
    pushSend: async (s, payload) => void pushed.push({ endpoint: s.endpoint, payload }),
  });
  await req(
    'POST',
    '/api/setup/admin',
    { code: 'richtiger-code', email: 'a@test.de', name: 'A' },
    '',
  );
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  userId = ((await req('GET', '/api/me')).data as { id: string }).id;
  outbox = [];
});
afterEach(() => h.close());

/** Notifier und Job wie im Server, mit abgefangenem Versand. */
function setup(updates: { version: string; current: string } | null = null) {
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  const push = createPush(
    h.db,
    env.PUBLIC_URL,
    async (s, payload) => void pushed.push({ endpoint: s.endpoint, payload }),
  );
  const notifier = createNotifier({ db: h.db, mailer, push, publicUrl: env.PUBLIC_URL });
  return { notifier, job: createReminderJob(notifier, async () => updates) };
}

describe('Benachrichtigungen', () => {
  it('rechnet in Berliner Zeit', () => {
    expect(berlin(new Date('2026-10-30T07:59:00Z'))).toEqual({ day: '2026-10-30', hour: 8 });
    expect(berlin(new Date('2026-07-30T07:05:00Z'))).toEqual({ day: '2026-07-30', hour: 9 });
    expect(berlin(new Date('2026-10-30T23:30:00Z'))).toEqual({ day: '2026-10-31', hour: 0 });
  });

  it('täglicher Lauf: erst ab 9 Uhr, einmal pro Tag', async () => {
    const { job } = setup();
    expect(await job.run(new Date('2026-10-30T07:59:00Z'))).toBe(false);
    expect(await job.run(new Date('2026-10-30T08:05:00Z'))).toBe(true);
    expect(await job.run(new Date('2026-10-30T10:00:00Z'))).toBe(false);
    expect(await job.run(new Date('2026-10-31T08:05:00Z'))).toBe(true);
  });

  it('neue Version: Admins bekommen genau eine Mail', async () => {
    const { job } = setup({ version: 'v0.2.0', current: 'v0.1.0' });
    await job.run(new Date('2026-10-30T08:05:00Z'));
    await job.run(new Date('2026-10-31T08:05:00Z'));
    expect(outbox.map((m) => [m.to, m.subject])).toEqual([['a@test.de', 'FOKUS v0.2.0 ist da']]);
  });

  it('richtet sich nach Kanal und Schaltern', async () => {
    await req('POST', '/api/push/subscription', {
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'k', auth: 'x' },
    });
    await req('PUT', '/api/notify', { channel: 'app', focus: true, social: false, recap: true });
    expect((await req('GET', '/api/notify')).data).toMatchObject({
      prefs: { channel: 'app', social: false },
    });
    const { notifier } = setup();
    const msg = {
      push: { title: 'Fokus', body: 'Gleich geht es los', url: '/' },
      mail: (to: string) => ({ to, subject: 'Fokus', text: 'x' }),
    };
    expect(await notifier.send(userId, 'focus', msg, 'a')).toBe(true);
    // Gleicher Schlüssel: nur einmal
    expect(await notifier.send(userId, 'focus', msg, 'a')).toBe(false);
    // Social aus
    expect(await notifier.send(userId, 'social', msg, 'b')).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(outbox).toEqual([]);
    expect(pushed).toHaveLength(1);
  });

  it('„Test senden“ geht über den gewählten Kanal', async () => {
    await req('PUT', '/api/notify', { channel: 'email', focus: true, social: true, recap: true });
    expect((await req('POST', '/api/notify/test')).status).toBe(204);
    expect(outbox.at(-1)!.subject).toBe('Test von FOKUS');
  });
});

describe('E-Mail-Vorlagen', () => {
  it('HTML und Text-Version, große Zahl mit grauem Zusatz', () => {
    const m = renderMail({
      preheader: 'p',
      title: 'Steuererklärung beginnt',
      hero: { big: '50', small: 'Min.' },
      rows: [['Beginn', '09:30 Uhr']],
      warning: 'Achtung',
      button: { label: 'Öffnen', url: 'https://x.test/' },
      footer: 'Fuß',
    });
    expect(m.html).toContain('50<span style="color:#8e8e93">&nbsp;Min.</span>');
    expect(m.html).toContain('prefers-color-scheme: dark');
    expect(m.text).toContain('Steuererklärung beginnt');
    expect(m.text).toContain('50 Min.');
    expect(m.text).toContain('Öffnen: https://x.test/');
  });

  it('Vorlagen bearbeiten: Platzhalter, Escaping, Vorschau, Versand, Zurücksetzen, Versionen', async () => {
    type List = { templates: { key: string; fields: Record<string, string>; custom: boolean }[] };
    const list = (await req('GET', '/api/admin/email-templates')).data as List;
    expect(list.templates.map((t) => t.key)).toEqual([
      'erinnerung',
      'rueckblick',
      'anmeldung',
      'einladung',
      'update',
    ]);
    const base = list.templates.find((t) => t.key === 'erinnerung')!.fields;

    // Unbekannter Platzhalter → 400 mit Feld
    const bad = await req('PUT', '/api/admin/email-templates/erinnerung', {
      fields: { ...base, betreff: '{{name}} {{split}}' },
    });
    expect(bad.status).toBe(400);
    expect((bad.data as { placeholders: object }).placeholders).toEqual({ betreff: ['split'] });

    // Vorschau: ersetzt und escaped, dunkel erzwingbar
    const pv = await req('POST', '/api/admin/email-templates/erinnerung/preview', {
      fields: { ...base, ueberschrift: '<b>{{name}}</b> kommt' },
      dark: true,
    });
    const p = pv.data as { subject: string; html: string };
    expect(p.html).toContain('&lt;b&gt;Steuererklärung&lt;/b&gt; kommt');
    expect(p.html).toContain('@media all {');
    expect(p.subject).toBe('Steuererklärung in 5 Min. · 09:30 Uhr');

    // Anmeldelink nutzt gesicherte Texte
    const an = list.templates.find((t) => t.key === 'anmeldung')!.fields;
    await req('PUT', '/api/admin/email-templates/anmeldung', {
      fields: { ...an, betreff: 'Hier ist dein Link' },
    });
    outbox = [];
    await req('POST', '/api/auth/sign-in/magic-link', { email: 'a@test.de' });
    expect(outbox.at(-1)?.subject).toBe('Hier ist dein Link');

    // Testmail mit ungesicherten Texten an die eigene Adresse
    outbox = [];
    const t = await req('POST', '/api/admin/email-templates/update/test', {
      fields: {
        ...list.templates.find((x) => x.key === 'update')!.fields,
        betreff: 'Neu: {{version}}',
      },
    });
    expect(t.status).toBe(204);
    expect(outbox.map((m) => [m.to, m.subject])).toEqual([['a@test.de', 'Neu: v0.14.0']]);

    // Höchstens 10 Versionen
    const rb = list.templates.find((x) => x.key === 'rueckblick')!.fields;
    for (let i = 0; i < 12; i++)
      await req('PUT', '/api/admin/email-templates/rueckblick', {
        fields: { ...rb, fusszeile: `Fuß ${i}` },
      });
    const versions = await h.db.select().from(emailTemplateVersion);
    expect(versions.filter((v) => v.key === 'rueckblick')).toHaveLength(10);

    // Zurücksetzen
    const reset = await req('DELETE', '/api/admin/email-templates/rueckblick');
    expect((reset.data as { fields: Record<string, string> }).fields).toEqual(rb);
    const after = (await req('GET', '/api/admin/email-templates')).data as List;
    expect(after.templates.find((x) => x.key === 'rueckblick')!.custom).toBe(false);
    await req('DELETE', '/api/admin/email-templates/anmeldung');
  });

  it('Vorlagen nur für Admins', async () => {
    expect((await req('GET', '/api/admin/email-templates', undefined, '')).status).toBe(401);
    await h.db.update(user).set({ role: 'user' }).where(eq(user.id, userId));
    expect((await req('GET', '/api/admin/email-templates')).status).toBe(403);
    expect(
      (await req('POST', '/api/admin/email-templates/anmeldung/test', { fields: {} })).status,
    ).toBe(403);
  });
});
