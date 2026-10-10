// Gemeinsame Helfer für Aufgaben, Zeitblöcke, Plan und Guthaben (nur innerhalb von withUser).
import {
  DEFAULT_SETTINGS,
  addDays,
  instant,
  type CreditEntry,
  type Day,
  type PlanSettings,
  type TaskLite,
} from '@fokus/core';
import { creditEntry, task, timeBlock, userSettings, type Db } from '@fokus/db';
import type { Context } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';

type TaskRow = typeof task.$inferSelect;
type BlockRow = typeof timeBlock.$inferSelect;

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiger Tag.');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ungültige Uhrzeit.');
export const uuid = z.uuid();

/** Einstellungen: Standardwerte aus dem Kern, darüber die eigenen. */
export async function loadSettings(tx: Db): Promise<PlanSettings> {
  const [row] = await tx.select({ p: userSettings.plan }).from(userSettings);
  return { ...DEFAULT_SETTINGS, ...(row?.p ?? {}) };
}

export const taskOut = (t: TaskRow) => ({
  id: t.id,
  title: t.title,
  minutes: t.minutes,
  heavy: t.heavy,
  mini: t.mini,
  due: t.due,
  status: t.status,
  doneAt: t.doneAt?.toISOString() ?? null,
  note: t.note,
  createdAt: t.createdAt.toISOString(),
});

export const blockOut = (b: BlockRow) => ({
  id: b.id,
  kind: b.kind,
  startsAt: b.startsAt.toISOString(),
  minutes: b.minutes,
  title: b.title,
  taskId: b.taskId,
  status: b.status,
  source: b.source,
});

export const lite = (t: TaskRow): TaskLite => ({
  id: t.id,
  title: t.title,
  minutes: t.minutes,
  heavy: t.heavy,
  mini: t.mini,
  due: t.due,
});

/** Buch des Guthabens im Format des Kerns. */
export async function loadCredit(tx: Db): Promise<CreditEntry[]> {
  const rows = await tx.select().from(creditEntry);
  return rows.map((r) => ({ at: r.at.toISOString(), minutes: r.minutes, reason: r.reason }));
}

/** Zeitraum eines Berliner Kalendertags in Millisekunden. */
export const dayRange = (d: Day) => ({
  from: new Date(instant(d, '00:00')),
  to: new Date(instant(addDays(d, 1), '00:00')),
});

export function authed(c: Context<Vars>): SessionUser | Response {
  const u = c.get('user');
  return u ?? c.json({ error: 'Nicht angemeldet.' }, 401);
}

export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T> | Response> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) return c.json({ error: r.error.issues[0]?.message ?? 'Ungültige Eingabe.' }, 400);
  return r.data;
}
