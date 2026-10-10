// Wiederholung: aus einer Regel entstehen Vorkommen pro Tag. Erledigt wird nur das Vorkommen.
import { weekday, type Day } from './dates';
import type { Recurrence } from './model';

const DAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Fällt `day` auf ein Vorkommen? Ohne Regel nur der Ankertag selbst. */
export function occursOn(rule: Recurrence | null, anchor: Day, day: Day): boolean {
  if (!rule) return day === anchor;
  if (day < anchor) return false;
  const wd = weekday(day);
  if (rule.freq === 'daily') return true;
  if (rule.freq === 'weekdays') return wd >= 1 && wd <= 5;
  const days = rule.days?.length ? rule.days : [weekday(anchor)];
  return days.includes(wd);
}

/** „täglich“, „werktags“, „jeden Mo“, „jeden Mo, Mi“ (Reihenfolge Mo … So). */
export function recurrenceLabel(rule: Recurrence | null, anchor?: Day): string {
  if (!rule) return '';
  if (rule.freq === 'daily') return 'täglich';
  if (rule.freq === 'weekdays') return 'werktags';
  const days = rule.days?.length ? rule.days : anchor ? [weekday(anchor)] : [];
  const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return `jeden ${sorted.map((d) => DAY[d]).join(', ')}`;
}

/** Eingabe prüfen und säubern (null = keine Wiederholung). */
export function cleanRecurrence(r: unknown): Recurrence | null {
  if (!r || typeof r !== 'object') return null;
  const { freq, days } = r as { freq?: string; days?: unknown };
  if (freq === 'daily' || freq === 'weekdays') return { freq };
  if (freq === 'weekly') {
    const ds = Array.isArray(days)
      ? [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
      : [];
    return ds.length ? { freq, days: ds } : { freq };
  }
  return null;
}
