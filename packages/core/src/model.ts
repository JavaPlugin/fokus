// Gemeinsame Typen und Standardwerte. Zeitpunkte sind ISO-Text (UTC) oder Millisekunden, Dauer
// immer in ganzen Minuten.
import type { Day } from './dates';

export type BlockKind = 'focus' | 'pause' | 'social' | 'event';
export type BlockStatus = 'planned' | 'running' | 'done' | 'skipped';

/** Einstellungen der Planung (pro Nutzer, Standardwerte aus dem Auftrag). */
export interface PlanSettings {
  /** Länge eines Fokus-Blocks */
  focusMinutes: number;
  pauseMinutes: number;
  /** Guthaben in Minuten pro Stunde Fokus (1 Std. Fokus = 15 Min.) */
  creditPerHour: number;
  /** Höchstens so viele Minuten Guthaben dürfen pro Tag ausgegeben werden */
  dailyLimit: number;
  /** Arbeitsfenster des Tages, „HH:MM“ in Europe/Berlin */
  workStart: string;
  workEnd: string;
  /** Typische Scroll-Zeit pro Tag ohne FOKUS (Basis für „zurückgeholt“) */
  baselineScroll: number;
  /** Fokus-Minuten, ab denen ein Tag für die Serie zählt */
  streakGoal: number;
  /** „Umleiten“: Guthaben für eine erledigte 2-Minuten-Aufgabe */
  redirectBonus: number;
  /** „Umleiten“: so viele Minuten nimmt „vom Guthaben nehmen“ */
  redirectSpend: number;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  focusMinutes: 50,
  pauseMinutes: 10,
  creditPerHour: 15,
  dailyLimit: 90,
  workStart: '09:00',
  workEnd: '18:00',
  baselineScroll: 67,
  streakGoal: 60,
  redirectBonus: 3,
  redirectSpend: 10,
};

/** Was die Planung von einer Aufgabe wissen muss. */
export interface TaskLite {
  id: string;
  title: string;
  /** Geschätzte Dauer in Minuten */
  minutes: number;
  /** Schwere Aufgabe: kommt in Hochphasen */
  heavy: boolean;
  /** Mini-Aufgabe (bis ca. 5 Min.): für Lücken und „Umleiten“, wird nicht fest eingeplant */
  mini: boolean;
  due: Day | null;
}

/** Zeitspanne in Millisekunden [start, end). */
export interface Interval {
  start: number;
  end: number;
}

/** Hochphase des Tages („HH:MM“). */
export interface Peak {
  from: string;
  to: string;
}
