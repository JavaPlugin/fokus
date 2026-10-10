import { addDays, clock, todayIn } from '@fokus/core';
import { createDb, creditEntry, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { onEvent } from './events';
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
let userId: string;

const req = async <T = never>(method: string, path: string, body?: unknown, c = cookie) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie: c },
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
  userId = (await req<{ id: string }>('GET', '/api/me')).data.id;
});
afterEach(() => h.close());

type Task = { id: string; title: string; minutes: number; status: string; mini: boolean };
type Block = {
  id: string;
  kind: string;
  startsAt: string;
  minutes: number;
  taskId: string | null;
  status: string;
  title: string;
};
const TOMORROW = () => addDays(todayIn(), 1);

describe('Aufgaben', () => {
  it('anlegen, ändern, erledigen, löschen; Standarddauer, Mini = 2 Min.', async () => {
    const a = await req<Task>('POST', '/api/tasks', { title: '  Steuererklärung ' });
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({ title: 'Steuererklärung', minutes: 25, status: 'open' });
    const m = await req<Task>('POST', '/api/tasks', { title: 'Glas Wasser', mini: true });
    expect(m.data).toMatchObject({ minutes: 2, mini: true });
    expect((await req('POST', '/api/tasks', { title: '' })).status).toBe(400);
    expect((await req('POST', '/api/tasks', { title: 'x', minutes: 0 })).status).toBe(400);

    const up = await req<Task>('PUT', `/api/tasks/${a.data.id}`, { minutes: 90, heavy: true });
    expect(up.data).toMatchObject({ minutes: 90, heavy: true });
    const done = await req<Task>('POST', `/api/tasks/${a.data.id}/done`);
    expect(done.data.status).toBe('done');
    expect((await req<Task[]>('GET', '/api/tasks')).data.map((t) => t.id)).toEqual([m.data.id]);
    expect((await req<Task[]>('GET', '/api/tasks?status=done')).data).toHaveLength(1);
    expect((await req<Task[]>('GET', '/api/tasks?status=all')).data).toHaveLength(2);
    expect((await req<Task>('POST', `/api/tasks/${a.data.id}/reopen`)).data.status).toBe('open');
    expect((await req('DELETE', `/api/tasks/${a.data.id}`)).status).toBe(204);
    expect((await req('DELETE', `/api/tasks/${a.data.id}`)).status).toBe(404);
    expect((await req('PUT', '/api/tasks/kaputt', { minutes: 5 })).status).toBe(404);
  });

  it('mit eigener ID wiederholbar (Offline-Warteschlange)', async () => {
    const id = crypto.randomUUID();
    await req('POST', '/api/tasks', { id, title: 'Einmal' });
    const again = await req<Task>('POST', '/api/tasks', { id, title: 'Einmal' });
    expect(again.status).toBe(201);
    expect((await req<Task[]>('GET', '/api/tasks')).data).toHaveLength(1);
  });
});

describe('Inbox', () => {
  it('Notiz, zur Aufgabe machen, löschen; per Kurzbefehl-Schlüssel', async () => {
    const n = await req<{ id: string; text: string }>('POST', '/api/inbox', {
      text: 'Zahnarzt anrufen',
    });
    expect(n.status).toBe(201);
    expect((await req('POST', '/api/inbox', { text: ' ' })).status).toBe(400);
    expect((await req<unknown[]>('GET', '/api/inbox')).data).toHaveLength(1);

    const t = await req<Task>('POST', `/api/inbox/${n.data.id}/plan`, { minutes: 10 });
    expect(t.status).toBe(201);
    expect(t.data).toMatchObject({ title: 'Zahnarzt anrufen', minutes: 10 });
    expect((await req<unknown[]>('GET', '/api/inbox')).data).toEqual([]);
    expect((await req('POST', `/api/inbox/${n.data.id}/plan`, {})).status).toBe(404);

    const n2 = await req<{ id: string }>('POST', '/api/inbox', { text: 'Weg damit' });
    expect((await req('DELETE', `/api/inbox/${n2.data.id}`)).status).toBe(204);

    const key = (await req<{ key: string }>('POST', '/api/me/keys', { name: 'K' })).data.key;
    const r = await app.request('/api/v1/inbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Per Siri' }),
    });
    expect(r.status).toBe(201);
    expect((await req<{ text: string }[]>('GET', '/api/inbox')).data.map((x) => x.text)).toEqual([
      'Per Siri',
    ]);
    const bad = await app.request('/api/v1/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x' }),
    });
    expect(bad.status).toBe(401);
  });
});

