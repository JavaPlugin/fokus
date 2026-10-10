// Aufgaben: die eine Sache in FOKUS. Anlegen, bearbeiten, erledigen (bei Wiederholung nur das
// Vorkommen), einzelne Vorkommen ändern oder überspringen, löschen. Die Listen für „Aufgaben“.
import {
  addDays,
  cleanRecurrence,
  dayInZone,
  recurrenceLabel,
  todayIn,
  type Day,
} from '@fokus/core';
import { task, taskOccurrence, withUser, type Db } from '@fokus/db';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import { keyAuth } from './api-keys';
import { buildAgenda } from './agenda';
import type { Vars } from './app';
import { anchorOf, authed, day, hhmm, parseBody, taskOut, uuid } from './planning';

const title = z.string().trim().min(1, 'Gib einen Titel ein.').max(200);
const minutes = z.number().int().min(1, 'Die Dauer muss mindestens 1 Minute sein.').max(720);
const recurrence = z
  .object({
    freq: z.enum(['daily', 'weekdays', 'weekly']),
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .nullable();

const fields = {
  title,
  kind: z.enum(['work', 'pause', 'social']),
  minutes,
  schedule: z.enum(['auto', 'fixed', 'later']),
  fixedAt: z.iso.datetime().nullable(),
  due: day.nullable(),
  recurrence,
  note: z.string().max(2000),
};

/** Widersprüche auflösen: feste Zeit nur mit Zeitpunkt, „später“ wiederholt sich nicht. */
function normalize<T extends { schedule?: string; fixedAt?: string | null; recurrence?: unknown }>(
  b: T,
): string | null {
  if (b.schedule === 'fixed' && !b.fixedAt) return 'Wähle Tag und Uhrzeit für die feste Zeit.';
  if (b.schedule === 'later' && b.recurrence)
    return 'Eine wiederkehrende Aufgabe braucht eine Zeit.';
  return null;
}

export function registerTaskRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);
  const idOf = (raw: string) => (uuid.safeParse(raw).success ? raw : null);

  // ---------- Listen für „Aufgaben“ ----------

  app.get('/api/tasks', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const view = c.req.query('view') ?? 'open';
    const today = todayIn();
    const now = Date.now();
    if (view === 'open') {
      const out = await withUser(db, u.id, async (tx) => {
        const agenda = await buildAgenda(tx, today, addDays(today, 6), now);
        const rows = await tx.select().from(task).where(eq(task.status, 'open'));
        const later = rows
          .filter((t) => t.schedule === 'later')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const list = (d: Day) => agenda.days[d]?.items ?? [];
        return {
          today: list(today),
          week: Object.keys(agenda.days)
            .filter((d) => d > today)
            .sort()
            .map((d) => ({ day: d, items: list(d).filter((i) => i.kind !== 'event') })),
          later: later.map(taskOut),
          waiting: agenda.waiting.map(taskOut),
        };
      });
      return c.json(out);
    }
    if (view === 'recurring') {
      const rows = await withUser(db, u.id, (tx) =>
        tx.select().from(task).where(isNotNull(task.recurrence)).orderBy(desc(task.createdAt)),
      );
      return c.json(
        rows.map((t) => ({ ...taskOut(t), label: recurrenceLabel(t.recurrence, t.anchor) })),
      );
    }
    if (view === 'done') {
      const since = new Date(now - 30 * 86400_000);
      const out = await withUser(db, u.id, async (tx) => {
        const once = await tx
          .select()
          .from(task)
          .where(and(eq(task.status, 'done'), gte(task.doneAt, since)));
        const occ = await tx
          .select({ o: taskOccurrence, t: task })
          .from(taskOccurrence)
          .innerJoin(task, eq(task.id, taskOccurrence.taskId))
          .where(and(isNotNull(taskOccurrence.doneAt), gte(taskOccurrence.doneAt, since)));
        const rows = [
          ...once.map((t) => ({
            key: t.id,
            taskId: t.id,
            day: dayInZone(t.doneAt!),
            title: t.title,
            kind: t.kind,
            minutes: t.minutes,
            doneAt: t.doneAt!.toISOString(),
            recurring: '',
          })),
          ...occ.map(({ o, t }) => ({
            key: `${t.id}@${o.day}`,
            taskId: t.id,
            day: o.day,
            title: o.title ?? t.title,
            kind: t.kind,
            minutes: o.minutes ?? t.minutes,
            doneAt: o.doneAt!.toISOString(),
            recurring: recurrenceLabel(t.recurrence, t.anchor),
          })),
        ];
        return rows.sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1)).slice(0, 100);
      });
      return c.json(out);
    }
    return c.json({ error: 'Unbekannte Ansicht.' }, 400);
  });

  // ---------- Anlegen und ändern ----------

  app.post('/api/tasks', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        id: uuid.optional(),
        title,
        kind: fields.kind.default('work'),
        minutes: minutes.default(30),
        schedule: fields.schedule.default('later'),
        fixedAt: fields.fixedAt.default(null),
        due: fields.due.default(null),
        recurrence: recurrence.default(null),
        note: fields.note.default(''),
      }),
    );
    if (b instanceof Response) return b;
    const bad = normalize(b);
    if (bad) return c.json({ error: bad }, 400);
    const fixedAt = b.schedule === 'fixed' && b.fixedAt ? new Date(b.fixedAt) : null;
    const row = await withUser(db, u.id, async (tx) => {
      // Mit eigener ID wiederholbar (Offline-Warteschlange): zweiter Aufruf ändert nichts
      const [made] = await tx
        .insert(task)
        .values({
          ...(b.id && { id: b.id }),
          userId: u.id,
          title: b.title,
          kind: b.kind,
          minutes: b.minutes,
          schedule: b.schedule,
          fixedAt,
          due: b.due,
          recurrence: cleanRecurrence(b.recurrence),
          anchor: anchorOf(fixedAt, todayIn()),
          note: b.note,
        })
        .onConflictDoNothing()
        .returning();
      if (made) return made;
      const [old] = await tx.select().from(task).where(eq(task.id, b.id!));
      return old;
    });
    return c.json(taskOut(row!), 201);
  });

  app.put('/api/tasks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(c, z.object(fields).partial());
    if (b instanceof Response) return b;
    const bad = normalize(b);
    if (bad) return c.json({ error: bad }, 400);
    const [row] = await withUser(db, u.id, async (tx) => {
      const [old] = await tx.select().from(task).where(eq(task.id, id));
      if (!old) return [];
      const schedule = b.schedule ?? old.schedule;
      const fixedAt =
        schedule !== 'fixed' ? null : b.fixedAt !== undefined ? new Date(b.fixedAt!) : old.fixedAt;
      if (schedule === 'fixed' && !fixedAt) return [];
      const rec = b.recurrence !== undefined ? cleanRecurrence(b.recurrence) : old.recurrence;
      if (schedule === 'later' && rec) return [];
      const { fixedAt: _f, recurrence: _r, ...rest } = b;
      void _f;
      void _r;
      return tx
        .update(task)
        .set({
          ...rest,
          schedule,
          fixedAt,
          recurrence: rec,
          anchor: fixedAt ? dayInZone(fixedAt) : old.anchor,
        })
        .where(eq(task.id, id))
        .returning();
    });
    return row ? c.json(taskOut(row)) : c.json({ error: 'Nicht gefunden oder ungültig.' }, 404);
  });

  /** Erledigt / wieder offen. Bei Wiederholung zählt der Tag (Standard: heute). */
  app.post('/api/tasks/:id/:state{done|reopen}', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const parsed = z
      .object({ day: day.optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'Ungültiger Tag.' }, 400);
    const b = parsed.data;
    const done = c.req.param('state') === 'done';
    const res = await withUser(db, u.id, async (tx) => {
      const [t] = await tx.select().from(task).where(eq(task.id, id));
      if (!t) return null;
      if (!t.recurrence) {
        const [row] = await tx
          .update(task)
          .set(done ? { status: 'done', doneAt: new Date() } : { status: 'open', doneAt: null })
          .where(eq(task.id, id))
          .returning();
        return row!;
      }
      const d = b.day ?? todayIn();
      await tx
        .insert(taskOccurrence)
        .values({ userId: u.id, taskId: id, day: d, doneAt: done ? new Date() : null })
        .onConflictDoUpdate({
          target: [taskOccurrence.taskId, taskOccurrence.day],
          set: { doneAt: done ? new Date() : null, skipped: false },
        });
      return t;
    });
    return res ? c.json(taskOut(res)) : notFound(c);
  });

  /** Nur ein Vorkommen ändern („Nur diese“): Titel, Dauer, Uhrzeit oder überspringen. */
  app.put('/api/tasks/:id/occurrence/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    const d = day.safeParse(c.req.param('day'));
    if (!id || !d.success) return notFound(c);
    const b = await parseBody(
      c,
      z.object({
        title: title.nullable().optional(),
        minutes: minutes.nullable().optional(),
        time: hhmm.nullable().optional(),
        skipped: z.boolean().optional(),
      }),
    );
    if (b instanceof Response) return b;
    const ok = await withUser(db, u.id, async (tx) => {
      const [t] = await tx.select({ id: task.id }).from(task).where(eq(task.id, id));
      if (!t) return false;
      await tx
        .insert(taskOccurrence)
        .values({ userId: u.id, taskId: id, day: d.data, ...b })
        .onConflictDoUpdate({ target: [taskOccurrence.taskId, taskOccurrence.day], set: b });
      return true;
    });
    return ok ? c.body(null, 204) : notFound(c);
  });

  app.delete('/api/tasks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx.delete(task).where(eq(task.id, id)).returning({ id: task.id }),
    );
    return rows.length ? c.body(null, 204) : notFound(c);
  });

  // ---------- Kurzbefehl: Notiz als Aufgabe „später“ ----------

  app.post('/api/v1/inbox', async (c) => {
    const auth = await keyAuth(db, c, 'inbox:create');
    if (auth instanceof Response) return auth;
    const b = await parseBody(c, z.object({ text: z.string().trim().min(1).max(200) }));
    if (b instanceof Response) return b;
    const [row] = await withUser(db, auth.userId, (tx) =>
      tx.insert(task).values({ userId: auth.userId, title: b.text, anchor: todayIn() }).returning(),
    );
    return c.json({ message: 'Als Aufgabe gespeichert', id: row!.id }, 201);
  });
}
