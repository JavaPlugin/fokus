// Woche: Fokus- und Social-Zeit pro Tag, Zeit-Konto „vom Scrollen zurückgeholt“, Serie.
import {
  addDays,
  dayInZone,
  instant,
  spentOn,
  streak,
  todayIn,
  weekStart,
  weekSummary,
  type CreditEntry,
  type Day,
} from '@fokus/core';
import { creditEntry, focusSession, task, withUser, type Db } from '@fokus/db';
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { Vars } from './app';
import { authed, day, loadSettings } from './planning';

export function registerWeekRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  app.get('/api/week/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const d = day.safeParse(c.req.param('day'));
    if (!d.success) return c.json({ error: d.error.issues[0]!.message }, 400);
    const today = todayIn();
    const start = weekStart(d.data);
    const from = new Date(instant(start, '00:00'));
    const to = new Date(instant(addDays(start, 7), '00:00'));
    // Für die Serie: die letzten 120 Tage
    const since = new Date(instant(addDays(today, -120), '00:00'));
    const out = await withUser(db, u.id, async (tx) => {
      const settings = await loadSettings(tx);
      const sessions = await tx
        .select()
        .from(focusSession)
        .where(and(gte(focusSession.startedAt, since), eq(focusSession.status, 'done')));
      const focusByDay: Record<Day, number> = {};
      for (const s of sessions) {
        const k = dayInZone(s.startedAt);
        focusByDay[k] = (focusByDay[k] ?? 0) + s.focusedMinutes;
      }
      const credit = await tx
        .select()
        .from(creditEntry)
        .where(and(gte(creditEntry.at, from), lt(creditEntry.at, to)));
      const entries: CreditEntry[] = credit.map((r) => ({
        at: r.at.toISOString(),
        minutes: r.minutes,
        reason: r.reason,
      }));
      const totals: Record<Day, { focus: number; social: number }> = {};
      for (let i = 0; i < 7; i++) {
        const k = addDays(start, i);
        totals[k] = { focus: focusByDay[k] ?? 0, social: spentOn(entries, k) };
      }
      const done = await tx
        .select({ id: task.id })
        .from(task)
        .where(and(eq(task.status, 'done'), gte(task.doneAt, from), lt(task.doneAt, to)));
      const summary = weekSummary(totals, start, today, settings.baselineScroll);
      return {
        ...summary,
        today,
        streak: streak(focusByDay, today, settings.streakGoal),
        streakGoal: settings.streakGoal,
        baselineScroll: settings.baselineScroll,
        tasksDone: done.length,
      };
    });
    return c.json(out);
  });
}