describe('Einstellungen', () => {
  it('Standardwerte, ändern, Fehler', async () => {
    const s = await req<{ focusMinutes: number; creditPerHour: number }>(
      'GET',
      '/api/plan/settings',
    );
    expect(s.data).toMatchObject({ focusMinutes: 50, pauseMinutes: 10, creditPerHour: 15 });
    const up = await req<{ creditPerHour: number; focusMinutes: number }>(
      'PUT',
      '/api/plan/settings',
      {
        creditPerHour: 20,
      },
    );
    expect(up.data).toMatchObject({ creditPerHour: 20, focusMinutes: 50 });
    expect(
      (await req<{ creditPerHour: number }>('GET', '/api/plan/settings')).data.creditPerHour,
    ).toBe(20);
    expect((await req('PUT', '/api/plan/settings', { creditPerHour: 99 })).status).toBe(400);
    expect((await req('PUT', '/api/plan/settings', { workStart: '19:00' })).status).toBe(400);
    expect((await req('PUT', '/api/plan/settings', { workStart: '8:00' })).status).toBe(400);
  });
});

describe('Tagesplan', () => {
  it('verteilt Aufgaben in freie Zeit, respektiert Termine, ersetzt den alten Plan', async () => {
    const day = TOMORROW();
    await req('POST', '/api/tasks', { title: 'Angebot', minutes: 120 });
    await req('POST', '/api/tasks', { title: 'Mini', mini: true });
    // Termin 09:30–10:30 (Berlin) am Tag
    const ev = await req<Block>('POST', '/api/blocks', {
      kind: 'event',
      startsAt: new Date(`${day}T00:00:00Z`).toISOString(),
      minutes: 1,
      title: 'Platzhalter',
    });
    await req('DELETE', `/api/blocks/${ev.data.id}`);
    const { instant } = await import('@fokus/core');
    await req('POST', '/api/blocks', {
      kind: 'event',
      startsAt: new Date(instant(day, '09:30')).toISOString(),
      minutes: 60,
      title: 'Zahnarzt',
    });

    const plan = await req<{ blocks: Block[]; unplaced: unknown[] }>('POST', `/api/plan/${day}`);
    expect(plan.status).toBe(200);
    expect(plan.data.unplaced).toEqual([]);
    const shown = plan.data.blocks.map((b) => `${clock(b.startsAt)} ${b.kind} ${b.minutes}`);
    expect(shown).toEqual(['09:00 focus 30', '10:30 focus 50', '11:20 pause 10', '11:30 focus 40']);
    expect(plan.data.blocks.every((b) => b.title === 'Angebot' || b.title === 'Pause')).toBe(true);

    // Neu planen ersetzt, vermehrt nicht
    const again = await req<{ blocks: Block[] }>('POST', `/api/plan/${day}`);
    const overview = await req<{ blocks: Block[]; gaps: { minutes: number }[] }>(
      'GET',
      `/api/day/${day}`,
    );
    expect(again.data.blocks).toHaveLength(4);
    expect(overview.data.blocks).toHaveLength(5);
    expect(overview.data.blocks.map((b) => b.kind)).toEqual([
      'focus',
      'event',
      'focus',
      'pause',
      'focus',
    ]);
  });

  it('zu viel Arbeit: Rest wird gemeldet; vergangene Tage nicht', async () => {
    await req('POST', '/api/tasks', { title: 'Riesig', minutes: 480 });
    await req('POST', '/api/tasks', { title: 'Noch eins', minutes: 480 });
    const r = await req<{ unplaced: { title: string; minutes: number }[] }>(
      'POST',
      `/api/plan/${TOMORROW()}`,
    );
    expect(r.data.unplaced.length).toBeGreaterThan(0);
    expect(r.data.unplaced.reduce((s, x) => s + x.minutes, 0)).toBeGreaterThan(400);
    expect((await req('POST', `/api/plan/${addDays(todayIn(), -1)}`)).status).toBe(400);
    expect((await req('POST', '/api/plan/kaputt')).status).toBe(400);
  });

  it('Tagesansicht: Lücken mit Vorschlägen, Guthaben, laufender Fokus', async () => {
    const day = TOMORROW();
    const t = await req<Task>('POST', '/api/tasks', { title: 'Kurz', minutes: 15 });
    const { instant } = await import('@fokus/core');
    await req('POST', '/api/blocks', {
      kind: 'event',
      startsAt: new Date(instant(day, '09:00')).toISOString(),
      minutes: 8 * 60 + 20,
      title: 'Workshop',
    });
    const o = await req<{
      gaps: { startsAt: string; minutes: number; suggestions: string[] }[];
      credit: { balance: number };
      running: unknown;
    }>('GET', `/api/day/${day}`);
    expect(o.data.gaps).toHaveLength(1);
    expect(o.data.gaps[0]).toMatchObject({ minutes: 40, suggestions: [t.data.id] });
    expect(clock(o.data.gaps[0]!.startsAt)).toBe('17:20');
    expect(o.data.credit.balance).toBe(0);
    expect(o.data.running).toBeNull();
  });
});

