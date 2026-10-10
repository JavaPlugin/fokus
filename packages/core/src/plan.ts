// Planer: automatische Aufgaben in die Arbeitszeit legen, um feste Termine herum. Reine
// Funktionen, alles in Millisekunden. Aufgaben mit fester Zeit gehen immer (auch außerhalb der
// Arbeitszeit) und zählen hier nur als belegte Zeit.
//
// Eine Aufgabe bekommt einen zusammenhängenden Platz (keine Stücke). Passt sie an einem Tag nicht
// mehr hinein, kommt sie an den nächsten Arbeitstag. Wiederkehrende Aufgaben gehören zu ihrem Tag
// und werden zuerst platziert, einmalige füllen danach den Rest.
import { MIN_MS, instant, type Day } from './dates';
import type { Hours, Interval } from './model';

const GRID = 5;
const ceilTo = (ms: number, step: number) => Math.ceil(ms / (step * MIN_MS)) * step * MIN_MS;

/** Überlappende Zeiten zusammenfassen, sortiert. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Fenster minus belegte Zeiten. */
export function subtract(window: Interval, busy: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = window.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) out.push({ start: cursor, end: window.end });
  return out;
}

/** Arbeitsfenster eines Tages, ab `now` (auf 5 Minuten aufgerundet), oder null (frei). */
export function workWindow(day: Day, hours: Hours | null, now?: number): Interval | null {
  if (!hours) return null;
  let start = instant(day, hours.from);
  const end = instant(day, hours.to);
  if (now !== undefined) start = Math.max(start, ceilTo(now, GRID));
  return end > start ? { start, end } : null;
}

export interface AutoTask {
  id: string;
  minutes: number;
}
export interface Placed {
  taskId: string;
  start: number;
  minutes: number;
}
export interface DayInput {
  day: Day;
  hours: Hours | null;
  /** Belegt: Termine, feste Aufgaben, laufende oder erledigte Zeiten */
  busy: Interval[];
  /** Wiederkehrende automatische Aufgaben, die an diesem Tag dran sind */
  recurring: AutoTask[];
}

/** Platz für `minutes` in der freien Zeit (frühester, auf 5 Minuten gerundet), sonst null. */
function slot(free: Interval[], minutes: number): number | null {
  for (const f of free) {
    const start = ceilTo(f.start, GRID);
    if (f.end - start >= minutes * MIN_MS) return start;
  }
  return null;
}

function take(free: Interval[], start: number, minutes: number): Interval[] {
  const end = start + minutes * MIN_MS;
  return free.flatMap((f) => {
    if (end <= f.start || start >= f.end) return [f];
    const parts: Interval[] = [];
    if (start > f.start) parts.push({ start: f.start, end: start });
    if (end < f.end) parts.push({ start: end, end: f.end });
    return parts;
  });
}

export interface AheadResult {
  /** Platzierungen je Tag, nach Beginn sortiert */
  byDay: Record<Day, Placed[]>;
  /** Wiederkehrende Aufgaben, die an ihrem Tag keinen Platz fanden */
  missedRecurring: { taskId: string; day: Day }[];
  /** Einmalige Aufgaben, die in den betrachteten Tagen keinen Platz fanden */
  unplaced: string[];
}

/**
 * Plant über mehrere Tage (der Reihe nach). `oneOff` = einmalige automatische Aufgaben in
 * Reihenfolge der Wichtigkeit. `now` gilt nur für den ersten Tag, falls er heute ist.
 */
export function planAhead(days: DayInput[], oneOff: AutoTask[], now?: number): AheadResult {
  const byDay: Record<Day, Placed[]> = {};
  const missedRecurring: AheadResult['missedRecurring'] = [];
  let pending = [...oneOff];
  for (const d of days) {
    const placed: Placed[] = [];
    byDay[d.day] = placed;
    const win = workWindow(d.day, d.hours, now);
    let free = win ? subtract(win, d.busy) : [];
    for (const t of d.recurring) {
      const at = slot(free, t.minutes);
      if (at === null) missedRecurring.push({ taskId: t.id, day: d.day });
      else {
        placed.push({ taskId: t.id, start: at, minutes: t.minutes });
        free = take(free, at, t.minutes);
      }
    }
    const next: AutoTask[] = [];
    for (const t of pending) {
      const at = slot(free, t.minutes);
      if (at === null) next.push(t);
      else {
        placed.push({ taskId: t.id, start: at, minutes: t.minutes });
        free = take(free, at, t.minutes);
      }
    }
    pending = next;
    placed.sort((a, b) => a.start - b.start);
    now = undefined;
  }
  return { byDay, missedRecurring, unplaced: pending.map((t) => t.id) };
}
