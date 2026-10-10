import { dateOf, monthOf, weekday, type Day } from '@fokus/core';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = [
  'Jan',
  'Feb',
  'März',
  'Apr',
  'Mai',
  'Juni',
  'Juli',
  'Aug',
  'Sept',
  'Okt',
  'Nov',
  'Dez',
];

/** "17.10." */
export const dm = (d: Day) => `${dateOf(d)}.${monthOf(d)}.`;
/** "Sa, 17. Okt" */
export const dayLabel = (d: Day) => `${WD[weekday(d)]}, ${dateOf(d)}. ${MON[monthOf(d) - 1]}`;
export const wd = (d: Day) => WD[weekday(d)]!;

export const relDay = (n: number) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

/** Lokales Datum des Geräts. */
export const localToday = (): Day => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "vor 5 Min.", "vor 2 Std.", "gestern" … */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'noch nie';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/** "Heute, 03:00" / "4. Okt, 03:00" */
export function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Heute, ${time}`;
  return `${d.getDate()}. ${MON[d.getMonth()]}, ${time}`;
}

export function bytes(n: number): string {
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3)
    return `${(n / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
}

/** Changelog aus dem Release-Text: Aufzählungspunkte ohne „feat:“ & Co. */
export function changelog(notes: string): string[] {
  return notes
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/^\w+(\(.+?\))?!?:\s*/, ''))
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
    .slice(0, 6);
}

const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON_LONG = [
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
/** "Donnerstag, 1. Oktober" */
export const longDay = (d: Day) =>
  `${WD_LONG[weekday(d)]}, ${dateOf(d)}. ${MON_LONG[monthOf(d) - 1]}`;
/** "2026-10" → "Oktober 2026" */
export const monthName = (key: string) => `${MON_LONG[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;

/** „17. September“ */
export const monthDay = (d: Day) => `${dateOf(d)}. ${MON_LONG[monthOf(d) - 1]}`;

/** „Niko Sebald“ → „NS“ */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Minuten als „1 Std. 15 Min.“ bzw. „45 Min.“ */
export const minutesText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} Std. ${m} Min.` : `${h} Std.`) : `${m} Min.`;
};
