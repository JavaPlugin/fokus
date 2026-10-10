import { describe, expect, it } from 'vitest';
import { streak } from './streak';
import { weekDays, weekSummary } from './week';

describe('Serie', () => {
  const goal = 60;
  const f = (xs: Record<string, number>) => xs;

  it('zählt zusammenhängende Tage bis gestern', () => {
    const d = f({ '2026-10-09': 70, '2026-10-08': 90, '2026-10-07': 60, '2026-10-05': 100 });
    expect(streak(d, '2026-10-10', goal)).toBe(3);
  });

  it('heute zählt mit, sobald das Ziel erreicht ist', () => {
    const d = f({ '2026-10-10': 60, '2026-10-09': 70 });
    expect(streak(d, '2026-10-10', goal)).toBe(2);
    expect(streak(f({ '2026-10-10': 30, '2026-10-09': 70 }), '2026-10-10', goal)).toBe(1);
  });

  it('eine Lücke beendet die Serie, ohne Ziel keine', () => {
    expect(streak(f({ '2026-10-09': 20 }), '2026-10-10', goal)).toBe(0);
    expect(streak({}, '2026-10-10', goal)).toBe(0);
    expect(streak(f({ '2026-10-09': 100 }), '2026-10-10', 0)).toBe(0);
  });
});

describe('Woche', () => {
  it('Montag bis Sonntag', () => {
    expect(weekDays('2026-10-10')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('Zeit-Konto: Basis nur für vergangene Tage, nie negativ', () => {
    const totals = {
      '2026-10-05': { focus: 120, social: 20 },
      '2026-10-06': { focus: 200, social: 10 },
      '2026-10-10': { focus: 140, social: 30 },
    };
    const w = weekSummary(totals, '2026-10-08', '2026-10-10', 70);
    expect(w.start).toBe('2026-10-05');
    expect(w.end).toBe('2026-10-11');
    expect(w.focus).toBe(460);
    expect(w.social).toBe(60);
    expect(w.expectedSocial).toBe(420);
    expect(w.regained).toBe(360);
    expect(w.bestDay).toBe('2026-10-06');
    expect(w.days).toHaveLength(7);
    expect(w.days[2]).toEqual({ day: '2026-10-07', focus: 0, social: 0 });
    // mehr gescrollt als üblich: 0 statt negativ
    const more = weekSummary(
      { '2026-10-05': { focus: 0, social: 500 } },
      '2026-10-05',
      '2026-10-05',
      70,
    );
    expect(more.regained).toBe(0);
    expect(more.bestDay).toBeNull();
  });
});
