import { describe, expect, it } from 'vitest';
import { formatEUR, splitEUR, toCents } from './money';

describe('money', () => {
  it('formatiert deutsch', () => {
    expect(formatEUR(123456)).toBe('1.234,56 €');
    expect(formatEUR(-1000)).toBe('-10,00 €');
  });
  it('rechnet Euro-Floats ohne Rundungsfehler in Cent', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(21.42)).toBe(2142);
    expect(toCents(44.9)).toBe(4490);
  });
  it('zerlegt für die Hero-Zahl', () => {
    expect(splitEUR(48202)).toEqual({ sign: '', euros: '482', cents: '02' });
    expect(splitEUR(-1492)).toEqual({ sign: '−', euros: '14', cents: '92' });
    expect(splitEUR(123456789)).toEqual({ sign: '', euros: '1.234.567', cents: '89' });
  });
});
