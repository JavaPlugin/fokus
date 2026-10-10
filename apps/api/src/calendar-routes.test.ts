import { addDays, clock, dayInZone, todayIn } from '@fokus/core';
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
let cookie: string;
let ics = '';
let status = 200;
const fetched: string[] = [];

const calendarFetch = (async (url: string) => {
  fetched.push(url);
  if (url.includes('weiter'))
    return new Response(null, {
      status: 302,
      headers: { location: 'https://cal.example/echt.ics' },
    });
  if (url.includes('heimnetz'))
    return new Response(null, {
      status: 302,
      headers: { location: 'https://rebind.example/x.ics' },
    });
  return new Response(ics, { status });
}) as unknown as typeof fetch;
const resolve = async (host: string) =>
  host === 'rebind.example' ? ['192.168.1.5'] : ['93.184.216.34'];

const req = async <T = never>(method: string, path: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};

const compact = (d: string) => d.replace(/-/g, '');
const calendar = (uid: string, day: string, from: string, to: string, title: string) =>
  `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;TZID=Europe/Berlin:${compact(day)}T${from}00\r\nDTEND;TZID=Europe/Berlin:${compact(day)}T${to}00\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
const wrap = (...ev: string[]) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${ev.join('')}END:VCALENDAR\r\n`;

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  fetched.length = 0;
  status = 200;
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({
    db: h.db,
    auth: createAuth(h.db, env, mailer),
    env,
    mailer,
    calendarFetch,
    webhookResolve: resolve,
  });
  await req('POST', '/api/setup/admin', { code: 'richtiger-code', email: 'a@test.de', name: 'A' });
  cookie = '';
  await app.request('/api/setup/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'richtiger-code', email: 'a@test.de', name: 'A' }),
  });
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
});
afterEach(() => h.close());

type Block = {
  id: string;
  kind: string;
  startsAt: string;
  minutes: number;
  title: string;
  source: string;
};
const day = () => addDays(todayIn(), 1);

describe('Kalender-Abo', () => {
  it('Termine kommen als belegte Blöcke, der Plan weicht aus, Änderungen im Kalender folgen', async () => {
    ics = wrap(
      calendar('a', day(), '0930', '1030', 'Zahnarzt'),
      calendar('b', day(), '1400', '1430', 'Call'),
    );
    const add = await req<{ id: string; name: string; lastError: string | null; url?: string }>(
      'POST',
      '/api/calendar',
      {
        name: 'Privat',
        url: 'webcal://cal.example/privat.ics?key=geheim',
      },
    );
    expect(add.status).toBe(201);
    expect(add.data).toMatchObject({ name: 'Privat', lastError: null });
    expect(add.data.url).toBeUndefined();
    expect(JSON.stringify((await req('GET', '/api/calendar')).data)).not.toContain('geheim');
    expect(fetched[0]).toBe('https://cal.example/privat.ics?key=geheim');

    const o = await req<{ blocks: Block[] }>('GET', `/api/day/${day()}`);
    expect(
      o.data.blocks.map((b) => `${clock(b.startsAt)} ${b.kind} ${b.minutes} ${b.title}`),
    ).toEqual(['09:30 event 60 Zahnarzt', '14:00 event 30 Call']);

    // Plan läuft um Termine herum
    await req('POST', '/api/tasks', { title: 'Konzept', minutes: 60 });
    const plan = await req<{ blocks: Block[] }>('POST', `/api/plan/${day()}`);
    expect(plan.data.blocks.map((b) => `${clock(b.startsAt)} ${b.minutes}`)).toEqual([
      '09:00 30',
      '10:30 30',
    ]);

    // Kalender ändert sich: Zahnarzt weg, Call später; Abgleich ersetzt (kein Doppeltes)
    ics = wrap(calendar('b', day(), '1500', '1530', 'Call'));
    const sync = await req<{ synced: number }>('POST', '/api/calendar/sync?force=1');
    expect(sync.data.synced).toBe(1);
    const after = await req<{ blocks: Block[] }>('GET', `/api/day/${day()}`);
    const events = after.data.blocks.filter((b) => b.kind === 'event');
    expect(events.map((b) => `${clock(b.startsAt)} ${b.title}`)).toEqual(['15:00 Call']);

    // Pause: ohne force kein neuer Abruf
    const n = fetched.length;
    expect((await req<{ synced: number }>('POST', '/api/calendar/sync')).data.synced).toBe(0);
    expect(fetched.length).toBe(n);

    // Abo löschen nimmt die Termine mit
    expect((await req('DELETE', `/api/calendar/${add.data.id}`)).status).toBe(204);
    const gone = await req<{ blocks: Block[] }>('GET', `/api/day/${day()}`);
    expect(gone.data.blocks.filter((b) => b.kind === 'event')).toEqual([]);
    expect(dayInZone(new Date())).toBe(todayIn());
  });

  it('Fehler und Schutz: HTTP, Heimnetz, Weiterleitung ins Heimnetz, keine ICS, Serverfehler', async () => {
    const bad = (url: string) =>
      req<{ error: string }>('POST', '/api/calendar', { name: 'x', url });
    expect((await bad('http://cal.example/a.ics')).status).toBe(400);
    expect((await bad('https://192.168.1.5/a.ics')).data.error).toMatch(/Heimnetz/);
    expect((await bad('https://rebind.example/a.ics')).data.error).toMatch(/Heimnetz/);
    expect(
      (await req('POST', '/api/calendar', { name: '', url: 'https://cal.example/a.ics' })).status,
    ).toBe(400);

    // Weiterleitung auf eine private Adresse: Abo entsteht, Abgleich meldet den Fehler
    const r = await req<{ lastError: string }>('POST', '/api/calendar', {
      name: 'x',
      url: 'https://cal.example/heimnetz.ics',
    });
    expect(r.data.lastError).toMatch(/Heimnetz/);

    ics = 'Das ist keine Kalender-Datei';
    const n = await req<{ lastError: string }>('POST', '/api/calendar', {
      name: 'y',
      url: 'https://cal.example/b.ics',
    });
    expect(n.data.lastError).toMatch(/keine Kalender-Adresse/);
    ics = wrap(calendar('z', day(), '1000', '1100', 'Ok'));
    status = 500;
    const e = await req<{ lastError: string }>('POST', '/api/calendar', {
      name: 'z',
      url: 'https://cal.example/c.ics',
    });
    expect(e.data.lastError).toMatch(/500/);

    // Gute Weiterleitung klappt
    status = 200;
    const ok = await req<{ lastError: string | null }>('POST', '/api/calendar', {
      name: 'w',
      url: 'https://cal.example/weiter.ics',
    });
    expect(ok.data.lastError).toBeNull();
  });
});
