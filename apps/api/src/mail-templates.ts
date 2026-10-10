// E-Mail-Vorlagen (Artboard „E-Mail Erinnerung“): heller Grund, weiße Karte, Wortmarke, große Zahl
// mit grauem Zusatz, Detailzeilen, amberfarbener Hinweis, schwarzer Pill-Button, kurzer Fußtext.
// Tabellenlayout für Outlook, System-Schrift, Dark-Mode über prefers-color-scheme, Text-Version immer.
import type { Mail } from './mail';
import { fill, TEMPLATES, textsFor, type TemplateKey, type Texts } from './mail-texts';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
/** „Sa, 17. Oktober“ */
export const mailDay = (d: string) => {
  const dt = new Date(`${d}T12:00:00Z`);
  return `${WD[dt.getUTCDay()]}, ${dt.getUTCDate()}. ${MON[dt.getUTCMonth()]}`;
};
export const inDaysText = (n: number) => (n === 0 ? 'Heute' : n === 1 ? 'Morgen' : `In ${n} Tagen`);

export interface MailRow {
  label: string;
  sub?: string;
  value: string;
  /** Rot, z. B. eine Warnung. */
  negative?: boolean;
  /** Grau gedruckter Name (z. B. ein Nebenwert). */
  muted?: boolean;
}
export interface MailSection {
  heading?: string;
  rows: MailRow[];
}

export interface MailContent {
  /** Kurzer Vorschautext im Postfach. */
  preheader: string;
  /** Zeile über dem Titel, z. B. „In 3 Tagen · Sa, 17. Oktober“. */
  when?: string;
  title: string;
  /** Große Zahl, dahinter grau ein Zusatz (z. B. „50“ + „Min.“). */
  hero?: { big: string; small?: string };
  rows?: [string, string][];
  /** Abschnitte (Sammel-Mail): optionale Zwischenüberschrift, Zeilen mit zweiter Zeile. */
  sections?: MailSection[];
  warning?: string;
  /** Fließtext unter dem Titel (z. B. beim Anmeldelink). */
  body?: string;
  button?: { label: string; url: string };
  footer: string;
  footerLink?: { label: string; url: string };
}

