// Scroll-Guthaben: Fokus-Zeit verdient Minuten, Social-Slots und „10 Min. vom Guthaben nehmen“
// geben sie aus. Das Tageslimit begrenzt, wie viel pro Tag ausgegeben werden darf.
import { dayInZone, type Day } from './dates';
import type { PlanSettings } from './model';

export type CreditReason = 'focus' | 'social' | 'redirect' | 'override' | 'adjust';

export interface CreditEntry {
  /** Zeitpunkt (ISO) */
  at: string;
  /** Plus = verdient, minus = ausgegeben */
  minutes: number;
  reason: CreditReason;
}

/** Verdiente Minuten für eine Fokus-Zeit (abgerundet): 50 Min. bei 15 pro Stunde = 12. */
export const earnedFor = (focusMinutes: number, creditPerHour: number): number =>
  Math.max(0, Math.floor((focusMinutes * creditPerHour) / 60));

export const balanceOf = (entries: CreditEntry[]): number =>
  entries.reduce((s, e) => s + e.minutes, 0);

const isSpend = (e: CreditEntry) => e.minutes < 0 && e.reason !== 'adjust';

/** An einem Tag (Berlin) ausgegebene Minuten (positiv). */
export const spentOn = (entries: CreditEntry[], day: Day): number =>
  entries.filter((e) => isSpend(e) && dayInZone(e.at) === day).reduce((s, e) => s - e.minutes, 0);

/** An einem Tag verdiente Minuten. */
export const earnedOn = (entries: CreditEntry[], day: Day): number =>
  entries
    .filter((e) => e.reason === 'focus' && e.minutes > 0 && dayInZone(e.at) === day)
    .reduce((s, e) => s + e.minutes, 0);

export const limitLeft = (entries: CreditEntry[], day: Day, dailyLimit: number): number =>
  Math.max(0, dailyLimit - spentOn(entries, day));

export interface SpendResult {
  /** Wie viele Minuten wirklich abgezogen werden dürfen */
  granted: number;
  /** Wie viele fehlen (gewünscht − granted) */
  short: number;
  /** Warum weniger: zu wenig Guthaben oder Tageslimit */
  limitedBy: 'balance' | 'limit' | null;
}

/** Ausgeben: höchstens Guthaben und Rest des Tageslimits. */
export function spend(
  entries: CreditEntry[],
  wanted: number,
  day: Day,
  dailyLimit: number,
): SpendResult {
  const want = Math.max(0, Math.floor(wanted));
  const bal = Math.max(0, balanceOf(entries));
  const left = limitLeft(entries, day, dailyLimit);
  const granted = Math.min(want, bal, left);
  const limitedBy = granted === want ? null : bal <= left ? 'balance' : 'limit';
  return { granted, short: want - granted, limitedBy };
}

export interface CreditSummary {
  balance: number;
  earnedToday: number;
  spentToday: number;
  limitLeft: number;
}

export function creditSummary(
  entries: CreditEntry[],
  day: Day,
  settings: Pick<PlanSettings, 'dailyLimit'>,
): CreditSummary {
  return {
    balance: balanceOf(entries),
    earnedToday: earnedOn(entries, day),
    spentToday: spentOn(entries, day),
    limitLeft: limitLeft(entries, day, settings.dailyLimit),
  };
}
