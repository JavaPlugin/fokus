// Einstellungen, der Tag (Tagesplan), Fokus-Durchgänge und Scroll-Guthaben.
import {
  DEFAULT_SETTINGS,
  creditSummary,
  dayInZone,
  earnedFor,
  minutesBetween,
  spend,
  todayIn,
} from '@fokus/core';
import {
  creditEntry,
  focusSession,
  task,
  taskOccurrence,
  userSettings,
  withUser,
  type Db,
} from '@fokus/db';
import { and, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import { buildAgenda, gapsOf } from './agenda';
import type { Vars } from './app';
import { emitEvent } from './events';
import {
  authed,
  day,
  dayRange,
  hhmm,
  loadCredit,
  loadSettings,
  parseBody,
  taskOut,
  uuid,
} from './planning';

const minutes = z.number().int().min(1).max(600);
const hours = z
  .object({ from: hhmm, to: hhmm })
  .refine((h) => h.from < h.to, { message: 'Der Tag muss vor seinem Ende beginnen.' })
  .nullable();

const settingsInput = z
  .object({
    focusMinutes: z.number().int().min(10).max(120),
    pauseMinutes: z.number().int().min(0).max(60),
    creditPerHour: z.number().int().min(0).max(60),
    dailyLimit: z.number().int().min(0).max(600),
    week: z.array(hours).length(7),
    baselineScroll: z.number().int().min(0).max(600),
    streakGoal: z.number().int().min(1).max(600),
    redirectBonus: z.number().int().min(0).max(30),
    redirectSpend: z.number().int().min(1).max(60),
  })
  .partial();

export function registerDayRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);
  const idOf = (raw: string) => (uuid.safeParse(raw).success ? raw : null);

  // ---------- Einstellungen (Arbeitszeiten und Regeln) ----------

  app.get('/api/plan/settings', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    return c.json(await withUser(db, u.id, loadSettings));
  });

  app.put('/api/plan/settings', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, settingsInput);
    if (b instanceof Response) return b;
    return c.json(
      await withUser(db, u.id, async (tx) => {
        const [row] = await tx.select({ p: userSettings.plan }).from(userSettings);
        const stored = { ...(row?.p ?? {}), ...b };
        await tx
          .insert(userSettings)
          .values({ userId: u.id, plan: stored })
          .onConflictDoUpdate({ target: userSettings.userId, set: { plan: stored } });
        return { ...DEFAULT_SETTINGS, ...stored };
      }),
    );
  });

  // ---------- Ein Tag ----------

  app.get('/api/day/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const d = day.safeParse(c.req.param('day'));
    if (!d.success) return c.json({ error: d.error.issues[0]!.message }, 400);
    const today = todayIn();
    const now = Date.now();
    const { from, to } = dayRange(d.data);
    const out = await withUser(db, u.id, async (tx) => {
      const agenda = await buildAgenda(tx, today, d.data, now);
      const entry = agenda.days[d.data];
      const later = (await tx.select().from(task).where(eq(task.status, 'open'))).filter(
        (t) => t.schedule === 'later',
      );
      const sessions = await tx.select().from(focusSession);
      const running = sessions.find((s) => s.status === 'running');
      const focusMinutes = sessions
        .filter((s) => s.startedAt >= from && s.startedAt < to)
        .reduce((s, x) => s + x.focusedMinutes, 0);
      const entries = await loadCredit(tx);
      return {
        day: d.data,
        hours: entry?.hours ?? null,
        settings: agenda.settings,
        items: entry?.items ?? [],
        gaps: gapsOf(agenda, d.data, now, today, later),
        waiting: agenda.waiting.map(taskOut),
        credit: creditSummary(entries, today, agenda.settings),
        focusMinutes,
        running: running
          ? {
              id: running.id,
              taskId: running.taskId,
              day: dayInZone(running.startedAt),
              startedAt: running.startedAt.toISOString(),
              plannedMinutes: running.plannedMinutes,
            }
          : null,
      };
    });
    return c.json(out);
  });

  // ---------- Fokus-Durchgang ----------

  const runOut = (r: typeof focusSession.$inferSelect) => ({
    id: r.id,
    taskId: r.taskId,
    day: dayInZone(r.startedAt),
    startedAt: r.startedAt.toISOString(),
    plannedMinutes: r.plannedMinutes,
  });

  app.get('/api/focus/current', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const [row] = await withUser(db, u.id, (tx) =>
      tx.select().from(focusSession).where(eq(focusSession.status, 'running')),
    );
    return c.json(row ? runOut(row) : null);
  });

  app.post('/api/focus/start', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({ taskId: uuid.optional(), minutes: minutes.optional() }),
    );
    if (b instanceof Response) return b;
    const res = await withUser(db, u.id, async (tx) => {
      if (
        (
          await tx
            .select({ id: focusSession.id })
            .from(focusSession)
            .where(eq(focusSession.status, 'running'))
        ).length
      )
        return { error: 'Es läuft schon ein Fokus-Block.', status: 409 as const };
      const settings = await loadSettings(tx);
      const [t] = b.taskId ? await tx.select().from(task).where(eq(task.id, b.taskId)) : [];
      if (b.taskId && !t) return { error: 'Aufgabe nicht gefunden.', status: 404 as const };
      const planned = b.minutes ?? t?.minutes ?? settings.focusMinutes;
      const [s] = await tx
        .insert(focusSession)
        .values({
          userId: u.id,
          taskId: t?.id ?? null,
          startedAt: new Date(),
          plannedMinutes: Math.min(planned, 600),
        })
        .returning();
      return { session: s!, title: t?.title ?? '' };
    });
    if ('error' in res) return c.json({ error: res.error }, res.status);
    emitEvent(u.id, 'focus.started', {
      title: res.title,
      minutes: res.session.plannedMinutes,
      startedAt: res.session.startedAt.toISOString(),
    });
    return c.json(runOut(res.session), 201);
  });

  app.post('/api/focus/:id/finish', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(
      c,
      z.object({ taskDone: z.boolean().default(false), minutes: minutes.optional() }),
    );
    if (b instanceof Response) return b;
    const res = await withUser(db, u.id, async (tx) => {
      const [s] = await tx
        .select()
        .from(focusSession)
        .where(and(eq(focusSession.id, id), eq(focusSession.status, 'running')));
      if (!s) return null;
      const settings = await loadSettings(tx);
      const now = new Date();
      // Gearbeitet: so lange der Timer lief, höchstens die geplante Zeit plus 30 Min. Nachlauf
      const elapsed = minutesBetween(s.startedAt, now);
      const focused = Math.max(0, Math.min(b.minutes ?? elapsed, elapsed, s.plannedMinutes + 30));
      const status = focused >= 1 ? ('done' as const) : ('abandoned' as const);
      await tx
        .update(focusSession)
        .set({ endedAt: now, focusedMinutes: focused, status })
        .where(eq(focusSession.id, id));
      const earned = earnedFor(focused, settings.creditPerHour);
      if (earned > 0)
        await tx.insert(creditEntry).values({
          userId: u.id,
          at: now,
          minutes: earned,
          reason: 'focus',
          sessionId: id,
        });
      let title = '';
      if (s.taskId) {
        const [t] = await tx.select().from(task).where(eq(task.id, s.taskId));
        title = t?.title ?? '';
        if (b.taskDone && t) {
          if (t.recurrence)
            await tx
              .insert(taskOccurrence)
              .values({ userId: u.id, taskId: t.id, day: dayInZone(s.startedAt), doneAt: now })
              .onConflictDoUpdate({
                target: [taskOccurrence.taskId, taskOccurrence.day],
                set: { doneAt: now, skipped: false },
              });
          else await tx.update(task).set({ status: 'done', doneAt: now }).where(eq(task.id, t.id));
        }
      }
      return {
        focused,
        earned,
        title,
        credit: creditSummary(await loadCredit(tx), todayIn(), settings),
      };
    });
    if (!res) return notFound(c);
    emitEvent(u.id, 'focus.ended', { title: res.title, minutes: res.focused, earned: res.earned });
    return c.json({ focusedMinutes: res.focused, earned: res.earned, credit: res.credit });
  });

  // ---------- Scroll-Guthaben ----------

  app.get('/api/credit', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    return c.json(
      await withUser(db, u.id, async (tx) => {
        const settings = await loadSettings(tx);
        const entries = await loadCredit(tx);
        const last = (await tx.select().from(creditEntry))
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .slice(0, 30);
        return {
          ...creditSummary(entries, todayIn(), settings),
          perHour: settings.creditPerHour,
          dailyLimit: settings.dailyLimit,
          entries: last.map((r) => ({
            id: r.id,
            at: r.at.toISOString(),
            minutes: r.minutes,
            reason: r.reason,
          })),
        };
      }),
    );
  });

  /** Guthaben ausgeben: Social-Aufgabe oder „10 Min. vom Guthaben nehmen“. */
  app.post('/api/credit/spend', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, z.object({ minutes, reason: z.enum(['social', 'redirect']) }));
    if (b instanceof Response) return b;
    return c.json(
      await withUser(db, u.id, async (tx) => {
        const settings = await loadSettings(tx);
        const entries = await loadCredit(tx);
        const today = todayIn();
        const r = spend(entries, b.minutes, today, settings.dailyLimit);
        if (r.granted > 0) {
          await tx
            .insert(creditEntry)
            .values({ userId: u.id, minutes: -r.granted, reason: b.reason });
          entries.push({ at: new Date().toISOString(), minutes: -r.granted, reason: b.reason });
        }
        return { ...r, credit: creditSummary(entries, today, settings) };
      }),
    );
  });
}
