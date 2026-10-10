// Kalender-Abo (ICS): liest Termine aus einer iCalendar-Datei und löst einfache Wiederholungen
// (RRULE: täglich, wöchentlich mit Wochentagen, monatlich, jährlich; INTERVAL, COUNT, UNTIL, EXDATE)
// für einen Zeitraum auf. Ganztägige Termine bleiben draußen (sie blockieren keine Arbeitszeit).
import {
  addDays,
  dateOf,
  dayInZone,
  daysInMonth,
  instant,
  monthOf,
  weekday,
  yearOf,
  MIN_MS,
  type Day,
} from './dates';

export interface IcsEvent {
  /** Stabile Kennung: UID + Beginn */
  id: string;
  title: string;
  /** Beginn in Millisekunden */
  start: number;
  minutes: number;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Zeilen entfalten (Fortsetzungszeilen beginnen mit Leerzeichen/Tab) und in Eigenschaften zerlegen. */
function props(text: string): Prop[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length)
      lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  return lines.flatMap((l) => {
    const i = l.indexOf(':');
    if (i < 1) return [];
    const [name, ...ps] = l.slice(0, i).split(';');
    const params: Record<string, string> = {};
    for (const p of ps) {
      const [k, v] = p.split('=');
      if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
    }
    return [{ name: name!.toUpperCase(), params, value: l.slice(i + 1) }];
  });
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

interface When {
  /** Zeitpunkt in ms, null bei ganztägig */
  at: number | null;
  /** Kalendertag (lokal) und Uhrzeit für Wiederholungen */
  day: Day;
  hhmm: string;
  tz: string;
}

/** DTSTART/DTEND/EXDATE-Wert lesen: „20261012T090000Z“, „…T090000“ mit TZID, „20261012“ (ganztägig). */
function when(p: Prop): When | null {
  const v = p.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] === undefined) return { at: null, day, hhmm: '00:00', tz: 'Europe/Berlin' };
  const hhmm = `${m[4]}:${m[5]}`;
  if (m[7]) {
    const at = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
    return {
      at,
      day: dayInZone(at),
      hhmm: new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(at),
      tz: 'Europe/Berlin',
    };
  }
  const tz = p.params.TZID && isZone(p.params.TZID) ? p.params.TZID : 'Europe/Berlin';
  return { at: instant(day, hhmm, tz), day, hhmm, tz };
}

function isZone(z: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: number | null;
  byday: number[];
}

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 } as const;

function rule(v: string): Rule | null {
  const kv = Object.fromEntries(v.split(';').map((x) => x.split('=') as [string, string]));
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(kv.FREQ ?? '')) return null;
  const until = kv.UNTIL ? when({ name: 'UNTIL', params: {}, value: kv.UNTIL }) : null;
  return {
    freq: kv.FREQ as Rule['freq'],
    interval: Math.max(1, +(kv.INTERVAL ?? 1)),
    count: kv.COUNT ? +kv.COUNT : null,
    until: until ? (until.at ?? instant(until.day, '23:59')) : null,
    byday: (kv.BYDAY ?? '')
      .split(',')
      .map((d) => WD[d.slice(-2) as keyof typeof WD])
      .filter((d) => d !== undefined),
  };
}

/** Beginn-Tage einer Wiederholung (lokale Tage), höchstens bis `lastDay`. */
function occurrenceDays(first: Day, r: Rule, lastDay: Day): Day[] {
  const out: Day[] = [];
  const push = (d: Day) => d >= first && out.push(d);
  if (r.freq === 'DAILY') {
    for (let d = first, i = 0; d <= lastDay && i < 4000; d = addDays(d, r.interval), i++) push(d);
  } else if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? r.byday : [weekday(first)];
    // Wochenanfang (Montag) der ersten Woche
    const mon = addDays(first, -((weekday(first) + 6) % 7));
    for (let w = mon, i = 0; w <= lastDay && i < 1000; w = addDays(w, 7 * r.interval), i++)
      for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)))
        push(addDays(w, (wd + 6) % 7));
  } else if (r.freq === 'MONTHLY') {
    for (let i = 0; i < 240; i++) {
      const t = yearOf(first) * 12 + (monthOf(first) - 1) + i * r.interval;
      const d = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-${String(dateOf(first)).padStart(2, '0')}`;
      if (d > lastDay) break;
      // 31. in kürzeren Monaten überspringen (wie Kalender-Apps)
      if (dateOf(first) <= daysInMonth(Math.floor(t / 12), (t % 12) + 1)) push(d);
    }
  } else {
    for (let i = 0; i < 100; i++) {
      const d = `${yearOf(first) + i * r.interval}-${String(monthOf(first)).padStart(2, '0')}-${String(dateOf(first)).padStart(2, '0')}`;
      if (d > lastDay) break;
      if (dateOf(first) <= daysInMonth(yearOf(d), monthOf(d))) push(d);
    }
  }
  return out;
}

/** Termine im Zeitraum [from, to] (Tage, einschließlich), sortiert nach Beginn. */
export function parseIcs(text: string, from: Day, to: Day): IcsEvent[] {
  const all = props(text);
  const events: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  const blocks: Prop[][] = [];
  for (const p of all) {
    if (p.name === 'BEGIN' && p.value === 'VEVENT') cur = [];
    else if (p.name === 'END' && p.value === 'VEVENT' && cur) {
      blocks.push(cur);
      cur = null;
    } else if (cur) cur.push(p);
  }
  for (const b of blocks) {
    const get = (n: string) => b.find((p) => p.name === n);
    const status = get('STATUS')?.value.toUpperCase();
    if (status === 'CANCELLED') continue;
    const s = get('DTSTART') ? when(get('DTSTART')!) : null;
    if (!s || s.at === null) continue;
    const e = get('DTEND') ? when(get('DTEND')!) : null;
    const dur = get('DURATION')?.value;
    let minutes = e?.at != null ? Math.round((e.at - s.at) / MIN_MS) : 60;
    if (e?.at == null && dur) {
      const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(dur);
      if (m) minutes = +(m[1] ?? 0) * 1440 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0) || 60;
    }
    if (minutes <= 0) continue;
    const uid = get('UID')?.value ?? `${s.day}${s.hhmm}`;
    const title = unescape(get('SUMMARY')?.value ?? 'Termin').trim() || 'Termin';
    const exdates = new Set(
      b
        .filter((p) => p.name === 'EXDATE')
        .flatMap((p) => p.value.split(',').map((v) => when({ ...p, value: v })?.day ?? '')),
    );
    const rr = get('RRULE') ? rule(get('RRULE')!.value) : null;
    const days = rr ? occurrenceDays(s.day, rr, to) : [s.day];
    let n = 0;
    for (const d of days) {
      n++;
      if (rr?.count && n > rr.count) break;
      const at = instant(d, s.hhmm, s.tz);
      if (rr?.until && at > rr.until) break;
      if (exdates.has(d) || d < from || d > to) continue;
      events.push({ id: `${uid}@${d}`, title, start: at, minutes });
    }
  }
  return events.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
}
