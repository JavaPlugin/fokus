// Tag, Zeitblöcke, Tagesplan, Fokus-Durchgänge und Scroll-Guthaben.
import {
  DEFAULT_SETTINGS,
  MIN_MS,
  creditSummary,
  earnedFor,
  freeGaps,
  minutesBetween,
  planDay,
  spend,
  suggestForGap,
  todayIn,
  type Interval,
} from '@fokus/core';
import {
  creditEntry,
  energyDay,
  focusSession,
  task,
  timeBlock,
  userSettings,
  withUser,
  type Db,
} from '@fokus/db';
import { and, asc, desc, eq, gte, lt, ne } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import { emitEvent } from './events';
import {
  authed,
  blockOut,
  day,
  dayRange,
  hhmm,
  lite,
  loadCredit,
  loadSettings,
  parseBody,
  taskOut,
  uuid,
} from './planning';

const minutes = z.number().int().min(1).max(600);

const settingsInput = z
  .object({
    focusMinutes: z.number().int().min(10).max(120),
    pauseMinutes: z.number().int().min(0).max(60),
    creditPerHour: z.number().int().min(0).max(60),
    dailyLimit: z.number().int().min(0).max(600),
    workStart: hhmm,
    workEnd: hhmm,
    baselineScroll: z.number().int().min(0).max(600),
    streakGoal: z.number().int().min(1).max(600),
    redirectBonus: z.number().int().min(0).max(30),
    redirectSpend: z.number().int().min(1).max(60),
    peaks: z.array(z.object({ from: hhmm, to: hhmm }).refine((p) => p.from < p.to)).max(4),
  })
  .partial()
  .refine((s) => !s.workStart || !s.workEnd || s.workStart < s.workEnd, {
    message: 'Der Tag muss vor seinem Ende beginnen.',
  });

