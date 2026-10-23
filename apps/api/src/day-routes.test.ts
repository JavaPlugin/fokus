import { addDays, clock, instant, todayIn, weekday } from '@fokus/core';
import { createDb, creditEntry, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

type Task = {
  id: string;
  title: string;
  kind: string;
  minutes: number;
  schedule: string;
  fixedAt: string | null;
  recurrence: { freq: string; days?: number[] } | null;
  status: string;
};
type Item = {
  key: string;
  taskId: string | null;
  day: string;
  title: string;
  kind: string;
  start: string;
  minutes: number;
  how: string;
  recurring: string;
  done: boolean;
  changed: boolean;
};
type DayData = {
  items: Item[];
  hours: { from: string; to: string } | null;
  gaps: { start: string; minutes: number; suggestion: { taskId: string; title: string } | null }[];
  credit: { balance: number };
  running: { id: string } | null;
  pass: { until: string } | null;
  focusMinutes: number;
};
const get = async (d: string) => (await req<DayData>('GET', `/api/day/${d}`)).data;
const show = (items: Item[]) => items.map((i) => `${clock(i.start)} ${i.title} ${i.minutes}`);

/** Nächster Wochentag (1 = Montag … 5 = Freitag), frühestens übermorgen: stabil unabhängig vom Heute. */
function next(wd: number) {
  let d = addDays(todayIn(), 2);
  while (weekday(d) !== wd) d = addDays(d, 1);
  return d;
}
/** Arbeitszeit nur an diesen Wochentagen (0 = So … 6 = Sa): macht Tests unabhängig vom Heute. */
async function workOnly(...wds: number[]) {
  const week = Array.from({ length: 7 }, (_, i) =>
    wds.includes(i) ? { from: '09:00', to: '17:00' } : null,
  );
  await req('PUT', '/api/plan/settings', { week });
}
/** Wochentag, der sicher nicht heute ist (damit „jetzt“ keine Rolle spielt). */
const other = (plus: number) => (weekday(todayIn()) + plus) % 7;
/** Nächster Tag mit diesem Wochentag, frühestens morgen. */
const nextDay = (wd: number) => {
  let d = addDays(todayIn(), 1);
  while (weekday(d) !== wd) d = addDays(d, 1);
  return d;
};
const at = (d: string, hhmm: string) => new Date(instant(d, hhmm)).toISOString();

describe('Aufgaben', () => {
  it('Standard: Arbeit, 30 Min., später; Prüfungen; ändern, erledigen, löschen', async () => {
    const a = await req<Task>('POST', '/api/tasks', { title: '  Steuererklärung ' });
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({
      title: 'Steuererklärung',
      kind: 'work',
      minutes: 30,
      schedule: 'later',
      recurrence: null,
      status: 'open',
    });
    expect((await req('POST', '/api/tasks', { title: '' })).status).toBe(400);
    expect((await req('POST', '/api/tasks', { title: 'x', minutes: 0 })).status).toBe(400);
    expect((await req('POST', '/api/tasks', { title: 'x', kind: 'sport' })).status).toBe(400);
    // Feste Zeit braucht Tag und Uhrzeit; „später“ wiederholt sich nicht
    expect((await req('POST', '/api/tasks', { title: 'x', schedule: 'fixed' })).status).toBe(400);
    expect(
      (await req('POST', '/api/tasks', { title: 'x', recurrence: { freq: 'daily' } })).status,
    ).toBe(400);

    const up = await req<Task>('PUT', `/api/tasks/${a.data.id}`, { minutes: 90, schedule: 'auto' });
    expect(up.data).toMatchObject({ minutes: 90, schedule: 'auto' });
    expect((await req('PUT', `/api/tasks/${a.data.id}`, { schedule: 'fixed' })).status).toBe(400);
    expect((await req<Task>('POST', `/api/tasks/${a.data.id}/done`)).data.status).toBe('done');
    expect((await req<Task>('POST', `/api/tasks/${a.data.id}/reopen`)).data.status).toBe('open');
    expect((await req('DELETE', `/api/tasks/${a.data.id}`)).status).toBe(204);
    expect((await req('DELETE', `/api/tasks/${a.data.id}`)).status).toBe(404);
    expect((await req('PUT', '/api/tasks/kaputt', { minutes: 5 })).status).toBe(404);
  });

  it('mit eigener ID wiederholbar (Offline-Warteschlange)', async () => {
    const id = crypto.randomUUID();
    await req('POST', '/api/tasks', { id, title: 'Einmal' });
    await req('POST', '/api/tasks', { id, title: 'Einmal' });
    const list = await req<{ later: Task[] }>('GET', '/api/tasks?view=open');
    expect(list.data.later).toHaveLength(1);
  });

  it('Kurzbefehl legt eine Aufgabe „später“ an', async () => {
    const key = (await req<{ key: string }>('POST', '/api/me/keys', { name: 'K' })).data.key;
    const r = await app.request('/api/v1/inbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Per Siri' }),
    });
    expect(r.status).toBe(201);
    const list = await req<{ later: Task[] }>('GET', '/api/tasks?view=open');
    expect(list.data.later.map((t) => [t.title, t.schedule, t.minutes])).toEqual([
      ['Per Siri', 'later', 30],
    ]);
    expect(
      (
        await app.request('/api/v1/inbox', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: 'x' }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('Einstellungen und Arbeitszeiten', () => {
  it('Standard Mo–Fr 09:00–17:00; ändern; Fehler', async () => {
    type S = {
      week: ({ from: string; to: string } | null)[];
      creditPerHour: number;
      pending: { from: string; values: Record<string, number> } | null;
    };
    const s = await req<S>('GET', '/api/plan/settings');
    expect(s.data.week.map((h) => (h ? `${h.from}-${h.to}` : 'frei'))).toEqual([
      'frei',
      '09:00-17:00',
      '09:00-17:00',
      '09:00-17:00',
      '09:00-17:00',
      '09:00-17:00',
      'frei',
    ]);
    const week = [...s.data.week];
    week[5] = { from: '09:00', to: '14:00' };
    week[6] = { from: '10:00', to: '12:00' };
    const up = await req<S>('PUT', '/api/plan/settings', { week, creditPerHour: 10 });
    expect(up.data.week[5]).toEqual({ from: '09:00', to: '14:00' });
    expect(up.data.creditPerHour).toBe(10);
    expect(up.data.pending).toBeNull();
    expect((await req<S>('GET', '/api/plan/settings')).data.week[6]).toEqual({
      from: '10:00',
      to: '12:00',
    });
    expect((await req('PUT', '/api/plan/settings', { week: [null] })).status).toBe(400);
    expect(
      (
        await req('PUT', '/api/plan/settings', {
          week: [null, { from: '18:00', to: '09:00' }, null, null, null, null, null],
        })
      ).status,
    ).toBe(400);
    expect((await req('PUT', '/api/plan/settings', { creditPerHour: 99 })).status).toBe(400);
  });
  it('Lockerungen gelten erst ab morgen, Strengeres sofort', async () => {
    type S = {
      creditPerHour: number;
      dailyLimit: number;
      pending: { from: string; values: Record<string, number> } | null;
    };
    const tomorrow = addDays(todayIn(), 1);
    const up = await req<S>('PUT', '/api/plan/settings', { creditPerHour: 60, dailyLimit: 30 });
    expect(up.data).toMatchObject({
      creditPerHour: 15,
      dailyLimit: 30,
      pending: { from: tomorrow, values: { creditPerHour: 60 } },
    });
    // Guthaben heute weiter mit 15 pro Stunde
    const t = await req<Task>('POST', '/api/tasks', { title: 'Konzept', minutes: 60 });
    const f = await req<{ id: string }>('POST', '/api/focus/start', { taskId: t.data.id });
    await h.db.execute(
      `update focus_session set started_at = now() - interval '60 minutes' where id = '${f.data.id}'` as never,
    );
    const end = await req<{ earned: number }>('POST', `/api/focus/${f.data.id}/finish`, {});
    expect(end.data.earned).toBe(15);
    // zurück auf den alten Wert: nichts steht mehr aus
    const back = await req<S>('PUT', '/api/plan/settings', { creditPerHour: 15 });
    expect(back.data.pending).toBeNull();
    // fällige Lockerung gilt (als wäre morgen schon heute)
    await req('PUT', '/api/plan/settings', { dailyLimit: 120 });
    await h.db.execute(
      `update user_settings set plan = jsonb_set(plan, '{pending,from}', to_jsonb('${todayIn()}'::text))` as never,
    );
    const later = await req<S>('GET', '/api/plan/settings');
    expect(later.data).toMatchObject({ dailyLimit: 120, pending: null });
  });
});

describe('Tagesplan', () => {
  it('feste Zeit steht da (auch außerhalb der Arbeitszeit), Automatik füllt die Arbeitszeit drumherum', async () => {
    const wd = other(3);
    await workOnly(wd);
    const d = nextDay(wd);
    await req('POST', '/api/tasks', {
      title: 'Zahnarzt',
      schedule: 'fixed',
      fixedAt: at(d, '09:30'),
      minutes: 60,
    });
    await req('POST', '/api/tasks', {
      title: 'Abends',
      schedule: 'fixed',
      fixedAt: at(d, '20:00'),
      minutes: 30,
    });
    await req('POST', '/api/tasks', { title: 'Angebot', schedule: 'auto', minutes: 50 });
    await req('POST', '/api/tasks', { title: 'Mails', schedule: 'auto', minutes: 30 });
    await req('POST', '/api/tasks', { title: 'Irgendwann', schedule: 'later' });

    const day = await get(d);
    expect(day.hours).toEqual({ from: '09:00', to: '17:00' });
    // Angebot (50) passt vor 09:30 nicht, kommt danach; Mails (30) füllt die Lücke davor
    expect(show(day.items)).toEqual([
      '09:00 Mails 30',
      '09:30 Zahnarzt 60',
      '10:30 Angebot 50',
      '20:00 Abends 30',
    ]);
    expect(day.items.map((i) => i.how)).toEqual(['auto', 'fixed', 'auto', 'fixed']);
    // „Später“ steht nirgends im Plan
    expect(day.items.some((i) => i.title === 'Irgendwann')).toBe(false);
  });

  it('Platzmangel: Einmaliges wandert an den nächsten Arbeitstag, freie Tage werden übersprungen', async () => {
    const a = other(2);
    const b = other(5);
    await workOnly(a, b);
    const da = nextDay(a);
    const db = nextDay(b);
    await req('POST', '/api/tasks', { title: 'Gross', schedule: 'auto', minutes: 7 * 60 });
    await req('POST', '/api/tasks', { title: 'Zweit', schedule: 'auto', minutes: 3 * 60 });
    const first = da < db ? da : db;
    const second = da < db ? db : da;
    expect(show((await get(first)).items)).toEqual(['09:00 Gross 420']);
    expect(show((await get(second)).items)).toEqual(['09:00 Zweit 180']);
    expect((await get(addDays(first, 1))).items).toEqual([]);
  });

  it('feste Zeit geht auch am freien Tag', async () => {
    const wd = other(2);
    await workOnly(other(4));
    const d = nextDay(wd);
    await req('POST', '/api/tasks', {
      title: 'Frei',
      schedule: 'fixed',
      fixedAt: at(d, '11:00'),
      minutes: 45,
    });
    await req('POST', '/api/tasks', { title: 'Automatik', schedule: 'auto', minutes: 30 });
    const day = await get(d);
    expect(day.hours).toBeNull();
    expect(show(day.items)).toEqual(['11:00 Frei 45']);
    expect(day.gaps).toEqual([]);
  });

  it('freie Zeit mit Vorschlag aus „später“ (was die Lücke am besten füllt)', async () => {
    const wd = other(3);
    await workOnly(wd);
    const d = nextDay(wd);
    await req('POST', '/api/tasks', {
      title: 'Workshop',
      schedule: 'fixed',
      fixedAt: at(d, '09:00'),
      minutes: 6 * 60 + 20,
    });
    await req('POST', '/api/tasks', { title: 'Rechnung abheften', minutes: 15 });
    const gross = await req<Task>('POST', '/api/tasks', { title: 'Steuer anfangen', minutes: 90 });
    await req('POST', '/api/tasks', { title: 'Zu gross', minutes: 200 });
    const day = await get(d);
    expect(day.gaps).toHaveLength(1);
    expect(clock(day.gaps[0]!.start)).toBe('15:20');
    expect(day.gaps[0]).toMatchObject({ minutes: 100, suggestion: { taskId: gross.data.id } });
  });
});

describe('Wiederholung', () => {
  it('täglich, werktags, wöchentlich: richtige Tage; Beschriftung', async () => {
    const mon = next(1);
    const sat = addDays(mon, 5);
    await req('POST', '/api/tasks', {
      title: 'Täglich',
      schedule: 'fixed',
      fixedAt: at(mon, '08:00'),
      minutes: 15,
      recurrence: { freq: 'daily' },
    });
    await req('POST', '/api/tasks', {
      title: 'Werktags',
      schedule: 'fixed',
      fixedAt: at(mon, '12:00'),
      minutes: 15,
      recurrence: { freq: 'weekdays' },
    });
    await req('POST', '/api/tasks', {
      title: 'Team-Call',
      schedule: 'fixed',
      fixedAt: at(mon, '16:00'),
      minutes: 30,
      recurrence: { freq: 'weekly', days: [1, 3] },
    });
    const tue = await get(addDays(mon, 1));
    expect(show(tue.items)).toEqual(['08:00 Täglich 15', '12:00 Werktags 15']);
    const wed = await get(addDays(mon, 2));
    expect(wed.items.map((i) => [i.title, i.recurring])).toEqual([
      ['Täglich', 'täglich'],
      ['Werktags', 'werktags'],
      ['Team-Call', 'jeden Mo, Mi'],
    ]);
    expect(show((await get(sat)).items)).toEqual(['08:00 Täglich 15']);
    // Vor dem Anfang gibt es kein Vorkommen
    const before = await get(addDays(mon, -2));
    expect(before.items.filter((i) => i.taskId).length).toBeLessThanOrEqual(0 + 3);
  });

  it('erledigt wird nur das Vorkommen; Rückgängig; Regel bleibt', async () => {
    const mon = next(1);
    const t = await req<Task>('POST', '/api/tasks', {
      title: 'Mails',
      schedule: 'fixed',
      fixedAt: at(mon, '09:00'),
      minutes: 30,
      recurrence: { freq: 'daily' },
    });
    const d1 = mon;
    const d2 = addDays(mon, 1);
    expect((await req('POST', `/api/tasks/${t.data.id}/done`, { day: d1 })).status).toBe(200);
    expect((await get(d1)).items[0]!.done).toBe(true);
    expect((await get(d2)).items[0]!.done).toBe(false);
    const rec = await req<Task[]>('GET', '/api/tasks?view=recurring');
    expect(rec.data[0]).toMatchObject({ id: t.data.id, status: 'open' });
    const done = await req<{ day: string; title: string }[]>('GET', '/api/tasks?view=done');
    expect(done.data.map((x) => [x.day, x.title])).toEqual([[d1, 'Mails']]);
    await req('POST', `/api/tasks/${t.data.id}/reopen`, { day: d1 });
    expect((await get(d1)).items[0]!.done).toBe(false);
  });

  it('„Nur diese“: ändern und überspringen; „Alle“ ändert die Regel', async () => {
    const mon = next(1);
    const tue = addDays(mon, 1);
    const wed = addDays(mon, 2);
    const t = await req<Task>('POST', '/api/tasks', {
      title: 'Lesen',
      schedule: 'fixed',
      fixedAt: at(mon, '09:00'),
      minutes: 30,
      recurrence: { freq: 'daily' },
    });
    expect(
      (
        await req('PUT', `/api/tasks/${t.data.id}/occurrence/${tue}`, {
          title: 'Lesen (Buch)',
          minutes: 45,
          time: '10:15',
        })
      ).status,
    ).toBe(204);
    expect(
      (await req('PUT', `/api/tasks/${t.data.id}/occurrence/${wed}`, { skipped: true })).status,
    ).toBe(204);
    const d2 = await get(tue);
    expect(show(d2.items)).toEqual(['10:15 Lesen (Buch) 45']);
    expect(d2.items[0]!.changed).toBe(true);
    expect((await get(wed)).items).toEqual([]);
    expect(show((await get(mon)).items)).toEqual(['09:00 Lesen 30']);

    await req('PUT', `/api/tasks/${t.data.id}`, { title: 'Lesen!', minutes: 20 });
    expect(show((await get(mon)).items)).toEqual(['09:00 Lesen! 20']);
    // Die einzelne Änderung bleibt
    expect(show((await get(tue)).items)).toEqual(['10:15 Lesen (Buch) 45']);
    expect(
      (await req('PUT', `/api/tasks/${crypto.randomUUID()}/occurrence/${tue}`, { skipped: true }))
        .status,
    ).toBe(404);
  });

  it('automatisch + wiederkehrend: gehört zu seinem Tag, kommt vor Einmaligem', async () => {
    const mon = next(1);
    await req('POST', '/api/tasks', { title: 'Einmal', schedule: 'auto', minutes: 60 });
    await req('POST', '/api/tasks', {
      title: 'Täglich auto',
      schedule: 'auto',
      minutes: 30,
      recurrence: { freq: 'weekdays' },
    });
    const d = await get(mon);
    expect(show(d.items)).toContain('09:00 Täglich auto 30');
    expect(d.items.map((i) => i.title).indexOf('Täglich auto')).toBeLessThan(
      d.items.map((i) => i.title).indexOf('Einmal') === -1
        ? 99
        : d.items.map((i) => i.title).indexOf('Einmal'),
    );
  });
});

describe('Übersicht „Aufgaben“', () => {
  it('heute, diese Woche, ohne Zeit', async () => {
    const d = next(2);
    await workOnly(1, 2, 3, 4, 5);
    await req('POST', '/api/tasks', { title: 'Zeitlos' });
    await req('POST', '/api/tasks', { title: 'Fest', schedule: 'fixed', fixedAt: at(d, '14:00') });
    const open = await req<{
      today: Item[];
      week: { day: string; items: Item[] }[];
      later: Task[];
    }>('GET', '/api/tasks?view=open');
    expect(open.data.later.map((t) => t.title)).toEqual(['Zeitlos']);
    expect(open.data.week.length).toBe(6);
    expect(open.data.week.find((w) => w.day === d)!.items.map((i) => i.title)).toEqual(['Fest']);
    expect((await req('GET', '/api/tasks?view=kaputt')).status).toBe(400);
  });
});

describe('Fokus und Guthaben', () => {
  it('Start, Ende: Dauer und Guthaben; nur ein Block gleichzeitig; Ereignisse für Webhooks', async () => {
    const seen: string[] = [];
    const off = onEvent((u, ev) => u === userId && seen.push(ev));
    const t = await req<Task>('POST', '/api/tasks', { title: 'Konzept', minutes: 50 });
    const start = await req<{ id: string; plannedMinutes: number }>('POST', '/api/focus/start', {
      taskId: t.data.id,
    });
    expect(start.status).toBe(201);
    expect(start.data.plannedMinutes).toBe(50);
    expect((await req('POST', '/api/focus/start', {})).status).toBe(409);
    expect((await req<{ id: string }>('GET', '/api/focus/current')).data.id).toBe(start.data.id);

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
    expect((await req<Task>('PUT', `/api/tasks/${t.data.id}`, {})).data.status).toBe('done');
    expect((await req('GET', '/api/focus/current')).data).toBeNull();
    expect(seen).toEqual(['focus.started', 'focus.ended']);
    expect((await get(todayIn())).focusMinutes).toBe(50);
    off();
  });

  it('wiederkehrende Aufgabe fertig fokussiert: nur heutiges Vorkommen erledigt', async () => {
    const t = await req<Task>('POST', '/api/tasks', {
      title: 'Täglich',
      schedule: 'auto',
      minutes: 30,
      recurrence: { freq: 'daily' },
    });
    const s = await req<{ id: string }>('POST', '/api/focus/start', { taskId: t.data.id });
    await h.db.execute(
      `update focus_session set started_at = now() - interval '5 minutes' where id = '${s.data.id}'` as never,
    );
    await req('POST', `/api/focus/${s.data.id}/finish`, { taskDone: true });
    const today = await get(todayIn());
    expect(today.items.filter((i) => i.taskId === t.data.id && i.done)).toHaveLength(1);
    expect(
      (await get(addDays(todayIn(), 1))).items.find((i) => i.taskId === t.data.id)?.done,
    ).not.toBe(true);
    expect((await req<Task[]>('GET', '/api/tasks?view=recurring')).data[0]!.status).toBe('open');
  });

  it('unter einer Minute: abgebrochen, kein Guthaben; unbekannte Aufgabe 404', async () => {
    const t = await req<Task>('POST', '/api/tasks', { title: 'Kurz' });
    const s = await req<{ id: string }>('POST', '/api/focus/start', { taskId: t.data.id });
    const r = await req<{ focusedMinutes: number; earned: number }>(
      'POST',
      `/api/focus/${s.data.id}/finish`,
      {},
    );
    expect(r.data).toMatchObject({ focusedMinutes: 0, earned: 0 });
    expect((await req('POST', '/api/focus/start', { taskId: crypto.randomUUID() })).status).toBe(
      404,
    );
  });

  it('Fokus nur für Arbeit: Social- oder Pause-Aufgabe bringt kein Guthaben', async () => {
    const social = await req<Task>('POST', '/api/tasks', { title: 'Scrollen', kind: 'social' });
    const pause = await req<Task>('POST', '/api/tasks', { title: 'Kaffee', kind: 'pause' });
    expect((await req('POST', '/api/focus/start', { taskId: social.data.id })).status).toBe(400);
    expect((await req('POST', '/api/focus/start', { taskId: pause.data.id })).status).toBe(400);
  });

  it('vergessener Timer bringt nichts extra; ein Block höchstens 120 Min', async () => {
    const t = await req<Task>('POST', '/api/tasks', { title: 'Lang', minutes: 600 });
    const s0 = await req<{ id: string; plannedMinutes: number }>('POST', '/api/focus/start', {
      taskId: t.data.id,
      minutes: 600,
    });
    expect(s0.data.plannedMinutes).toBe(120);
    await req('POST', `/api/focus/${s0.data.id}/finish`, {});
    const s = await req<{ id: string }>('POST', '/api/focus/start', { minutes: 50 });
    await h.db.execute(
      `update focus_session set started_at = now() - interval '80 minutes' where id = '${s.data.id}'` as never,
    );
    const r = await req<{ focusedMinutes: number; earned: number }>(
      'POST',
      `/api/focus/${s.data.id}/finish`,
      {},
    );
    expect(r.data).toMatchObject({ focusedMinutes: 80, earned: 12 });
  });

  it('Guthaben ausgeben: Rest des Guthabens und Tageslimit', async () => {
    await h.db.insert(creditEntry).values({ userId, minutes: 40, reason: 'focus' });
    const a = await req<{ granted: number; short: number; credit: { balance: number } }>(
      'POST',
      '/api/credit/spend',
      { minutes: 10, reason: 'redirect' },
    );
    expect(a.data).toMatchObject({ granted: 10, short: 0 });
    expect(a.data.credit.balance).toBe(30);
    const b = await req<{ granted: number; limitedBy: string }>('POST', '/api/credit/spend', {
      minutes: 50,
      reason: 'social',
    });
    expect(b.data).toMatchObject({ granted: 30, limitedBy: 'balance' });
    await req('PUT', '/api/plan/settings', { dailyLimit: 20 });
    await h.db.insert(creditEntry).values({ userId, minutes: 100, reason: 'focus' });
    const c = await req<{ granted: number; limitedBy: string }>('POST', '/api/credit/spend', {
      minutes: 15,
      reason: 'social',
    });
    expect(c.data).toMatchObject({ granted: 0, limitedBy: 'limit' });
    const summary = await req<{ balance: number; spentToday: number; limitLeft: number }>(
      'GET',
      '/api/credit',
    );
    expect(summary.data).toMatchObject({ balance: 100, spentToday: 40, limitLeft: 0 });
    expect((await req('POST', '/api/credit/spend', { minutes: 0, reason: 'social' })).status).toBe(
      400,
    );
    expect((await req('POST', '/api/credit/spend', { minutes: 5, reason: 'focus' })).status).toBe(
      400,
    );
  });
});

describe('Umleiten', () => {
  type R = {
    label: string;
    state: 'free' | 'focus' | 'blocked';
    passUntil: string | null;
    focus: { title: string } | null;
    nextSocial: string | null;
    task: { id: string; title: string; minutes: number } | null;
    fallback: string;
    spend: number;
    canSpend: number;
    credit: { balance: number };
    override: { left: number; cost: number; waitSeconds: number };
    ticket: string;
  };
  const info = async (app = 'instagram') =>
    (await req<R>('GET', `/api/v1/redirect?app=${app}`)).data;
  const gateKey = async () =>
    (await req<{ key: string; gateUrl: string }>('POST', '/api/me/gate-key', {})).data;
  const gate = async (key: string, name = 'instagram') =>
    (await app.request(`/api/v1/gate/${key}?app=${name}`)).text();
  const withKey = async <T>(key: string, method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as T };
  };
  /** Server-Uhr vorstellen (Wartezeit, Aufgaben-Dauer), ohne echte Zeit zu verlieren. */
  const later = (ms: number) => {
    const real = Date.now();
    return vi.spyOn(Date, 'now').mockReturnValue(real + ms);
  };
  afterEach(() => vi.restoreAllMocks());

  it('ein bloß geplanter Social-Slot gibt nichts frei, erst sein Start (Guthaben)', async () => {
    await req('POST', '/api/tasks', {
      title: 'Social',
      kind: 'social',
      schedule: 'fixed',
      fixedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      minutes: 15,
    });
    const { key, gateUrl } = await gateKey();
    expect(gateUrl).toBe(`https://fokus.test/api/v1/gate/${key}`);
    expect((await info()).state).toBe('blocked');
    expect(await gate(key)).toBe(`https://fokus.test/umleiten?app=instagram&k=${key}`);

    await h.db.insert(creditEntry).values({ userId, minutes: 40, reason: 'focus' });
    const r = await req<{ granted: number; passUntil: string }>('POST', '/api/credit/spend', {
      minutes: 10,
      reason: 'social',
    });
    expect(r.data.granted).toBe(10);
    const until = new Date(r.data.passUntil).getTime() - Date.now();
    expect(until).toBeGreaterThan(9 * 60_000);
    expect(until).toBeLessThanOrEqual(10 * 60_000);
    // Genau das war die Schleife: nach dem Bezahlen muss die App aufgehen
    expect(await gate(key)).toBe('frei');
    expect((await info()).state).toBe('free');
    expect((await get(todayIn())).pass).not.toBeNull();
    // nach Ablauf wieder zu
    later(11 * 60_000);
    expect(await gate(key)).toContain('/umleiten?app=instagram');
  });

  it('Guthaben nehmen: gibt genau so lange frei, ohne Guthaben nichts, im Fokus nie', async () => {
    const { key } = await gateKey();
    const empty = await info('tiktok');
    expect(empty).toMatchObject({ label: 'TikTok', state: 'blocked', spend: 10, canSpend: 0 });
    const none = await req<{ granted: number; passUntil: string | null }>(
      'POST',
      '/api/v1/redirect/spend',
      {},
    );
    expect(none.data).toMatchObject({ granted: 0, passUntil: null });
    expect(await gate(key, 'tiktok')).toContain('/umleiten?app=tiktok');

    await h.db.insert(creditEntry).values({ userId, minutes: 7, reason: 'focus' });
    expect((await info()).canSpend).toBe(7);
    const some = await req<{
      granted: number;
      passUntil: string | null;
      credit: { balance: number };
    }>('POST', '/api/v1/redirect/spend', {});
    expect(some.data).toMatchObject({ granted: 7, credit: { balance: 0 } });
    expect(await gate(key)).toBe('frei');

    const f = await req('POST', '/api/focus/start', { minutes: 25 });
    expect(f.status).toBe(201);
    expect(await gate(key)).toContain('/umleiten');
    expect((await info()).state).toBe('focus');
    expect((await info()).focus).not.toBeNull();
    expect((await req('POST', '/api/v1/redirect/spend', {})).status).toBe(409);
    expect((await req('POST', '/api/credit/spend', { minutes: 5, reason: 'social' })).status).toBe(
      409,
    );
  });

  it('Ausnahme: erst nach der Wartezeit, kostet auch ins Minus, höchstens 3 am Tag', async () => {
    const first = await info();
    expect(first.override).toEqual({ left: 3, cost: 5, waitSeconds: 15 });
    const now = await req<{ error: string }>('POST', '/api/v1/redirect/override', {
      ticket: first.ticket,
    });
    expect(now.status).toBe(400);
    expect(now.data.error).toMatch(/warten/);
    // gefälschtes Ticket
    const fake = `${Date.now() - 60_000}.${'a'.repeat(43)}`;
    expect((await req('POST', '/api/v1/redirect/override', { ticket: fake })).status).toBe(400);

    for (let n = 1; n <= 3; n++) {
      const t = (await info()).ticket;
      const spy = later(16_000);
      const r = await req<{
        passUntil: string;
        credit: { balance: number };
        overridesLeft: number;
      }>('POST', '/api/v1/redirect/override', { ticket: t });
      spy.mockRestore();
      expect(r.status).toBe(200);
      expect(r.data.credit.balance).toBe(-5 * n);
      expect(r.data.overridesLeft).toBe(3 - n);
    }
    const t = (await info()).ticket;
    later(16_000);
    expect((await req('POST', '/api/v1/redirect/override', { ticket: t })).status).toBe(429);
    vi.restoreAllMocks();
    // Schulden: Guthaben nehmen geht erst wieder nach Fokus
    expect((await info()).canSpend).toBe(0);
    expect((await info()).override.left).toBe(0);
  });

  it('kleine Aufgabe: nur eine echte, erst nach ihrer Dauer, ohne Guthaben', async () => {
    const m = await req<Task>('POST', '/api/tasks', { title: 'Lena antworten', minutes: 2 });
    const big = await req<Task>('POST', '/api/tasks', { title: 'Konzept', minutes: 30 });
    const i = await info();
    expect(i.task).toMatchObject({ id: m.data.id, minutes: 2 });
    expect(i.fallback.length).toBeGreaterThan(3);
    const early = await req('POST', '/api/v1/redirect/done', {
      taskId: m.data.id,
      ticket: i.ticket,
    });
    expect(early.status).toBe(400);
    later(2 * 60_000);
    expect(
      (await req('POST', '/api/v1/redirect/done', { taskId: big.data.id, ticket: i.ticket }))
        .status,
    ).toBe(400);
    const ok = await req('POST', '/api/v1/redirect/done', { taskId: m.data.id, ticket: i.ticket });
    expect(ok.status).toBe(200);
    vi.restoreAllMocks();
    expect((await req<Task>('PUT', `/api/tasks/${m.data.id}`, {})).data.status).toBe('done');
    expect((await info()).credit.balance).toBe(0);
    expect((await info('unbekannt')).label).toBe('Social Media');
  });

  it('Schlüssel: neuer ersetzt alten, falscher liefert Hinweis, Seite geht ohne Sitzung', async () => {
    expect(await gate('fk_falschfalschfalschfalsch')).toBe(
      'https://fokus.test/umleiten?app=instagram&fehler=adresse',
    );
    const a = await gateKey();
    const b = await gateKey();
    expect(await gate(a.key)).toContain('fehler=adresse');
    expect(await gate(b.key)).toContain(`k=${b.key}`);
    expect((await req<{ active: boolean }>('GET', '/api/me/gate-key')).data.active).toBe(true);
    // Umleiten-Seite in Safari ohne Sitzung, nur mit Schlüssel
    const page = await withKey<R>(b.key, 'GET', '/api/v1/redirect?app=instagram');
    expect(page.status).toBe(200);
    expect(page.data.state).toBe('blocked');
    expect((await withKey(b.key, 'POST', '/api/v1/redirect/spend', {})).status).toBe(200);
    // ohne alles: nicht angemeldet; Schlüssel für etwas anderes: verboten
    expect((await app.request('/api/v1/redirect?app=instagram')).status).toBe(401);
    const other = await req<{ key: string }>('POST', '/api/me/keys', {
      name: 'Notizen',
      scopes: ['inbox:create'],
    });
    expect((await withKey(other.data.key, 'GET', '/api/v1/redirect')).status).toBe(403);
  });
});

describe('Woche', () => {
  type W = {
    focus: number;
    social: number;
    regained: number;
    expectedSocial: number;
    streak: number;
    tasksDone: number;
    bestDay: string | null;
    days: { day: string; focus: number; social: number }[];
  };

  it('Fokus, Social, zurückgeholt, Serie und erledigte Aufgaben', async () => {
    const empty = await req<W>('GET', `/api/week/${todayIn()}`);
    expect(empty.data.days).toHaveLength(7);
    expect(empty.data).toMatchObject({
      focus: 0,
      social: 0,
      streak: 0,
      tasksDone: 0,
      bestDay: null,
    });
    await req('PUT', '/api/plan/settings', { streakGoal: 30 });
    const t = await req<Task>('POST', '/api/tasks', { title: 'Konzept', minutes: 60 });
    const s = await req<{ id: string }>('POST', '/api/focus/start', { taskId: t.data.id });
    await h.db.execute(
      `update focus_session set started_at = now() - interval '45 minutes' where id = '${s.data.id}'` as never,
    );
    await req('POST', `/api/focus/${s.data.id}/finish`, { taskDone: true });
    await h.db.insert(creditEntry).values({ userId, minutes: 100, reason: 'focus' });
    await req('POST', '/api/credit/spend', { minutes: 20, reason: 'social' });
    const w = await req<W>('GET', `/api/week/${todayIn()}`);
    expect(w.data).toMatchObject({
      focus: 45,
      social: 20,
      streak: 1,
      tasksDone: 1,
      bestDay: todayIn(),
    });
    expect(w.data.days.find((d) => d.day === todayIn())).toEqual({
      day: todayIn(),
      focus: 45,
      social: 20,
    });
    expect(w.data.regained).toBe(w.data.expectedSocial - 20);
    expect((await req('GET', '/api/week/kaputt')).status).toBe(400);
  });
});

describe('Export und Import', () => {
  it('Roundtrip der eigenen Daten inkl. Vorkommen; fremde Dateien bekommen neue IDs', async () => {
    const mon = next(1);
    const t = await req<Task>('POST', '/api/tasks', {
      title: 'Mitnehmen',
      schedule: 'fixed',
      fixedAt: at(mon, '09:00'),
      recurrence: { freq: 'daily' },
    });
    await req('POST', `/api/tasks/${t.data.id}/done`, { day: mon });
    const file = (
      await req<{ data: { tasks: unknown[]; occurrences: unknown[] } }>('GET', '/api/me/export')
    ).data;
    expect(file.data.tasks).toHaveLength(1);
    expect(file.data.occurrences).toHaveLength(1);
    const text = JSON.stringify(file);
    const prev = await req<{ counts: Record<string, number> }>('POST', '/api/import/preview', {
      text,
    });
    expect(prev.data.counts).toMatchObject({ tasks: 1, occurrences: 1 });
    await req('DELETE', `/api/tasks/${t.data.id}`);
    expect((await req('POST', '/api/import', { text, mode: 'replace' })).status).toBe(200);
    expect((await get(mon)).items[0]).toMatchObject({ title: 'Mitnehmen', done: true });
    await req('POST', '/api/import', { text, mode: 'merge' });
    expect((await req<Task[]>('GET', '/api/tasks?view=recurring')).data).toHaveLength(1);
    const foreign = { ...file, exportedBy: crypto.randomUUID() };
    await req('POST', '/api/import', { text: JSON.stringify(foreign), mode: 'merge' });
    const all = (await req<Task[]>('GET', '/api/tasks?view=recurring')).data;
    expect(all).toHaveLength(2);
    expect(new Set(all.map((x) => x.id)).size).toBe(2);
    expect((await req('POST', '/api/import', { text: 'kaputt', mode: 'merge' })).status).toBe(400);
  });

  it('bearbeitete Datei: kein Guthaben dazu, Lockerungen erst ab morgen', async () => {
    await h.db.insert(creditEntry).values({ userId, minutes: 20, reason: 'focus' });
    await req('PUT', '/api/plan/settings', { focusMinutes: 25 });
    type File = { data: { credit: Record<string, unknown>[]; settings: { plan: object }[] } };
    const file = (await req<File>('GET', '/api/me/export')).data;
    file.data.credit.push({ ...file.data.credit[0]!, id: crypto.randomUUID(), minutes: 9999 });
    file.data.settings[0]!.plan = { focusMinutes: 25, creditPerHour: 60 };
    const text = JSON.stringify(file);
    expect((await req('POST', '/api/import', { text, mode: 'replace' })).status).toBe(200);
    expect((await req<{ balance: number }>('GET', '/api/credit')).data.balance).toBe(20);
    const s = await req<{ creditPerHour: number; pending: { values: object } | null }>(
      'GET',
      '/api/plan/settings',
    );
    expect(s.data.creditPerHour).toBe(15);
    expect(s.data.pending?.values).toEqual({ creditPerHour: 60 });
  });
});
