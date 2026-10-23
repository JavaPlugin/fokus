// Gemeinsame Helfer für Aufgaben, Tagesplan und Guthaben (nur innerhalb von withUser).
import {
  DEFAULT_SETTINGS,
  addDays,
  dayInZone,
  instant,
  todayIn,
  type CreditEntry,
  type Day,
  type PlanSettings,
  type Recurrence,
} from '@fokus/core';
import { creditEntry, task, timeBlock, userSettings, type Db } from '@fokus/db';
import type { Context } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';

export type TaskRow = typeof task.$inferSelect;
export type EventRow = typeof timeBlock.$inferSelect;

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiger Tag.');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ungültige Uhrzeit.');
export const uuid = z.uuid();

/** Gelockerte Einstellungen, die erst ab einem Tag gelten (siehe splitSettingsChange). */
export type PendingSettings = { from: Day; values: Partial<PlanSettings> };
type StoredPlan = Partial<PlanSettings> & { pending?: PendingSettings };

/** Gespeicherte Werte mit fälligen Lockerungen verrechnet, dazu was noch aussteht. */
export function resolvePlan(
  stored: StoredPlan | null | undefined,
  today: Day = todayIn(),
): { own: Partial<PlanSettings>; pending: PendingSettings | null } {
  const { pending, ...own } = stored ?? {};
  if (pending && pending.from <= today)
    return { own: { ...own, ...pending.values }, pending: null };
  return { own, pending: pending ?? null };
}

/** Einstellungen: Standardwerte aus dem Kern, darüber die eigenen (fällige Lockerungen inklusive). */
export async function loadSettings(tx: Db): Promise<PlanSettings> {
  const [row] = await tx.select({ p: userSettings.plan }).from(userSettings);
  const { own } = resolvePlan(row?.p as StoredPlan | null);
  return { ...DEFAULT_SETTINGS, ...own, week: own.week ?? DEFAULT_SETTINGS.week };
}

/** Aufgabe für die Oberfläche. */
export const taskOut = (t: TaskRow) => ({
  id: t.id,
  title: t.title,
  kind: t.kind,
  minutes: t.minutes,
  schedule: t.schedule,
  fixedAt: t.fixedAt?.toISOString() ?? null,
  due: t.due,
  recurrence: (t.recurrence ?? null) as Recurrence | null,
  anchor: t.anchor,
  status: t.status,
  doneAt: t.doneAt?.toISOString() ?? null,
  note: t.note,
  createdAt: t.createdAt.toISOString(),
});

/** Kalender-Termin (Abo) für die Oberfläche. */
export const eventOut = (b: EventRow) => ({
  id: b.id,
  startsAt: b.startsAt.toISOString(),
  minutes: b.minutes,
  title: b.title,
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

/** Anker einer Aufgabe: Tag der festen Zeit, sonst heute. */
export const anchorOf = (fixedAt: Date | null, today: Day): Day =>
  fixedAt ? dayInZone(fixedAt) : today;

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
