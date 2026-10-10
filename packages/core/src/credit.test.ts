import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  creditSummary,
  earnedFor,
  limitLeft,
  spend,
  spentOn,
  type CreditEntry,
} from './credit';

const at = (hhmmZ: string, day = '2026-10-10') => `${day}T${hhmmZ}:00.000Z`;
const e = (minutes: number, reason: CreditEntry['reason'], when = at('08:00')): CreditEntry => ({
  at: when,
  minutes,
  reason,
});

describe('Guthaben verdienen', () => {
  it('1 Std. Fokus = 15 Min., abgerundet', () => {
    expect(earnedFor(60, 15)).toBe(15);
    expect(earnedFor(50, 15)).toBe(12);
    expect(earnedFor(3, 15)).toBe(0);
    expect(earnedFor(60, 20)).toBe(20);
    expect(earnedFor(-5, 15)).toBe(0);
  });
});

describe('Guthaben ausgeben', () => {
  const entries = [e(12, 'focus'), e(12, 'focus'), e(-10, 'redirect', at('09:00'))];

  it('Stand, an dem Tag ausgegeben, Rest des Limits', () => {
    expect(balanceOf(entries)).toBe(14);
    expect(spentOn(entries, '2026-10-10')).toBe(10);
    expect(spentOn(entries, '2026-10-09')).toBe(0);
    expect(limitLeft(entries, '2026-10-10', 90)).toBe(80);
  });

  it('gibt aus, was da ist, und sagt warum weniger', () => {
    expect(spend(entries, 10, '2026-10-10', 90)).toEqual({
      granted: 10,
      short: 0,
      limitedBy: null,
    });
    expect(spend(entries, 20, '2026-10-10', 90)).toEqual({
      granted: 14,
      short: 6,
      limitedBy: 'balance',
    });
  });

  it('Tageslimit greift vor dem Guthaben', () => {
    const rich = [e(200, 'focus'), e(-30, 'social', at('10:00'))];
    expect(spend(rich, 40, '2026-10-10', 60)).toEqual({
      granted: 30,
      short: 10,
      limitedBy: 'limit',
    });
    expect(spend(rich, 40, '2026-10-11', 60)).toEqual({ granted: 40, short: 0, limitedBy: null });
  });

  it('kein negatives Guthaben ausgeben', () => {
    expect(spend([e(-5, 'social')], 10, '2026-10-10', 90).granted).toBe(0);
    expect(spend([], -3, '2026-10-10', 90).granted).toBe(0);
  });

  it('Korrekturen zählen nicht als ausgegeben', () => {
    const adj = [e(100, 'focus'), e(-20, 'adjust')];
    expect(spentOn(adj, '2026-10-10')).toBe(0);
    expect(balanceOf(adj)).toBe(80);
  });

  it('Tageswechsel in Berlin: 23:30 UTC gehört schon zum nächsten Tag', () => {
    const late = [e(50, 'focus'), e(-10, 'social', '2026-10-10T22:30:00.000Z')];
    expect(spentOn(late, '2026-10-11')).toBe(10);
    expect(spentOn(late, '2026-10-10')).toBe(0);
  });

  it('Zusammenfassung', () => {
    expect(creditSummary(entries, '2026-10-10', { dailyLimit: 90 })).toEqual({
      balance: 14,
      earnedToday: 24,
      spentToday: 10,
      limitLeft: 80,
    });
  });
});
