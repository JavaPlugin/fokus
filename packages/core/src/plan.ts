// Tagesplan: Aufgaben in freie Zeitblöcke verteilen. Reine Funktion, keine Zeitzone im Kopf:
// alles in Millisekunden, das Arbeitsfenster kommt aus den Einstellungen (Berlin).
//
// Ablauf: freie Zeit = Arbeitsfenster minus belegte Zeiten. Aufgaben nach Fälligkeit, dann
// schwere zuerst. Schwere Aufgaben versuchen es zuerst in den Hochphasen. Lange Aufgaben werden
// in Fokus-Blöcke geschnitten; nach einem vollen Block folgt eine Pause, wenn noch Arbeit wartet.
// Mini-Aufgaben bleiben draußen (Lücken-Füller und „Umleiten“).
import { MIN_MS, instant, type Day } from './dates';
import type { Interval, Peak, PlanSettings, TaskLite } from './model';

export interface PlannedBlock {
  kind: 'focus' | 'pause';
  /** Beginn in Millisekunden */
  start: number;
  minutes: number;
  /** Nur bei Fokus-Blöcken */
  taskId: string | null;
}

export interface PlanInput {
  day: Day;
  /** Jetzt (ms): davor wird nichts geplant */
  now?: number;
  settings: PlanSettings;
  /** Belegte Zeiten: Termine, Social-Slots, schon laufende oder erledigte Blöcke */
  busy: Interval[];
  tasks: TaskLite[];
  /** Hochphasen für schwere Aufgaben */
  peaks?: Peak[];
}

export interface PlanResult {
  blocks: PlannedBlock[];
  /** Aufgaben (bzw. Reste), die nicht mehr in den Tag passten */
  unplaced: { taskId: string; minutes: number }[];
}

/** Kürzester sinnvoller Fokus-Block (kürzere Reste bleiben für die Lücken). */
const MIN_CHUNK = 10;
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

/** Arbeitsfenster eines Tages, ab `now` (auf 5 Minuten aufgerundet), oder null. */
export function workWindow(day: Day, s: PlanSettings, now?: number): Interval | null {
  let start = instant(day, s.workStart);
  const end = instant(day, s.workEnd);
  if (now !== undefined) start = Math.max(start, ceilTo(now, GRID));
  return end > start ? { start, end } : null;
}

const minutesOf = (i: Interval) => Math.floor((i.end - i.start) / MIN_MS);

/** Reihenfolge: überfällig/früh fällig zuerst, schwere vor leichten, lange vor kurzen. */
function order(tasks: TaskLite[]): TaskLite[] {
  return [...tasks].sort((a, b) => {
    const da = a.due ?? '9999-99-99';
    const db = b.due ?? '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    if (a.heavy !== b.heavy) return a.heavy ? -1 : 1;
    if (a.minutes !== b.minutes) return b.minutes - a.minutes;
    return a.id < b.id ? -1 : 1;
  });
}

export function planDay(input: PlanInput): PlanResult {
  const { day, settings: s } = input;
  const win = workWindow(day, s, input.now);
  if (!win) return { blocks: [], unplaced: [] };
  let free = subtract(win, input.busy);
  const peaks: Interval[] = (input.peaks ?? [])
    .map((p) => ({ start: instant(day, p.from), end: instant(day, p.to) }))
    .filter((p) => p.end > p.start);

  const blocks: PlannedBlock[] = [];
  const queue = order(input.tasks.filter((t) => !t.mini && t.minutes > 0));
  const unplaced: PlanResult['unplaced'] = [];

  /** Belegt [start, start+minutes) in der freien Zeit. */
  const take = (start: number, minutes: number) => {
    const end = start + minutes * MIN_MS;
    free = free.flatMap((f) => {
      if (end <= f.start || start >= f.end) return [f];
      const parts: Interval[] = [];
      if (start > f.start) parts.push({ start: f.start, end: start });
      if (end < f.end) parts.push({ start: end, end: f.end });
      return parts;
    });
  };

  /** Frühester freier Platz für mindestens `min` Minuten, optional nur innerhalb von `only`. */
  const find = (min: number, only?: Interval[]): { start: number; minutes: number } | null => {
    for (const f of free) {
      const spans = only
        ? only.flatMap((o) => {
            const a = Math.max(f.start, o.start);
            const b = Math.min(f.end, o.end);
            return b > a ? [{ start: a, end: b }] : [];
          })
        : [f];
      for (const sp of spans) {
        const start = ceilTo(sp.start, GRID);
        const m = Math.floor((sp.end - start) / MIN_MS);
        if (m >= min) return { start, minutes: m };
      }
    }
    return null;
  };

  const place = (t: TaskLite, remaining: number, only: Interval[] | undefined, more: boolean) => {
    let left = remaining;
    while (left > 0) {
      const slot = find(Math.min(MIN_CHUNK, left), only);
      if (!slot) break;
      const chunk = Math.min(left, s.focusMinutes, slot.minutes);
      blocks.push({ kind: 'focus', start: slot.start, minutes: chunk, taskId: t.id });
      take(slot.start, chunk);
      left -= chunk;
      // Nach einem (fast) vollen Block eine Pause, wenn danach noch Arbeit kommt und Platz ist
      const afterStart = slot.start + chunk * MIN_MS;
      if ((left > 0 || more) && chunk >= s.focusMinutes - MIN_CHUNK && s.pauseMinutes > 0) {
        const room = free.find((f) => f.start <= afterStart && f.end >= afterStart);
        if (room && minutesOf({ start: afterStart, end: room.end }) >= s.pauseMinutes + MIN_CHUNK) {
          blocks.push({ kind: 'pause', start: afterStart, minutes: s.pauseMinutes, taskId: null });
          take(afterStart, s.pauseMinutes);
        }
      }
    }
    return left;
  };

  queue.forEach((t, i) => {
    const more = i < queue.length - 1;
    let left = t.minutes;
    if (t.heavy && peaks.length) left = place(t, left, peaks, more || left > 0);
    if (left > 0) left = place(t, left, undefined, more);
    if (left > 0) unplaced.push({ taskId: t.id, minutes: left });
  });

  blocks.sort((a, b) => a.start - b.start);
  // Eine Pause ohne Arbeit danach (z. B. weil die Aufgabe danach früher einsortiert wurde) entfällt
  const lastFocus = blocks.findLast((b) => b.kind === 'focus');
  const kept = blocks.filter(
    (b) => b.kind === 'focus' || (lastFocus !== undefined && b.start < lastFocus.start),
  );
  return { blocks: kept, unplaced };
}
