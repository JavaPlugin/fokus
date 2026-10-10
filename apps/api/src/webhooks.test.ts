import { createHmac } from 'node:crypto';
import { createDb, user, webhookDelivery, withAdmin, type DbHandle } from '@fokus/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { emitEvent } from './events';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';
import { checkTarget, createWebhooks, isPrivateIp, type Resolve } from './webhooks';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite:memory',
  PUBLIC_URL: 'https://fokus.test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  SETUP_CODE: 'richtiger-code',
});

/** Unechtes DNS: *.example → öffentlich, rebind.example → privat. */
const resolve: Resolve = async (host) =>
  host === 'rebind.example' ? ['192.168.1.20'] : host.endsWith('.example') ? ['93.184.216.34'] : [];

let h: DbHandle;
let app: ReturnType<typeof createApp>;
let outbox: Mail[];
let sent: { url: string; headers: Record<string, string>; body: string }[];
let reply = 200;
let cookie: string;
let userId: string;

const fetchFn = (async (url: string, init: RequestInit) => {
  sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
  return new Response(null, { status: reply });
}) as unknown as typeof fetch;

const req = async <T = never>(method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};
const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  sent = [];
  reply = 200;
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({
    db: h.db,
    auth: createAuth(h.db, env, mailer),
    env,
    mailer,
    webhookFetch: fetchFn,
    webhookResolve: resolve,
  });
  cookie = '';
  await req('POST', '/api/setup/admin', { code: 'richtiger-code', email: 'a@test.de', name: 'A' });
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  userId = (await req<{ id: string }>('GET', '/api/me')).data.id;
});
afterEach(() => h.close());

describe('Webhook-Ziele', () => {
  it('private Adressen erkennen', () => {
    const priv = ['10.0.0.1', '127.0.0.1', '192.168.178.1', '172.20.1.1', '169.254.1.1'];
    for (const ip of [...priv, '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.1.2.3'])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700::1111', '172.32.0.1'])
      expect(isPrivateIp(ip), ip).toBe(false);
  });

  it('nur HTTPS öffentlich; Heimnetz und http nur für Admins; DNS auf privat zählt als privat', async () => {
    const no = (u: string) => checkTarget(u, false, resolve);
    expect(await no('https://hook.example/x')).toBeNull();
    expect(await no('http://hook.example/x')).toMatch(/HTTPS/);
    expect(await no('https://192.168.1.5/x')).toMatch(/Heimnetz/);
    expect(await no('https://localhost/x')).toMatch(/Heimnetz/);
    expect(await no('https://ha.local/x')).toMatch(/Heimnetz/);
    expect(await no('https://rebind.example/x')).toMatch(/Heimnetz/);
    expect(await no('https://user:pw@hook.example/x')).toMatch(/Zugangsdaten/);
    expect(await checkTarget('http://192.168.1.5:8123/api/webhook/kb', true, resolve)).toBeNull();
    expect(await checkTarget('ftp://hook.example', true, resolve)).toMatch(/HTTPS/);
  });
});

describe('Webhooks', () => {
  it('Fokus-Start → signierte Zustellung; Test-Ping; Zustellungen sichtbar', async () => {
    const r = await req<{ secret: string; webhooks: { id: string }[] }>(
      'POST',
      '/api/me/webhooks',
      { url: 'https://hook.example/kb', events: ['focus.started'] },
    );
    expect(r.status).toBe(201);
    expect(r.data.secret).toMatch(/^whsec_/);
    emitEvent(userId, 'focus.started', { title: 'Steuererklärung', minutes: 50 });
    await settle();
    expect(sent).toHaveLength(1);
    const s = sent[0]!;
    expect(s.url).toBe('https://hook.example/kb');
    expect(s.headers['x-fokus-event']).toBe('focus.started');
    const sig = `sha256=${createHmac('sha256', r.data.secret).update(s.body).digest('hex')}`;
    expect(s.headers['x-fokus-signature']).toBe(sig);
    expect(JSON.parse(s.body)).toMatchObject({
      event: 'focus.started',
      data: { title: 'Steuererklärung', minutes: 50 },
    });
    await req('POST', `/api/me/webhooks/${r.data.webhooks[0]!.id}/test`);
    expect(sent.map((x) => x.headers['x-fokus-event'])).toEqual(['focus.started', 'ping']);
    const list = await req<{ deliveries: { status: string }[] }[]>('GET', '/api/me/webhooks');
    expect(list.data[0]!.deliveries.map((d) => d.status)).toEqual(['ok', 'ok']);
  });

  it('Wiederholung nach 1 min, 10 min, 1 h, dann aufgeben', async () => {
    await req('POST', '/api/me/webhooks', {
      url: 'https://hook.example/kb',
      events: ['focus.started'],
    });
    reply = 500;
    emitEvent(userId, 'focus.started', { title: 'x' });
    await settle();
    const worker = createWebhooks({ db: h.db, fetchFn, resolve, listen: false });
    const state = async () =>
      (await withAdmin(h.db, (tx) => tx.select().from(webhookDelivery)))[0]!;
    expect(await state()).toMatchObject({ status: 'pending', attempts: 1, lastStatus: 500 });
    const t0 = Date.now();
    expect(await worker.deliverDue(new Date(t0 + 30_000))).toBe(0);
    await worker.deliverDue(new Date(t0 + 61_000));
    expect(await state()).toMatchObject({ status: 'pending', attempts: 2 });
    await worker.deliverDue(new Date(t0 + 61_000 + 10 * 60_000 + 1000));
    expect(await state()).toMatchObject({ status: 'pending', attempts: 3 });
    await worker.deliverDue(new Date(t0 + 2 * 60 * 60_000));
    expect(await state()).toMatchObject({ status: 'failed', attempts: 4 });
    expect(sent).toHaveLength(4);
  });

  it('Heimnetz nur für Admins, unbekannte Ereignisse abgelehnt', async () => {
    const lan = { url: 'http://192.168.1.5:8123/api/webhook/kb', events: ['focus.started'] };
    expect((await req('POST', '/api/me/webhooks', lan)).status).toBe(201);
    await h.db.update(user).set({ role: 'user' }).where(eq(user.id, userId));
    expect((await req('POST', '/api/me/webhooks', lan)).status).toBe(400);
    const odd = { url: 'https://hook.example/a', events: ['x'] };
    expect((await req('POST', '/api/me/webhooks', odd)).status).toBe(400);
  });
});
