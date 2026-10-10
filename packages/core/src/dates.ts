// Kalenderdaten als Text: Tag "YYYY-MM-DD", Monat "YYYY-MM".
// Gerechnet wird in UTC-Tagen, damit Zeitzonen und Sommerzeit keine Rolle spielen.

export type Day = string;
export type Month = string;

const DAY_MS = 864e5;
const pad = (n: number) => String(n).padStart(2, '0');

const toUTC = (d: Day) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (t: number) => {
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

/** Monatsschlüssel wie in der alten App (mk). */
export const ym = (y: number, m: number): Month => `${y}-${pad(m)}`;

/** Wie `new Date(y, m-1, d)`: Überläufe rollen weiter (31.02. → 03.03.). */
export const dayOf = (y: number, m: number, d: number): Day => iso(Date.UTC(y, m - 1, d));

export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

export const addDays = (d: Day, n: number): Day => iso(toUTC(d) + n * DAY_MS);

/** Tage von a bis b (b − a). */
export const dayDiff = (a: Day, b: Day): number => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

export const yearOf = (d: Day): number => +d.slice(0, 4);
export const monthOf = (d: Day): number => +d.slice(5, 7);
export const dateOf = (d: Day): number => +d.slice(8, 10);

/** Wochentag 0 = Sonntag … 6 = Samstag. */
export const weekday = (d: Day): number => new Date(toUTC(d)).getUTCDay();

/** Nächster Monat als [Jahr, Monat]. */
/** Monat verschieben: addMonths('2026-10', -1) = '2026-09'. */
export const addMonths = (key: Month, n: number): Month => {
  const t = +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1) + n;
  return ym(Math.floor(t / 12), (t % 12) + 1);
};

export const nextMonth = (y: number, m: number): [number, number] =>
  m === 12 ? [y + 1, 1] : [y, m + 1];
export const prevMonth = (y: number, m: number): [number, number] =>
  m === 1 ? [y - 1, 12] : [y, m - 1];

/** Heutiges Datum in einer Zeitzone (Standard: Europe/Berlin), unabhängig von der Server-Zeitzone. */
export function todayIn(timeZone = 'Europe/Berlin', now = new Date()): Day {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA liefert YYYY-MM-DD
}
