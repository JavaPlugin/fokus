import { describe, expect, it } from 'vitest';
import { catColor, catColorKey, contrast, darken, goalPaletteKey, goalPalettes } from './theme';

describe('Farben', () => {
  it('Standard nach Name, sonst reihum; gewählte Farbe gewinnt', () => {
    expect(catColor('a', 'Essen', 5)).toBe('#FF9F43');
    expect(catColor('b', 'Tanken', 0)).toBe('#5AC8FA');
    expect(catColorKey('c', 'Andere Sachen', 0)).toBe('violet');
    expect(catColorKey('d', 'Sonstiges', 0)).toBe('gray');
    expect(catColorKey('e', 'Drogerie', 1)).toBe('blue');
    expect(catColorKey('a', 'Essen', 0, { a: 'pink' })).toBe('pink');
    expect(catColorKey('a', 'Essen', 0, { a: 'unbekannt' })).toBe('orange');
    expect(catColorKey(null, 'Ohne Kategorie', 0)).toBe('gray');
  });

  it('Sparziel-Paletten: Text auf beiden Verlaufsfarben mindestens 4,5 : 1', () => {
    for (const [k, p] of Object.entries(goalPalettes)) {
      expect(contrast(p.text, p.from), k).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.text, p.to), k).toBeGreaterThanOrEqual(4.5);
    }
    expect(goalPaletteKey('x', 1)).toBe('violet');
    expect(goalPaletteKey('x', 0, { x: 'teal' })).toBe('teal');
  });

  it('Hilfen', () => {
    expect(darken('#FFFFFF', 0.2)).toBe('#cccccc');
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('Zeichen auf Kategorie-Kacheln', () => {
  it('immer mindestens 4,5 : 1 (über den dunkleren Verlaufsteil auch)', async () => {
    const { catColors, onColor } = await import('./theme');
    for (const [k, c] of Object.entries(catColors)) {
      expect(contrast(onColor(c), c), k).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Bedeutung der Farben', () => {
  it('Fokus blau, Pause grün, Social violett, Warnung orange', async () => {
    const { kindColors } = await import('./theme');
    expect(kindColors).toEqual({
      focus: '#5AC8FA',
      pause: '#30D158',
      social: '#BF5AF2',
      warning: '#FF9F43',
    });
  });
});