export function registerDayRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);
  const idOf = (raw: string) => (uuid.safeParse(raw).success ? raw : null);

  // ---------- Einstellungen ----------

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
    const merged = await withUser(db, u.id, async (tx) => {
      const [row] = await tx.select({ p: userSettings.plan }).from(userSettings);
      const stored = { ...(row?.p ?? {}), ...b };
      const all = { ...DEFAULT_SETTINGS, ...stored };
      if (all.workStart >= all.workEnd) return null;
      await tx
        .insert(userSettings)
        .values({ userId: u.id, plan: stored })
        .onConflictDoUpdate({ target: userSettings.userId, set: { plan: stored } });
      return all;
    });
    return merged
      ? c.json(merged)
      : c.json({ error: 'Der Tag muss vor seinem Ende beginnen.' }, 400);
  });

  // ---------- Ein Tag auf einen Blick ----------

  app.get('/api/day/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const d = day.safeParse(c.req.param('day'));
    if (!d.success) return c.json({ error: d.error.issues[0]!.message }, 400);
    const { from, to } = dayRange(d.data);
    const now = Date.now();
    const out = await withUser(db, u.id, async (tx) => {
      const settings = await loadSettings(tx);
      const blocks = await tx
        .select()
        .from(timeBlock)
        .where(and(gte(timeBlock.startsAt, from), lt(timeBlock.startsAt, to)))
        .orderBy(asc(timeBlock.startsAt));
      const open = await tx.select().from(task).where(eq(task.status, 'open'));
      const energy =
        (await tx.select().from(energyDay).where(eq(energyDay.day, d.data)))[0]?.level ?? null;
      const sessions = await tx
        .select()
        .from(focusSession)
        .where(and(gte(focusSession.startedAt, from), lt(focusSession.startedAt, to)));
      const [running] = await tx
        .select()
        .from(focusSession)
        .where(eq(focusSession.status, 'running'));
      const entries = await loadCredit(tx);
      const busy: Interval[] = blocks
        .filter((b) => b.status !== 'skipped')
        .map((b) => ({
          start: b.startsAt.getTime(),
          end: b.startsAt.getTime() + b.minutes * MIN_MS,
        }));
      const planned = new Set(blocks.map((b) => b.taskId).filter(Boolean));
      const candidates = open.filter((t) => !planned.has(t.id)).map(lite);
      const isToday = todayIn() === d.data;
      const gaps = freeGaps(d.data, busy, settings, isToday ? now : undefined).map((g) => {
        const m = Math.floor((g.end - g.start) / MIN_MS);
        return {
          startsAt: new Date(g.start).toISOString(),
          minutes: m,
          suggestions: suggestForGap(m, candidates).map((t) => t.id),
        };
      });
      return {
        day: d.data,
        settings,
        energy,
        blocks: blocks.map(blockOut),
        tasks: open.map(taskOut),
        credit: creditSummary(entries, todayIn(), settings),
        focusMinutes: sessions.reduce((s, x) => s + x.focusedMinutes, 0),
        running: running
          ? {
              id: running.id,
              blockId: running.blockId,
              taskId: running.taskId,
              startedAt: running.startedAt.toISOString(),
              plannedMinutes: running.plannedMinutes,
            }
          : null,
        gaps,
      };
    });
    return c.json(out);
  });

  // ---------- Energie am Morgen ----------

  app.put('/api/energy/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const d = day.safeParse(c.req.param('day'));
    if (!d.success) return c.json({ error: d.error.issues[0]!.message }, 400);
    const b = await parseBody(c, z.object({ level: z.enum(['low', 'normal', 'high']) }));
    if (b instanceof Response) return b;
    await withUser(db, u.id, (tx) =>
      tx
        .insert(energyDay)
        .values({ userId: u.id, day: d.data, level: b.level })
        .onConflictDoUpdate({ target: [energyDay.userId, energyDay.day], set: { level: b.level } }),
    );
    return c.json({ day: d.data, level: b.level });
  });

  // ---------- Zeitblöcke ----------

  const blockFields = {
    kind: z.enum(['focus', 'pause', 'social', 'event']),
    startsAt: z.iso.datetime(),
    minutes,
    title: z.string().trim().max(200),
    taskId: uuid.nullable(),
  };

  app.post('/api/blocks', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        id: uuid.optional(),
        ...blockFields,
        title: blockFields.title.default(''),
        taskId: blockFields.taskId.default(null),
      }),
    );
    if (b instanceof Response) return b;
    const row = await withUser(db, u.id, async (tx) => {
      if (
        b.taskId &&
        !(await tx.select({ id: task.id }).from(task).where(eq(task.id, b.taskId))).length
      )
        return null;
      const [made] = await tx
        .insert(timeBlock)
        .values({
          ...(b.id && { id: b.id }),
          userId: u.id,
          kind: b.kind,
          startsAt: new Date(b.startsAt),
          minutes: b.minutes,
          title: b.title,
          taskId: b.taskId,
          source: 'manual',
        })
        .onConflictDoNothing()
        .returning();
      if (made) return made;
      return (await tx.select().from(timeBlock).where(eq(timeBlock.id, b.id!)))[0] ?? null;
    });
    return row ? c.json(blockOut(row), 201) : c.json({ error: 'Aufgabe nicht gefunden.' }, 400);
  });

  app.put('/api/blocks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(
      c,
      z
        .object({
          ...blockFields,
          status: z.enum(['planned', 'running', 'done', 'skipped']),
        })
        .partial(),
    );
    if (b instanceof Response) return b;
    const { startsAt, ...rest } = b;
    const [row] = await withUser(db, u.id, (tx) =>
      tx
        .update(timeBlock)
        .set({ ...rest, ...(startsAt && { startsAt: new Date(startsAt) }), source: 'manual' })
        .where(eq(timeBlock.id, id))
        .returning(),
    );
    return row ? c.json(blockOut(row)) : notFound(c);
  });

  app.delete('/api/blocks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx.delete(timeBlock).where(eq(timeBlock.id, id)).returning({ id: timeBlock.id }),
    );
    return rows.length ? c.body(null, 204) : notFound(c);
  });

  // ---------- Tagesplan ----------

  /** Plant offene Aufgaben in die freie Zeit des Tages und ersetzt dabei den alten Plan. */
  app.post('/api/plan/:day', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const d = day.safeParse(c.req.param('day'));
    if (!d.success) return c.json({ error: d.error.issues[0]!.message }, 400);
    const today = todayIn();
    if (d.data < today) return c.json({ error: 'Vergangene Tage plant FOKUS nicht neu.' }, 400);
    const { from, to } = dayRange(d.data);
    const now = Date.now();
    const out = await withUser(db, u.id, async (tx) => {
      const settings = await loadSettings(tx);
      // Alten Plan weg: nur Geplantes aus der Planung, und heute nur, was noch kommt
      await tx
        .delete(timeBlock)
        .where(
          and(
            eq(timeBlock.source, 'plan'),
            eq(timeBlock.status, 'planned'),
            gte(
              timeBlock.startsAt,
              d.data === today ? new Date(Math.max(now, from.getTime())) : from,
            ),
            lt(timeBlock.startsAt, to),
          ),
        );
      const blocks = await tx
        .select()
        .from(timeBlock)
        .where(
          and(
            gte(timeBlock.startsAt, from),
            lt(timeBlock.startsAt, to),
            ne(timeBlock.status, 'skipped'),
          ),
        );
      const busy: Interval[] = blocks.map((b) => ({
        start: b.startsAt.getTime(),
        end: b.startsAt.getTime() + b.minutes * MIN_MS,
      }));
      const open = await tx.select().from(task).where(eq(task.status, 'open'));
      // Schon (von Hand, laufend, erledigt) eingeplante Zeit zählt von der Aufgabe ab
      const done = new Map<string, number>();
      for (const b of blocks)
        if (b.kind === 'focus' && b.taskId)
          done.set(b.taskId, (done.get(b.taskId) ?? 0) + b.minutes);
      const tasks = open
        .map(lite)
        .map((t) => ({ ...t, minutes: t.minutes - (done.get(t.id) ?? 0) }))
        .filter((t) => t.minutes > 0);
      const energy = (await tx.select().from(energyDay).where(eq(energyDay.day, d.data)))[0]?.level;
      const plan = planDay({
        day: d.data,
        now: d.data === today ? now : undefined,
        settings,
        busy,
        tasks,
        peaks: settings.peaks,
        energy,
      });
      const titles = new Map(open.map((t) => [t.id, t.title]));
      const made = plan.blocks.length
        ? await tx
            .insert(timeBlock)
            .values(
              plan.blocks.map((b) => ({
                userId: u.id,
                kind: b.kind,
                startsAt: new Date(b.start),
                minutes: b.minutes,
                title: b.kind === 'pause' ? 'Pause' : (titles.get(b.taskId!) ?? ''),
                taskId: b.taskId,
                source: 'plan' as const,
              })),
            )
            .returning()
        : [];
      return {
        blocks: made.map(blockOut),
        unplaced: plan.unplaced.map((p) => ({ ...p, title: titles.get(p.taskId) ?? '' })),
      };
    });
    return c.json(out);
  });

  // ---------- Fokus-Durchgang ----------

  app.get('/api/focus/current', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const [row] = await withUser(db, u.id, (tx) =>
      tx.select().from(focusSession).where(eq(focusSession.status, 'running')),
    );
    return c.json(
      row
        ? {
            id: row.id,
            blockId: row.blockId,
            taskId: row.taskId,
            startedAt: row.startedAt.toISOString(),
            plannedMinutes: row.plannedMinutes,
          }
        : null,
    );
  });

  app.post('/api/focus/start', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        blockId: uuid.optional(),
        taskId: uuid.optional(),
        minutes: minutes.optional(),
      }),
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
      const now = new Date();
      let block = b.blockId
        ? (await tx.select().from(timeBlock).where(eq(timeBlock.id, b.blockId)))[0]
        : undefined;
      if (b.blockId && (!block || block.kind !== 'focus'))
        return { error: 'Fokus-Block nicht gefunden.', status: 404 as const };
      const taskId = b.taskId ?? block?.taskId ?? null;
      const [t] = taskId ? await tx.select().from(task).where(eq(task.id, taskId)) : [];
      if (taskId && !t) return { error: 'Aufgabe nicht gefunden.', status: 404 as const };
      const planned = block?.minutes ?? b.minutes ?? settings.focusMinutes;
      if (block) {
        [block] = await tx
          .update(timeBlock)
          .set({ status: 'running', startsAt: now, taskId })
          .where(eq(timeBlock.id, block.id))
          .returning();
      } else {
        [block] = await tx
          .insert(timeBlock)
          .values({
            userId: u.id,
            kind: 'focus',
            startsAt: now,
            minutes: planned,
            title: t?.title ?? 'Fokus',
            taskId,
            status: 'running',
            source: 'manual',
          })
          .returning();
      }
      const [s] = await tx
        .insert(focusSession)
        .values({
          userId: u.id,
          blockId: block!.id,
          taskId,
          startedAt: now,
          plannedMinutes: planned,
        })
        .returning();
      return { session: s!, block: block!, title: t?.title ?? block!.title };
    });
    if ('error' in res) return c.json({ error: res.error }, res.status);
    emitEvent(u.id, 'focus.started', {
      title: res.title,
      minutes: res.session.plannedMinutes,
      startedAt: res.session.startedAt.toISOString(),
    });
    return c.json(
      {
        id: res.session.id,
        blockId: res.block.id,
        taskId: res.session.taskId,
        startedAt: res.session.startedAt.toISOString(),
        plannedMinutes: res.session.plannedMinutes,
      },
      201,
    );
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
      if (s.blockId)
        await tx
          .update(timeBlock)
          .set(
            status === 'done'
              ? { status: 'done', minutes: Math.max(1, focused) }
              : { status: 'skipped' },
          )
          .where(eq(timeBlock.id, s.blockId));
      const earned = earnedFor(focused, settings.creditPerHour);
      if (earned > 0)
        await tx.insert(creditEntry).values({
          userId: u.id,
          at: now,
          minutes: earned,
          reason: 'focus',
          sessionId: id,
          blockId: s.blockId,
        });
      if (b.taskDone && s.taskId)
        await tx.update(task).set({ status: 'done', doneAt: now }).where(eq(task.id, s.taskId));
      const title = s.taskId
        ? ((await tx.select({ t: task.title }).from(task).where(eq(task.id, s.taskId)))[0]?.t ?? '')
        : '';
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
        const last = await tx.select().from(creditEntry).orderBy(desc(creditEntry.at)).limit(30);
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

  /** Guthaben ausgeben: Social-Slot oder „10 Min. vom Guthaben nehmen“. */
  app.post('/api/credit/spend', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        minutes,
        reason: z.enum(['social', 'redirect']),
        blockId: uuid.optional(),
      }),
    );
    if (b instanceof Response) return b;
    return c.json(
      await withUser(db, u.id, async (tx) => {
        const settings = await loadSettings(tx);
        const entries = await loadCredit(tx);
        const today = todayIn();
        const r = spend(entries, b.minutes, today, settings.dailyLimit);
        if (r.granted > 0) {
          await tx.insert(creditEntry).values({
            userId: u.id,
            minutes: -r.granted,
            reason: b.reason,
            blockId: b.blockId ?? null,
          });
          entries.push({ at: new Date().toISOString(), minutes: -r.granted, reason: b.reason });
        }
        return { ...r, credit: creditSummary(entries, today, settings) };
      }),
    );
  });
}