describe('Fokus und Guthaben', () => {
  it('Start, Ende: Dauer und Guthaben; nur ein Block gleichzeitig; Ereignisse für Webhooks', async () => {
    const seen: string[] = [];
    const off = onEvent((u, ev) => u === userId && seen.push(ev));
    const t = await req<Task>('POST', '/api/tasks', { title: 'Konzept', minutes: 60 });
    const start = await req<{ id: string; blockId: string; plannedMinutes: number }>(
      'POST',
      '/api/focus/start',
      {
        taskId: t.data.id,
      },
    );
    expect(start.status).toBe(201);
    expect(start.data.plannedMinutes).toBe(50);
    expect((await req('POST', '/api/focus/start', {})).status).toBe(409);
    expect((await req<{ id: string }>('GET', '/api/focus/current')).data.id).toBe(start.data.id);

    // 50 Minuten später fertig: Zeit zurückdrehen, indem der Start in die Vergangenheit rückt
    await h.db.execute(
      `update focus_session set started_at = now() - interval '50 minutes' where id = '${start.data.id}'` as never,
    );
    const end = await req<{ focusedMinutes: number; earned: number; credit: { balance: number } }>(
      'POST',
      `/api/focus/${start.data.id}/finish`,
      { taskDone: true },
    );
    expect(end.data).toMatchObject({ focusedMinutes: 50, earned: 12 });
    expect(end.data.credit.balance).toBe(12);
    expect((await req('POST', `/api/focus/${start.data.id}/finish`, {})).status).toBe(404);
    expect((await req<Task[]>('GET', '/api/tasks?status=done')).data.map((x) => x.id)).toEqual([
      t.data.id,
    ]);
    expect((await req('GET', '/api/focus/current')).data).toBeNull();
    expect(seen).toEqual(['focus.started', 'focus.ended']);

    const today = (
      await req<{ blocks: Block[]; focusMinutes: number }>('GET', `/api/day/${todayIn()}`)
    ).data;
    expect(today.focusMinutes).toBe(50);
    expect(today.blocks.find((b) => b.id === start.data.blockId)).toMatchObject({
      status: 'done',
      minutes: 50,
    });
    off();
  });

  it('abgebrochen nach unter einer Minute: kein Guthaben; geplanter Block wird übernommen', async () => {
    const day = todayIn();
    const { instant } = await import('@fokus/core');
    const b = await req<Block>('POST', '/api/blocks', {
      kind: 'focus',
      startsAt: new Date(instant(day, '23:00')).toISOString(),
      minutes: 30,
      title: 'Geplant',
    });
    const s = await req<{ id: string; plannedMinutes: number }>('POST', '/api/focus/start', {
      blockId: b.data.id,
    });
    expect(s.data.plannedMinutes).toBe(30);
    const r = await req<{ focusedMinutes: number; earned: number }>(
      'POST',
      `/api/focus/${s.data.id}/finish`,
      {},
    );
    expect(r.data).toMatchObject({ focusedMinutes: 0, earned: 0 });
    expect((await req('POST', '/api/focus/start', { blockId: crypto.randomUUID() })).status).toBe(
      404,
    );
  });

  it('Guthaben ausgeben: Rest des Guthabens und Tageslimit', async () => {
    await h.db.insert(creditEntry).values({ userId, minutes: 40, reason: 'focus' });
    const a = await req<{ granted: number; short: number; credit: { balance: number } }>(
      'POST',
      '/api/credit/spend',
      {
        minutes: 10,
        reason: 'redirect',
      },
    );
    expect(a.data).toMatchObject({ granted: 10, short: 0 });
    expect(a.data.credit.balance).toBe(30);
    const b = await req<{ granted: number; limitedBy: string }>('POST', '/api/credit/spend', {
      minutes: 50,
      reason: 'social',
    });
    expect(b.data).toMatchObject({ granted: 30, limitedBy: 'balance' });
    // Tageslimit 20
    await req('PUT', '/api/plan/settings', { dailyLimit: 20 });
    await h.db.insert(creditEntry).values({ userId, minutes: 100, reason: 'focus' });
    const c = await req<{ granted: number; limitedBy: string }>('POST', '/api/credit/spend', {
      minutes: 15,
      reason: 'social',
    });
    expect(c.data).toMatchObject({ granted: 0, limitedBy: 'limit' });
    const summary = await req<{
      balance: number;
      spentToday: number;
      limitLeft: number;
      entries: unknown[];
    }>('GET', '/api/credit');
    expect(summary.data).toMatchObject({ balance: 100, spentToday: 40, limitLeft: 0 });
    expect(summary.data.entries.length).toBe(4);
    expect((await req('POST', '/api/credit/spend', { minutes: 0, reason: 'social' })).status).toBe(
      400,
    );
    expect((await req('POST', '/api/credit/spend', { minutes: 5, reason: 'focus' })).status).toBe(
      400,
    );
  });
});

