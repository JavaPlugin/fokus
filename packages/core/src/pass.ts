// Freigabe für Social Media: Wer Guthaben ausgibt (Social-Slot, „vom Guthaben nehmen“ oder eine
// Ausnahme), bekommt genau so viele Minuten frei. Die Freigaben ergeben sich allein aus dem Buch
// des Guthabens: jede Ausgabe beginnt jetzt oder, wenn noch eine Freigabe läuft, an deren Ende.
import { MIN_MS } from './dates';
import type { CreditEntry, CreditReason } from './credit';
import type { PlanSettings } from './model';

/** Ausgaben mit diesen Gründen geben Social Media frei. */
export const PASS_REASONS: readonly CreditReason[] = ['social', 'redirect', 'override'];

/** Ausnahme („Trotzdem öffnen“): kostet so viele Minuten, auch ins Minus. */
export const OVERRIDE_MINUTES = 5;
/** Höchstens so viele Ausnahmen pro Tag. */
export const OVERRIDES_PER_DAY = 3;
/** Vor einer Ausnahme so viele Sekunden warten. */
export const OVERRIDE_WAIT_S = 15;

export interface Pass {
  /** Millisekunden */
  start: number;
  end: number;
}

/** Alle Freigaben, zusammengelegt wenn sie aneinander anschließen. */
export function passesOf(entries: CreditEntry[]): Pass[] {
  const spends = entries
    .filter((e) => e.minutes < 0 && PASS_REASONS.includes(e.reason))
    .map((e) => ({ at: new Date(e.at).getTime(), minutes: -e.minutes }))
    .sort((a, b) => a.at - b.at);
  const out: Pass[] = [];
  for (const s of spends) {
    const last = out.at(-1);
    if (last && last.end >= s.at) last.end += s.minutes * MIN_MS;
    else out.push({ start: s.at, end: s.at + s.minutes * MIN_MS });
  }
  return out;
}

/** Die Freigabe, die gerade läuft, sonst null. */
export function activePass(entries: CreditEntry[], now: number): Pass | null {
  return passesOf(entries).find((p) => p.start <= now && now < p.end) ?? null;
}

export type GateState = 'free' | 'focus' | 'blocked';

/**
 * Darf die Social-App jetzt auf? Während eines Fokus-Blocks nie, sonst nur mit laufender Freigabe.
 * Ein geplanter Social-Slot allein gibt nichts frei: erst sein Start (Guthaben) tut es.
 */
export function gateState(entries: CreditEntry[], now: number, focusRunning: boolean): GateState {
  if (focusRunning) return 'focus';
  return activePass(entries, now) ? 'free' : 'blocked';
}

// ---------- Einstellungen: Lockerungen erst ab morgen ----------

/** Werte, deren Änderung in diese Richtung mehr Social-Zeit bringt (nur Statistik zählt nicht). */
const LOOSER: Partial<Record<keyof PlanSettings, 'up' | 'down'>> = {
  creditPerHour: 'up',
  dailyLimit: 'up',
  redirectSpend: 'down',
};

/**
 * Teilt eine Änderung der Einstellungen: Strengeres gilt sofort, Lockeres erst ab morgen.
 * So lässt sich das eigene Guthaben nicht im Moment der Versuchung hochdrehen.
 */
export function splitSettingsChange(
  current: PlanSettings,
  change: Partial<PlanSettings>,
): { now: Partial<PlanSettings>; later: Partial<PlanSettings> } {
  const now: Record<string, unknown> = {};
  const later: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(change) as [keyof PlanSettings, unknown][]) {
    const dir = LOOSER[k];
    const cur = current[k];
    const loosens =
      dir !== undefined &&
      typeof v === 'number' &&
      typeof cur === 'number' &&
      (dir === 'up' ? v > cur : v < cur);
    (loosens ? later : now)[k] = v;
  }
  return { now: now as Partial<PlanSettings>, later: later as Partial<PlanSettings> };
}
