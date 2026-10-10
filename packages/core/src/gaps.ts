// Lücken-Füller: freie Minuten zwischen den Blöcken und passende kleine Aufgaben dafür.
import type { Day } from './dates';
import { MIN_MS } from './dates';
import type { Interval, PlanSettings, TaskLite } from './model';
import { subtract, workWindow } from './plan';

/** Freie Lücken ab `minGap` Minuten im Arbeitsfenster (ab `now`). */
export function freeGaps(
  day: Day,
  busy: Interval[],
  settings: PlanSettings,
  now?: number,
  minGap = 15,
): Interval[] {
  const win = workWindow(day, settings, now);
  if (!win) return [];
  return subtract(win, busy).filter((g) => (g.end - g.start) / MIN_MS >= minGap);
}

/**
 * Passende Aufgaben für eine Lücke: nur was hineinpasst, Mini-Aufgaben und früh Fälliges zuerst,
 * sonst die, die die Lücke am besten füllen.
 */
export function suggestForGap(gapMinutes: number, tasks: TaskLite[], limit = 3): TaskLite[] {
  return tasks
    .filter((t) => t.minutes > 0 && t.minutes <= gapMinutes)
    .sort((a, b) => {
      const da = a.due ?? '9999-99-99';
      const db = b.due ?? '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
      if (a.mini !== b.mini) return a.mini ? -1 : 1;
      if (a.minutes !== b.minutes) return b.minutes - a.minutes;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, limit);
}

/** Eine Aufgabe für „Umleiten“: eine Mini-Aufgabe bis `maxMinutes` (Standard 2 Min.). */
export function pickRedirectTask(
  tasks: TaskLite[],
  maxMinutes = 2,
  skipId?: string,
): TaskLite | null {
  const fit = tasks
    .filter((t) => t.mini && t.minutes > 0 && t.minutes <= maxMinutes && t.id !== skipId)
    .sort((a, b) => {
      const da = a.due ?? '9999-99-99';
      const db = b.due ?? '9999-99-99';
      return da !== db ? (da < db ? -1 : 1) : a.id < b.id ? -1 : 1;
    });
  return fit[0] ?? null;
}