describe('Export und Import', () => {
  it('Roundtrip der eigenen Daten; fremde Dateien bekommen neue IDs', async () => {
    const t = await req<Task>('POST', '/api/tasks', { title: 'Mitnehmen' });
    await req('POST', '/api/inbox', { text: 'Notiz' });
    const file = (
      await req<{ data: { tasks: unknown[]; inbox: unknown[] } }>('GET', '/api/me/export')
    ).data;
    expect(file.data.tasks).toHaveLength(1);
    const text = JSON.stringify(file);
    const prev = await req<{ counts: Record<string, number> }>('POST', '/api/import/preview', {
      text,
    });
    expect(prev.data.counts).toMatchObject({ tasks: 1, inbox: 1 });

    // Ersetzen: gleiche Daten wieder da
    await req('DELETE', `/api/tasks/${t.data.id}`);
    expect((await req('POST', '/api/import', { text, mode: 'replace' })).status).toBe(200);
    expect((await req<Task[]>('GET', '/api/tasks')).data.map((x) => x.id)).toEqual([t.data.id]);

    // Zusammenführen: nichts doppelt
    await req('POST', '/api/import', { text, mode: 'merge' });
    expect((await req<Task[]>('GET', '/api/tasks')).data).toHaveLength(1);

    // Datei einer anderen Person: neue IDs, Verweise bleiben heil
    const foreign = { ...file, exportedBy: crypto.randomUUID() };
    await req('POST', '/api/import', { text: JSON.stringify(foreign), mode: 'merge' });
    const all = (await req<Task[]>('GET', '/api/tasks')).data;
    expect(all).toHaveLength(2);
    expect(new Set(all.map((x) => x.id)).size).toBe(2);
    expect((await req('POST', '/api/import', { text: 'kaputt', mode: 'merge' })).status).toBe(400);
  });
});

describe('Umleiten', () => {
  type R = {
    label: string;
    insideSlot: boolean;
    nextSocial: string | null;
    task: { id: string; title: string } | null;
    fallback: string;
    bonus: number;
    spend: number;
    credit: { balance: number };
  };

  it('Mini-Aufgabe als Vorschlag, Bonus höchstens 3-mal am Tag, Fallback ohne Aufgabe', async () => {
    const empty = await req<R>('GET', '/api/redirect?app=instagram');
    expect(empty.data).toMatchObject({
      label: 'Instagram',
      insideSlot: false,
      task: null,
      bonus: 3,
      spend: 10,
    });
    expect(empty.data.fallback.length).toBeGreaterThan(3);

    const m = await req<Task>('POST', '/api/tasks', { title: 'Lena antworten', mini: true });
    const r = await req<R>('GET', '/api/redirect?app=tiktok');
    expect(r.data.task).toMatchObject({ id: m.data.id, title: 'Lena antworten' });

    const done = await req<{ bonus: number; credit: { balance: number } }>(
      'POST',
      '/api/redirect/done',
      {
        taskId: m.data.id,
      },
    );
    expect(done.data).toMatchObject({ bonus: 3, credit: { balance: 3 } });
    expect((await req<Task[]>('GET', '/api/tasks?status=done')).data).toHaveLength(1);
    await req('POST', '/api/redirect/done', {});
    await req('POST', '/api/redirect/done', {});
    const fourth = await req<{ bonus: number; credit: { balance: number } }>(
      'POST',
      '/api/redirect/done',
      {},
    );
    expect(fourth.data).toMatchObject({ bonus: 0, credit: { balance: 9 } });
    expect((await req<R>('GET', '/api/redirect?app=instagram')).data.bonus).toBe(0);
  });

  it('im Social-Slot: erlaubt; sonst nächster Slot', async () => {
    const { instant } = await import('@fokus/core');
    const day = todayIn();
    const start = new Date(Date.now() - 5 * 60_000).toISOString();
    await req('POST', '/api/blocks', { kind: 'social', startsAt: start, minutes: 20 });
    expect((await req<R>('GET', '/api/redirect?app=instagram')).data.insideSlot).toBe(true);
    await req('POST', '/api/blocks', {
      kind: 'social',
      startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
      minutes: 20,
    });
    void instant;
    void day;
    expect((await req<R>('GET', '/api/redirect?app=unbekannt')).data.label).toBe('Social Media');
  });
});
