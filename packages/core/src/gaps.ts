// Freie Zeit und was dort hineinpasst („15:20–17:00 frei · Vorschlag: …“).
import type { Day } from './dates';
import { MIN_MS } from './dates';
import type { Hours, Interval } from './model';
import { subtract, workWindow } from './plan';

/** Freie Lücken ab `minGap` Minuten in der Arbeitszeit (ab `now`). */
export function freeGaps(
  day: Day,
  hours: Hours | null,
  busy: Interval[],
  now?: number,
  minGap = 15,
): Interval[] {
  const win = workWindow(day, hours, now);
  if (!win) return [];
  return subtract(win, busy).filter((g) => (g.end - g.start) / MIN_MS >= minGap);
}

export interface Candidate {
  id: string;
  minutes: number;
  due: Day | null;
}

/** Passende Aufgaben für eine Lücke: früh fällig zuerst, dann was die Lücke am besten füllt. */
export function suggestForGap<T extends Candidate>(gapMinutes: number, tasks: T[], limit = 3): T[] {
  return tasks
    .filter((t) => t.minutes > 0 && t.minutes <= gapMinutes)
    .sort((a, b) => {
      const da = a.due ?? '9999-99-99';
      const db = b.due ?? '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
      if (a.minutes !== b.minutes) return b.minutes - a.minutes;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, limit);
}

/** Eine Aufgabe für „Umleiten“: kürzer als `maxMinutes` (Standard 2 Min.), früh fällig zuerst. */
export function pickRedirectTask<T extends Candidate>(
  tasks: T[],
  maxMinutes = 2,
  skipId?: string,
): T | null {
  const fit = tasks
    .filter((t) => t.minutes > 0 && t.minutes <= maxMinutes && t.id !== skipId)
    .sort((a, b) => {
      const da = a.due ?? '9999-99-99';
      const db = b.due ?? '9999-99-99';
      return da !== db ? (da < db ? -1 : 1) : a.id < b.id ? -1 : 1;
    });
  return fit[0] ?? null;
}
