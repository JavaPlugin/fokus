// Woche: Fokus- und Social-Zeit pro Tag und das Zeit-Konto „vom Scrollen zurückgeholt“.
// Zurückgeholt = übliche Scroll-Zeit (Einstellung) für die vergangenen Tage der Woche minus die
// tatsächliche Social-Zeit. Künftige Tage zählen nicht.
import { addDays, weekStart, type Day } from './dates';

export interface DayTotals {
  day: Day;
  /** Fokus-Minuten */
  focus: number;
  /** Social-Minuten (aus Social-Slots und „vom Guthaben nehmen“) */
  social: number;
}

export interface WeekSummary {
  start: Day;
  end: Day;
  days: DayTotals[];
  focus: number;
  social: number;
  /** Was ohne FOKUS zu erwarten gewesen wäre (Basis × vergangene Tage) */
  expectedSocial: number;
  /** Vom Scrollen zurückgeholt (nie negativ) */
  regained: number;
  /** Tag mit der meisten Fokus-Zeit (null, wenn es keine gibt) */
  bestDay: Day | null;
}

/** Die sieben Tage (Mo–So) der Woche, in der `d` liegt. */
export const weekDays = (d: Day): Day[] => {
  const s = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
};

export function weekSummary(
  totals: Partial<Record<Day, { focus: number; social: number }>>,
  anyDayOfWeek: Day,
  today: Day,
  baselinePerDay: number,
): WeekSummary {
  const days = weekDays(anyDayOfWeek).map((day) => ({
    day,
    focus: totals[day]?.focus ?? 0,
    social: totals[day]?.social ?? 0,
  }));
  const elapsed = days.filter((d) => d.day <= today).length;
  const focus = days.reduce((s, d) => s + d.focus, 0);
  const social = days.reduce((s, d) => s + d.social, 0);
  const expectedSocial = baselinePerDay * elapsed;
  const best = days.reduce((a, b) => (b.focus > a.focus ? b : a), days[0]!);
  return {
    start: days[0]!.day,
    end: days[6]!.day,
    days,
    focus,
    social,
    expectedSocial,
    regained: Math.max(0, expectedSocial - social),
    bestDay: best.focus > 0 ? best.day : null,
  };
}

/** Was zurückgeholte Zeit „wert“ ist: ein Kapitel ≈ 2 Std., ein Training ≈ 2,5 Std. */
export function equivalents(minutes: number): { chapters: number; trainings: number } | null {
  const chapters = Math.floor(minutes / 120);
  const trainings = Math.floor(minutes / 150);
  return chapters || trainings ? { chapters, trainings } : null;
}
