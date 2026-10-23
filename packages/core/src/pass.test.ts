import { describe, expect, it } from 'vitest';
import type { CreditEntry } from './credit';
import { DEFAULT_SETTINGS } from './model';
import { activePass, gateState, passesOf, splitSettingsChange } from './pass';

const T0 = Date.parse('2026-10-23T08:00:00.000Z');
const min = (m: number) => T0 + m * 60_000;
const e = (atMin: number, minutes: number, reason: CreditEntry['reason']): CreditEntry => ({
  at: new Date(min(atMin)).toISOString(),
  minutes,
  reason,
});

describe('Freigaben aus dem Guthaben', () => {
  it('jede Ausgabe gibt genau so viele Minuten frei', () => {
    const entries = [e(-60, 30, 'focus'), e(0, -10, 'redirect')];
    expect(passesOf(entries)).toEqual([{ start: min(0), end: min(10) }]);
    expect(activePass(entries, min(5))).toEqual({ start: min(0), end: min(10) });
    expect(activePass(entries, min(10))).toBeNull();
    expect(activePass(entries, min(-1))).toBeNull();
  });

  it('Ausgabe während einer Freigabe verlängert sie, statt sie zu überlappen', () => {
    const entries = [e(0, -10, 'social'), e(4, -10, 'redirect'), e(30, -5, 'override')];
    expect(passesOf(entries)).toEqual([
      { start: min(0), end: min(20) },
      { start: min(30), end: min(35) },
    ]);
  });

  it('Verdienen und Korrekturen geben nichts frei', () => {
    const entries = [e(0, 30, 'focus'), e(0, -30, 'adjust')];
    expect(passesOf(entries)).toEqual([]);
  });

  it('Reihenfolge im Buch egal', () => {
    const entries = [e(4, -10, 'redirect'), e(0, -10, 'social')];
    expect(passesOf(entries)).toEqual([{ start: min(0), end: min(20) }]);
  });
});

describe('Darf die App auf?', () => {
  const paid = [e(0, -10, 'social')];
  it('nur mit laufender Freigabe', () => {
    expect(gateState(paid, min(3), false)).toBe('free');
    expect(gateState(paid, min(11), false)).toBe('blocked');
    expect(gateState([], min(3), false)).toBe('blocked');
  });
  it('während eines Fokus-Blocks nie', () => {
    expect(gateState(paid, min(3), true)).toBe('focus');
  });
});

describe('Lockerungen erst ab morgen', () => {
  const s = DEFAULT_SETTINGS;
  it('mehr Guthaben, höheres Limit, weniger Kosten = später', () => {
    expect(
      splitSettingsChange(s, {
        creditPerHour: 30,
        dailyLimit: 120,
        redirectSpend: 5,
      }),
    ).toEqual({
      now: {},
      later: { creditPerHour: 30, dailyLimit: 120, redirectSpend: 5 },
    });
  });
  it('strenger und neutral (auch Statistik) = sofort', () => {
    expect(
      splitSettingsChange(s, {
        creditPerHour: 10,
        dailyLimit: 30,
        focusMinutes: 25,
        week: [],
        streakGoal: 10,
        baselineScroll: 200,
      }),
    ).toEqual({
      now: {
        creditPerHour: 10,
        dailyLimit: 30,
        focusMinutes: 25,
        week: [],
        streakGoal: 10,
        baselineScroll: 200,
      },
      later: {},
    });
  });
  it('gleicher Wert = sofort (nichts zu verschieben)', () => {
    expect(splitSettingsChange(s, { creditPerHour: s.creditPerHour })).toEqual({
      now: { creditPerHour: s.creditPerHour },
      later: {},
    });
  });
});
