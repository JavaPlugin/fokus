// Gemeinsame Typen und Standardwerte. Zeitpunkte sind ISO-Text (UTC) oder Millisekunden, Dauer
// immer in ganzen Minuten.
import type { Day } from './dates';

/** Art einer Aufgabe: Arbeit (blau), Pause (grün), Social (violett). */
export type TaskKind = 'work' | 'pause' | 'social';
/** Wann: automatisch geplant, feste Zeit oder später (noch ohne Zeit). */
export type Schedule = 'auto' | 'fixed' | 'later';

/** Wiederholung. `days` (0 = Sonntag … 6) nur bei „weekly“. */
export interface Recurrence {
  freq: 'daily' | 'weekdays' | 'weekly';
  days?: number[];
}

/** Arbeitszeit eines Tages, „HH:MM“ in Europe/Berlin. */
export interface Hours {
  from: string;
  to: string;
}

/** Einstellungen der Planung (pro Nutzer, Standardwerte aus dem Auftrag). */
export interface PlanSettings {
  /** Länge des Fokus-Timers, wenn eine Aufgabe nichts anderes sagt */
  focusMinutes: number;
  pauseMinutes: number;
  /** Guthaben in Minuten pro Stunde Fokus (1 Std. Fokus = 15 Min.) */
  creditPerHour: number;
  /** Höchstens so viele Minuten Guthaben dürfen pro Tag ausgegeben werden */
  dailyLimit: number;
  /** Arbeitszeiten je Wochentag, Index 0 = Sonntag … 6 = Samstag; null = frei */
  week: (Hours | null)[];
  /** Typische Scroll-Zeit pro Tag ohne FOKUS (Basis für „zurückgeholt“) */
  baselineScroll: number;
  /** Fokus-Minuten, ab denen ein Tag für die Serie zählt */
  streakGoal: number;
  /** Nicht mehr genutzt (früher Bonus fürs Umleiten, war ein Schlupfloch). Bleibt für alte Daten. */
  redirectBonus: number;
  /** „Umleiten“: so viele Minuten nimmt „vom Guthaben nehmen“ */
  redirectSpend: number;
}

export const WORK_DAY: Hours = { from: '09:00', to: '17:00' };

export const DEFAULT_SETTINGS: PlanSettings = {
  focusMinutes: 50,
  pauseMinutes: 10,
  creditPerHour: 15,
  dailyLimit: 90,
  // So frei, Mo–Fr 09:00–17:00, Sa frei
  week: [null, WORK_DAY, WORK_DAY, WORK_DAY, WORK_DAY, WORK_DAY, null],
  baselineScroll: 67,
  streakGoal: 60,
  redirectBonus: 3,
  redirectSpend: 10,
};

/** Was die Planung von einer Aufgabe wissen muss. */
export interface TaskLite {
  id: string;
  title: string;
  kind: TaskKind;
  minutes: number;
  schedule: Schedule;
  /** Feste Zeit (ms); bei Wiederholung zählt nur die Uhrzeit */
  fixedAt: number | null;
  /** Bis wann (nur Anzeige und Reihenfolge) */
  due: Day | null;
  recurrence: Recurrence | null;
  /** Tag, ab dem eine Wiederholung gilt */
  anchor: Day;
}

/** Zeitspanne in Millisekunden [start, end). */
export interface Interval {
  start: number;
  end: number;
}
