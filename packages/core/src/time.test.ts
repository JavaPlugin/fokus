import { describe, expect, it } from 'vitest';
import { clock, dayInZone, instant, isoOf, minutesBetween, weekStart } from './dates';

describe('Uhrzeiten in Berlin', () => {
  it('Sommer- und Winterzeit', () => {
    expect(isoOf(instant('2026-07-10', '09:00'))).toBe('2026-07-10T07:00:00.000Z');
    expect(isoOf(instant('2026-12-10', '09:00'))).toBe('2026-12-10T08:00:00.000Z');
  });

  it('Umstellung: 25.10.2026 (Ende der Sommerzeit) und 29.03.2026', () => {
    expect(isoOf(instant('2026-10-25', '09:00'))).toBe('2026-10-25T08:00:00.000Z');
    expect(isoOf(instant('2026-10-24', '09:00'))).toBe('2026-10-24T07:00:00.000Z');
    expect(isoOf(instant('2026-03-29', '09:00'))).toBe('2026-03-29T07:00:00.000Z');
    // Dauer eines Umstellungstags
    expect(minutesBetween(instant('2026-10-25', '00:00'), instant('2026-10-26', '00:00'))).toBe(
      25 * 60,
    );
  });

  it('Tag und Uhrzeit zurück', () => {
    const t = instant('2026-10-10', '23:30');
    expect(dayInZone(t)).toBe('2026-10-10');
    expect(clock(t)).toBe('23:30');
    expect(dayInZone('2026-10-10T22:30:00Z')).toBe('2026-10-11');
  });

  it('Montag der Woche', () => {
    expect(weekStart('2026-10-10')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
  });
});