export function renderMail(c: MailContent): { html: string; text: string } {
  const font = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
  const hero =
    c.hero === undefined
      ? ''
      : `<tr><td style="padding:4px 0 20px 0;font-family:${font};font-size:40px;line-height:44px;font-weight:700;letter-spacing:-1px;color:#000000" class="ink">${esc(c.hero.big)}${c.hero.small ? `<span style="color:#8e8e93">&nbsp;${esc(c.hero.small)}</span>` : ''}</td></tr>`;
  const sections = (c.sections ?? [])
    .map((sec) => {
      const head = sec.heading
        ? `<tr><td colspan="2" style="padding:20px 0 6px 0;font-family:${font};font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6e6e73" class="muted">${esc(sec.heading)}</td></tr>`
        : '';
      const body = sec.rows
        .map((r) => {
          const nameColor = r.muted ? '#6e6e73' : '#000000';
          const nameClass = r.muted ? 'muted' : 'ink';
          const sub = r.sub
            ? `<br><span style="font-size:13px;color:#6e6e73" class="muted">${esc(r.sub)}</span>`
            : '';
          const valColor = r.negative ? '#d70015' : '#000000';
          const valWeight = r.negative ? '600' : '400';
          const valClass = r.negative ? 'line' : 'ink line';
          return `<tr><td style="border-top:1px solid #ececf0;padding:12px 0;font-family:${font};font-size:15px;color:${nameColor}" class="${nameClass} line">${esc(r.label)}${sub}</td><td align="right" valign="top" style="border-top:1px solid #ececf0;padding:12px 0;font-family:${font};font-size:15px;font-weight:${valWeight};color:${valColor};font-variant-numeric:tabular-nums;white-space:nowrap" class="${valClass}">${esc(r.value)}</td></tr>`;
        })
        .join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #ececf0" class="line">${head}${body}</table>`;
    })
    .join('');
  const rows = (c.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="border-top:1px solid #ececf0;padding:12px 0;font-family:${font};font-size:14px;color:#6e6e73" class="line">${esc(k)}</td><td align="right" style="border-top:1px solid #ececf0;padding:12px 0;font-family:${font};font-size:14px;color:#000000;font-variant-numeric:tabular-nums" class="ink line">${esc(v)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(c.title)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#000000 !important; }
  .card { background:#111113 !important; }
  .ink { color:#f5f5f7 !important; }
  .muted { color:#a1a1a6 !important; }
  .line { border-color:#2a2a2e !important; }
  .btn { background:#f5f5f7 !important; color:#000000 !important; }
  .warn { background:#2b2112 !important; color:#ffb340 !important; }
}
</style></head>
<body style="margin:0;padding:0;background:#f2f2f7" class="bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f7" class="bg"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:24px" class="card"><tr><td style="padding:28px 28px 32px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:20px;font-family:${font};font-size:15px;font-weight:700;color:#000000" class="ink">FOKUS</td></tr>
${c.when ? `<tr><td style="font-family:${font};font-size:13px;color:#6e6e73;padding-bottom:4px" class="muted">${esc(c.when)}</td></tr>` : ''}
<tr><td style="font-family:${font};font-size:22px;line-height:28px;font-weight:700;color:#000000;padding-bottom:8px" class="ink">${esc(c.title)}</td></tr>
${c.body ? `<tr><td style="font-family:${font};font-size:15px;line-height:22px;color:#3c3c43;padding-bottom:16px" class="muted">${esc(c.body)}</td></tr>` : ''}
${hero}
</table>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #ececf0" class="line">${rows}</table>` : ''}
${sections}
${c.warning ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px"><tr><td style="background:#fff4e5;border-radius:12px;padding:14px 16px;font-family:${font};font-size:14px;line-height:20px;color:#8a4b00" class="warn">● ${esc(c.warning)}</td></tr></table>` : ''}
${c.button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td style="background:#000000;border-radius:999px" class="btn"><a href="${esc(c.button.url)}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none" class="btn">${esc(c.button.label)}</a></td></tr></table>` : ''}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px"><tr><td align="center" style="padding:20px 24px;font-family:${font};font-size:12px;line-height:18px;color:#8e8e93" class="muted">${esc(c.footer)}${c.footerLink ? `<br><a href="${esc(c.footerLink.url)}" style="color:#8e8e93">${esc(c.footerLink.label)}</a>` : ''}</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    'FOKUS',
    '',
    c.when,
    c.title,
    c.body,
    c.hero === undefined ? undefined : `${c.hero.big}${c.hero.small ? ` ${c.hero.small}` : ''}`,
    ...(c.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(c.sections ?? []).flatMap((sec) => [
      ...(sec.heading ? ['', sec.heading.toUpperCase()] : []),
      ...sec.rows.map((r) => `${r.label}${r.sub ? ` (${r.sub})` : ''}: ${r.value}`),
    ]),
    c.warning ? `Hinweis: ${c.warning}` : undefined,
    c.button ? `${c.button.label}: ${c.button.url}` : undefined,
    '',
    '--',
    c.footer,
    c.footerLink ? `${c.footerLink.label}: ${c.footerLink.url}` : undefined,
  ]
    .filter((x) => x !== undefined)
    .join('\n');
  return { html, text };
}

const settingsLink = (base: string) => ({
  label: 'Benachrichtigungen ändern',
  url: `${base}/einstellungen`,
});

export function mail(to: string, subject: string, c: MailContent): Mail {
  return { to, subject, ...renderMail(c) };
}

// ---------- Vorlagen ----------
// Bearbeitbare Texte (Betreff, Überschrift, Hinweis, Button, Fußzeile) kommen aus mail-texts.ts;
// `draft` = ungesicherte Texte aus dem Admin-Panel (Vorschau, Testmail).

type Draft = Partial<Texts>;

/** Texte einer Vorlage mit eingesetzten Platzhaltern. */
function texts(key: TemplateKey, vars: Record<string, string>, draft?: Draft): Texts {
  const t = textsFor(key, draft);
  const out = {} as Texts;
  for (const k of Object.keys(t) as (keyof Texts)[]) out[k] = fill(t[k], vars);
  // Pflichtfelder nie leer
  const d = TEMPLATES[key].defaults;
  for (const k of ['betreff', 'ueberschrift', 'button'] as const)
    if (!out[k]) out[k] = fill(d[k], vars);
  return out;
}

/** Erinnerung vor einem Fokus-Block oder Social-Slot. */
export interface ReminderInfo {
  title: string;
  /** „fokus“ oder „social“ */
  kind: 'focus' | 'social';
  /** Uhrzeit „09:30“ */
  time: string;
  minutes: number;
  inMinutes: number;
}

export const reminderMail = (to: string, base: string, x: ReminderInfo, draft?: Draft): Mail => {
  const t = texts(
    'erinnerung',
    {
      name: x.title,
      zeit: x.time,
      dauer: String(x.minutes),
      in: x.inMinutes <= 0 ? 'jetzt' : `in ${x.inMinutes} Min.`,
    },
    draft,
  );
  return mail(to, t.betreff, {
    preheader: `${x.title} um ${x.time} Uhr.`,
    when: `${x.kind === 'focus' ? 'Fokus' : 'Social'} · ${x.time} Uhr`,
    title: t.ueberschrift,
    hero: { big: String(x.minutes), small: 'Min.' },
    rows: [['Beginn', `${x.time} Uhr`]],
    body: t.hinweis || undefined,
    button: { label: t.button, url: `${base}/` },
    footer: t.fusszeile,
    footerLink: settingsLink(base),
  });
};

/** Tagesrückblick am Abend. */
export interface RecapInfo {
  day: string;
  focusMinutes: number;
  socialMinutes: number;
  /** Zurückgeholte Zeit in Minuten */
  regained: number;
}

export const recapMail = (to: string, base: string, x: RecapInfo, draft?: Draft): Mail => {
  const t = texts(
    'rueckblick',
    { fokus: String(x.focusMinutes), social: String(x.socialMinutes), zurueck: String(x.regained) },
    draft,
  );
  return mail(to, t.betreff, {
    preheader: `${x.focusMinutes} Min. Fokus heute.`,
    when: mailDay(x.day),
    title: t.ueberschrift,
    hero: { big: String(x.focusMinutes), small: 'Min. Fokus' },
    rows: [
      ['Social', `${x.socialMinutes} Min.`],
      ['Zurückgeholt', `${x.regained} Min.`],
    ],
    body: t.hinweis || undefined,
    button: { label: t.button, url: `${base}/woche` },
    footer: t.fusszeile,
    footerLink: settingsLink(base),
  });
};

export const magicLinkMail = (to: string, url: string, draft?: Draft): Mail => {
  const t = texts('anmeldung', {}, draft);
  return mail(to, t.betreff, {
    preheader: t.hinweis || t.ueberschrift,
    title: t.ueberschrift,
    body: t.hinweis || undefined,
    button: { label: t.button, url },
    footer: t.fusszeile,
  });
};

/** Einladung zu einem gemeinsamen Fokus-Block (Fokus-Partner). */
export const partnerInviteMail = (
  to: string,
  x: { from: string; block: string; url: string },
  draft?: Draft,
): Mail => {
  const t = texts('einladung', { von: x.from, block: x.block }, draft);
  return mail(to, t.betreff, {
    preheader: `Gemeinsam fokussieren: ${x.block}.`,
    title: t.ueberschrift,
    body: t.hinweis || undefined,
    button: { label: t.button, url: x.url },
    footer: t.fusszeile,
  });
};

export const updateMail = (
  to: string,
  base: string,
  x: { version: string; current: string },
  draft?: Draft,
): Mail => {
  const t = texts('update', { version: x.version, installiert: x.current }, draft);
  return mail(to, t.betreff, {
    preheader: `Update von ${x.current} auf ${x.version} verfügbar.`,
    title: t.ueberschrift,
    body: t.hinweis || undefined,
    button: { label: t.button, url: `${base}/admin` },
    footer: t.fusszeile,
  });
};

export const testMail = (to: string, base: string): Mail =>
  mail(to, 'Test von FOKUS', {
    preheader: 'So sehen Erinnerungen von FOKUS aus.',
    when: 'Test',
    title: 'Benachrichtigungen funktionieren',
    body: 'Diese E-Mail hast du in den Einstellungen angefordert.',
    button: { label: 'In FOKUS öffnen', url: `${base}/` },
    footer: 'Du bekommst diese E-Mail, weil du „Test senden“ getippt hast.',
    footerLink: settingsLink(base),
  });

/** Beispiel einer bearbeitbaren Vorlage (Vorschau und Testmail im Admin-Panel). */
export function sampleMail(key: TemplateKey, to: string, base: string, draft?: Draft): Mail {
  switch (key) {
    case 'erinnerung':
      return reminderMail(
        to,
        base,
        { title: 'Steuererklärung', kind: 'focus', time: '09:30', minutes: 50, inMinutes: 5 },
        draft,
      );
    case 'rueckblick':
      return recapMail(
        to,
        base,
        { day: '2026-10-17', focusMinutes: 190, socialMinutes: 30, regained: 95 },
        draft,
      );
    case 'anmeldung':
      return magicLinkMail(to, `${base}/api/auth/magic-link/verify?token=beispiel`, draft);
    case 'einladung':
      return partnerInviteMail(
        to,
        { from: 'Niko', block: 'Steuererklärung', url: `${base}/partner?token=beispiel` },
        draft,
      );
    case 'update':
      return updateMail(to, base, { version: 'v0.14.0', current: 'v0.13.0' }, draft);
  }
}

/** Dunkle Vorschau erzwingen: die prefers-color-scheme-Regeln immer anwenden. */
export const forceDark = (html: string) =>
  html.replace('@media (prefers-color-scheme: dark) {', '@media all {');
