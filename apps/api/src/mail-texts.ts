// Bearbeitbare Texte der E-Mail-Vorlagen (Admin-Panel → E-Mail-Vorlagen). Nur Texte, nie Layout.
// Standardtexte stehen hier; gespeicherte Änderungen (Tabelle email_template) überschreiben sie.
// Platzhalter {{name}} usw. werden beim Versand ersetzt; alles wird später HTML-escaped.

export type FieldKey = 'betreff' | 'ueberschrift' | 'hinweis' | 'button' | 'fusszeile';
export type TemplateKey = 'erinnerung' | 'rueckblick' | 'anmeldung' | 'einladung' | 'update';
export type Texts = Record<FieldKey, string>;

export const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'betreff', label: 'Betreff' },
  { key: 'ueberschrift', label: 'Überschrift' },
  { key: 'hinweis', label: 'Hinweis' },
  { key: 'button', label: 'Button' },
  { key: 'fusszeile', label: 'Fußzeile' },
];

export interface TemplateDef {
  label: string;
  /** Erlaubte Platzhalter (ohne Klammern). */
  placeholders: string[];
  defaults: Texts;
}

const REMINDER_FOOTER = 'Du bekommst diese E-Mail, weil Erinnerungen per E-Mail an sind.';

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  erinnerung: {
    label: 'Erinnerung',
    placeholders: ['name', 'zeit', 'dauer', 'in'],
    defaults: {
      betreff: '{{name}} {{in}} · {{zeit}} Uhr',
      ueberschrift: '{{name}} beginnt {{in}}',
      hinweis: 'Zeit für einen Fokus-Block. Danach hast du dir Scroll-Zeit verdient.',
      button: 'In FOKUS öffnen',
      fusszeile: REMINDER_FOOTER,
    },
  },
  rueckblick: {
    label: 'Tagesrückblick',
    placeholders: ['fokus', 'social', 'zurueck'],
    defaults: {
      betreff: 'Heute: {{fokus}} Min. Fokus',
      ueberschrift: 'Dein Tag in Zahlen',
      hinweis: '{{zurueck}} Minuten hast du dir heute vom Scrollen zurückgeholt.',
      button: 'Woche ansehen',
      fusszeile: REMINDER_FOOTER,
    },
  },
  anmeldung: {
    label: 'Anmeldung',
    placeholders: [],
    defaults: {
      betreff: 'Dein Anmeldelink für FOKUS',
      ueberschrift: 'Anmelden bei FOKUS',
      hinweis: 'Tippe auf den Button, um dich anzumelden. Der Link gilt 15 Minuten.',
      button: 'Jetzt anmelden',
      fusszeile: 'Wenn du das nicht warst, ignoriere diese E-Mail. Ohne Klick passiert nichts.',
    },
  },
  einladung: {
    label: 'Fokus-Partner',
    placeholders: ['von', 'block'],
    defaults: {
      betreff: '{{von}} lädt dich zum Fokus-Block „{{block}}“ ein',
      ueberschrift: 'Gemeinsam fokussieren: „{{block}}“',
      hinweis:
        '{{von}} möchte einen Fokus-Block mit dir starten. Ihr seht euch live, sonst nichts: keine Aufgaben, keinen Plan.',
      button: 'Einladung ansehen',
      fusszeile: 'Wenn du niemanden mit diesem Namen kennst, ignoriere diese E-Mail.',
    },
  },
  update: {
    label: 'Update',
    placeholders: ['version', 'installiert'],
    defaults: {
      betreff: 'FOKUS {{version}} ist da',
      ueberschrift: 'Update {{version}} verfügbar',
      hinweis:
        'Installiert ist {{installiert}}. Das Update spielst du im Admin-Panel mit einem Klick ein; vorher wird automatisch gesichert.',
      button: 'Zum Admin-Panel',
      fusszeile: 'Du bekommst diese E-Mail, weil du Admin dieser FOKUS-Instanz bist.',
    },
  },
};

export const isTemplateKey = (k: string): k is TemplateKey => k in TEMPLATES;

// Gespeicherte Änderungen (im Prozess, geladen beim Start und nach jedem Sichern)
let overrides: Partial<Record<TemplateKey, Partial<Texts>>> = {};
export const setOverrides = (o: Partial<Record<TemplateKey, Partial<Texts>>>) => (overrides = o);
export function setOverride(key: TemplateKey, fields: Partial<Texts> | null) {
  if (fields) overrides[key] = fields;
  else delete overrides[key];
}

/** Texte einer Vorlage: Standard, darüber gespeichert, darüber (Vorschau/Test) ungespeichert. */
export function textsFor(key: TemplateKey, draft?: Partial<Texts>): Texts {
  return { ...TEMPLATES[key].defaults, ...overrides[key], ...draft };
}

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g;

/** Platzhalter ersetzen. Fehlende Werte werden leer, doppelte Leerzeichen zusammengezogen. */
export function fill(text: string, vars: Record<string, string>): string {
  return text
    .replace(PLACEHOLDER, (_, name: string) => vars[name] ?? '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Unbekannte Platzhalter je Feld (leer = alles gut). */
export function unknownPlaceholders(key: TemplateKey, fields: Partial<Texts>) {
  const allowed = new Set(TEMPLATES[key].placeholders);
  const out: Partial<Record<FieldKey, string[]>> = {};
  for (const f of FIELDS) {
    const bad = [...(fields[f.key] ?? '').matchAll(PLACEHOLDER)]
      .map((m) => m[1]!)
      .filter((n) => !allowed.has(n));
    if (bad.length) out[f.key] = [...new Set(bad)];
  }
  return out;
}
