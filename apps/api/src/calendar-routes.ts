// Kalender-Sync: ICS-Abo-Adressen (Google, Apple …) serverseitig lesen, Termine der nächsten
// drei Wochen als belegte Blöcke (kind event, source calendar). Die Adresse enthält oft einen
// geheimen Schlüssel: sie wird nie zurückgegeben, nur der Name. Nur HTTPS, nie ins Heimnetz.
import { MIN_MS, addDays, instant, parseIcs, todayIn } from '@fokus/core';
import { calendarFeed, timeBlock, withUser, type Db } from '@fokus/db';
import { and, eq, gte, lt, notInArray } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import { authed, parseBody, uuid } from './planning';
import { checkTarget, type Resolve } from './webhooks';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 2000;
/** Zeitraum: gestern bis in drei Wochen */
const WINDOW_BACK = 1;
const WINDOW_AHEAD = 21;
/** Höchstens alle 10 Minuten pro Abo (außer „Jetzt abgleichen“). */
const THROTTLE_MS = 10 * MIN_MS;

type Feed = typeof calendarFeed.$inferSelect;

export function registerCalendarRoutes(
  app: Hono<Vars>,
  { db, fetchFn = fetch, resolve }: { db: Db; fetchFn?: typeof fetch; resolve?: Resolve },
) {
  const out = (f: Feed) => ({
    id: f.id,
    name: f.name,
    lastSyncAt: f.lastSyncAt?.toISOString() ?? null,
    lastError: f.lastError,
  });
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);

  /** ICS laden: Weiterleitungen von Hand (jede Adresse neu prüfen), Größe und Zeit begrenzt. */
  async function download(raw: string): Promise<string> {
    let url = raw;
    for (let hop = 0; hop < 4; hop++) {
      const bad = await checkTarget(url, false, resolve);
      if (bad) throw new Error(bad);
      const res = await fetchFn(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'text/calendar, text/plain, */*' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location')!, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Der Kalender antwortet mit Fehler ${res.status}.`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error('Die Kalender-Datei ist zu groß (über 2 MB).');
      if (!text.includes('BEGIN:VCALENDAR'))
        throw new Error('Das ist keine Kalender-Adresse (ICS).');
      return text;
    }
    throw new Error('Zu viele Weiterleitungen.');
  }

  async function sync(userId: string, f: Feed): Promise<Feed> {
    let error: string | null = null;
    try {
      const text = await download(f.url);
      const today = todayIn();
      const from = addDays(today, -WINDOW_BACK);
      const to = addDays(today, WINDOW_AHEAD);
      const events = parseIcs(text, from, to).slice(0, MAX_EVENTS);
      const lo = new Date(instant(from, '00:00'));
      const hi = new Date(instant(addDays(to, 1), '00:00'));
      await withUser(db, userId, async (tx) => {
        const ids = events.map((e) => e.id);
        // Termine, die es im Kalender nicht mehr gibt, verschwinden
        await tx
          .delete(timeBlock)
          .where(
            and(
              eq(timeBlock.feedId, f.id),
              gte(timeBlock.startsAt, lo),
              lt(timeBlock.startsAt, hi),
              ids.length ? notInArray(timeBlock.extId, ids) : undefined,
            ),
          );
        for (const e of events)
          await tx
            .insert(timeBlock)
            .values({
              userId,
              kind: 'event',
              startsAt: new Date(e.start),
              minutes: e.minutes,
              title: e.title.slice(0, 200),
              source: 'calendar',
              feedId: f.id,
              extId: e.id,
            })
            .onConflictDoUpdate({
              target: [timeBlock.userId, timeBlock.feedId, timeBlock.extId],
              set: {
                startsAt: new Date(e.start),
                minutes: e.minutes,
                title: e.title.slice(0, 200),
              },
            });
      });
    } catch (e) {
      error = (e as Error).message;
    }
    const [row] = await withUser(db, userId, (tx) =>
      tx
        .update(calendarFeed)
        .set({ lastSyncAt: new Date(), lastError: error })
        .where(eq(calendarFeed.id, f.id))
        .returning(),
    );
    return row ?? f;
  }

  app.get('/api/calendar', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const rows = await withUser(db, u.id, (tx) => tx.select().from(calendarFeed));
    return c.json(rows.map(out));
  });

  app.post('/api/calendar', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        name: z.string().trim().min(1, 'Gib dem Kalender einen Namen.').max(60),
        url: z.string().trim().min(8).max(2000),
      }),
    );
    if (b instanceof Response) return b;
    const url = b.url.replace(/^webcal:\/\//i, 'https://');
    const bad = await checkTarget(url, false, resolve);
    if (bad) return c.json({ error: bad }, 400);
    const [feed] = await withUser(db, u.id, (tx) =>
      tx.insert(calendarFeed).values({ userId: u.id, name: b.name, url }).returning(),
    );
    return c.json(out(await sync(u.id, feed!)), 201);
  });

  app.delete('/api/calendar/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = c.req.param('id');
    if (!uuid.safeParse(id).success) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx.delete(calendarFeed).where(eq(calendarFeed.id, id)).returning({ id: calendarFeed.id }),
    );
    return rows.length ? c.body(null, 204) : notFound(c);
  });

  /** Alle Abos abgleichen (die App ruft das regelmäßig); `force` ignoriert die Pause. */
  app.post('/api/calendar/sync', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const force = c.req.query('force') === '1';
    const feeds = await withUser(db, u.id, (tx) => tx.select().from(calendarFeed));
    let synced = 0;
    const rows: Feed[] = [];
    for (const f of feeds) {
      if (!force && f.lastSyncAt && Date.now() - f.lastSyncAt.getTime() < THROTTLE_MS) {
        rows.push(f);
        continue;
      }
      rows.push(await sync(u.id, f));
      synced++;
    }
    return c.json({ synced, feeds: rows.map(out) });
  });
}
