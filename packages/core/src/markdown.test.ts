import { describe, expect, it } from 'vitest';
import { fillLegal, LEGAL_DEFAULTS, parseInline, parseMarkdown, safeHref } from './markdown';

describe('Markdown für Rechtstexte', () => {
  it('Überschriften, Absätze mit Zeilenumbruch, Listen, fett, Links', () => {
    expect(
      parseMarkdown('# Titel\nZeile 1\nZeile 2\n\n- a\n- **b**\n\n[Mail](mailto:x@y.de)'),
    ).toEqual([
      { type: 'h', level: 1, text: [{ t: 'text', v: 'Titel' }] },
      { type: 'p', text: [{ t: 'text', v: 'Zeile 1\nZeile 2' }] },
      { type: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'bold', v: 'b' }]] },
      { type: 'p', text: [{ t: 'link', v: 'Mail', href: 'mailto:x@y.de' }] },
    ]);
  });

  it('nur http(s) und mailto werden Links, alles andere bleibt Klartext', () => {
    expect(parseInline('[klick](javascript:alert(1))')).toEqual([
      { t: 'text', v: '[klick](javascript:alert(1))' },
    ]);
    expect(parseInline('[x](JavaScript:alert)')[0]!.t).toBe('text');
    expect(parseInline('[x](data:text/html,hi)')[0]!.t).toBe('text');
    expect(parseInline('[x](//evil.test)')[0]!.t).toBe('text');
    expect(parseInline('[x](https://ok.test/a?b=1)')).toEqual([
      { t: 'link', v: 'x', href: 'https://ok.test/a?b=1' },
    ]);
    expect(safeHref('https://a.test" onclick="x')).toBeNull();
  });

  it('HTML im Text bleibt Text (nie Markup)', () => {
    const b = parseMarkdown('<script>alert(1)</script> <b>fett</b> <img src=x onerror=y>');
    expect(b).toEqual([
      {
        type: 'p',
        text: [{ t: 'text', v: '<script>alert(1)</script> <b>fett</b> <img src=x onerror=y>' }],
      },
    ]);
  });

  it('Betreiber-Stellen und Impressumsangaben', () => {
    expect(parseInline('Hoster: [[angeben]].')).toEqual([
      { t: 'text', v: 'Hoster: ' },
      { t: 'fill', v: 'angeben' },
      { t: 'text', v: '.' },
    ]);
    const md = fillLegal(LEGAL_DEFAULTS.impressum, {
      name: 'Erika Muster',
      address: 'Weg 1\n12345 Stadt',
      email: '',
    });
    expect(md).toContain('Erika Muster\nWeg 1\n12345 Stadt');
    expect(md).toContain('[[E-Mail-Adresse eintragen]]');
  });
});
