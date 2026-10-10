// Der Tagesplan: aus Aufgaben, Wiederholungen, Kalender-Terminen und Arbeitszeiten entsteht für
// jeden Tag eine Liste. Nichts davon wird gespeichert, es wird bei jeder Anfrage berechnet: neue
// oder geänderte Aufgaben wirken sofort, „Neu planen“ ist nicht nötig.
//
// Feste Zeiten stehen immer da (auch außerhalb der Arbeitszeit), automatische Aufgaben legt der
// Planer in die freie Arbeitszeit, einmalige wandern bei Platzmangel an den nächsten Arbeitstag.
import {
  MIN_MS,
  addDays,
  clock,
  dayInZone,
  freeGaps,
  instant,
  occursOn,
  planAhead,
  recurrenceLabel,
  suggestForGap,
  weekday,
  type AutoTask,
  type Day,
  type Interval,
  type PlanSettings,
  type TaskKind,
} from '@fokus/core';
import { task, taskOccurrence, timeBlock, type Db } from '@fokus/db';
import { and, gte, lt } from 'drizzle-orm';
import { loadSettings, type EventRow, type TaskRow } from './planning';

/** So viele Tage schaut der Planer für einmalige automatische Aufgaben voraus. */
export const HORIZON = 14;

export interface AgendaItem {
  /** Aufgabe@Tag, bei Terminen „event:…“ */
  key: string;
  taskId: string | null;
  day: Day;
  title: string;
  kind: TaskKind | 'event';
  /** Beginn (ISO) */
  start: string;
  minutes: number;
  /** auto = vom Planer, fixed = feste Zeit, event = Kalender */
  how: 'auto' | 'fixed' | 'event';
  /** „täglich“, „werktags“, „jeden Mo“ oder leer */
  recurring: string;
  done: boolean;
  doneAt: string | null;
  /** Dieses Vorkommen wurde einzeln geändert */
  changed: boolean;
}

export interface Agenda {
  /** Tage von heute bis zum gewünschten Tag (oder nur dieser Tag, wenn er in der Vergangenheit liegt) */
  days: Record<Day, { items: AgendaItem[]; hours: PlanSettings['week'][number] }>;
  /** Automatische Aufgaben ohne Platz in den nächsten Tagen */
  waiting: TaskRow[];
  settings: PlanSettings;
  events: EventRow[];
}

type Occ = typeof taskOccurrence.$inferSelect;

const byOrder = (a: TaskRow, b: TaskRow) => {
  const da = a.due ?? '9999-99-99';
  const db = b.due ?? '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);
};

/** Tage von `from` bis `to` (einschließlich). */
export function daysBetween(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
}

export async function buildAgenda(tx: Db, today: Day, target: Day, now: number): Promise<Agenda> {
  const settings = await loadSettings(tx);
  const past = target < today;
  const first = past ? target : today;
  const last = past ? target : target > addDays(today, HORIZON) ? addDays(today, HORIZON) : target;
  const days = daysBetween(first, last);
  const lo = new Date(instant(first, '00:00'));
  const hi = new Date(instant(addDays(last, 1), '00:00'));

  const tasks = await tx.select().from(task);
  const occs = await tx
    .select()
    .from(taskOccurrence)
    .where(and(gte(taskOccurrence.day, first), lt(taskOccurrence.day, addDays(last, 1))));
  const events = await tx
    .select()
    .from(timeBlock)
    .where(and(gte(timeBlock.startsAt, lo), lt(timeBlock.startsAt, hi)));
  const occOf = new Map<string, Occ>(occs.map((o) => [`${o.taskId}@${o.day}`, o]));

  const out: Agenda['days'] = {};
  const dayInputs: Parameters<typeof planAhead>[0] = [];

  for (const d of days) {
    const hours = settings.week[weekday(d)] ?? null;
    const items: AgendaItem[] = [];
    const busy: Interval[] = [];
    const recurring: AutoTask[] = [];
    const add = (i: AgendaItem, occupy: boolean) => {
      items.push(i);
      if (occupy) {
        const s = new Date(i.start).getTime();
        busy.push({ start: s, end: s + i.minutes * MIN_MS });
      }
    };

    for (const e of events.filter((x) => dayInZone(x.startsAt) === d))
      add(
        {
          key: `event:${e.id}`,
          taskId: null,
          day: d,
          title: e.title || 'Termin',
          kind: 'event',
          start: e.startsAt.toISOString(),
          minutes: e.minutes,
          how: 'event',
          recurring: '',
          done: false,
          doneAt: null,
          changed: false,
        },
        true,
      );

    for (const t of tasks) {
      const label = t.recurrence ? recurrenceLabel(t.recurrence, t.anchor) : '';
      if (t.recurrence) {
        if (!occursOn(t.recurrence, t.anchor, d)) continue;
        const o = occOf.get(`${t.id}@${d}`);
        if (o?.skipped) continue;
        const minutes = o?.minutes ?? t.minutes;
        const title = o?.title ?? t.title;
        const done = !!o?.doneAt;
        const base = {
          key: `${t.id}@${d}`,
          taskId: t.id,
          day: d,
          title,
          kind: t.kind as TaskKind,
          minutes,
          recurring: label,
          done,
          doneAt: o?.doneAt?.toISOString() ?? null,
          changed: !!(o && (o.title || o.minutes || o.time)),
        };
        if (t.schedule === 'fixed' && t.fixedAt) {
          const time = o?.time ?? clock(t.fixedAt);
          add({ ...base, start: new Date(instant(d, time)).toISOString(), how: 'fixed' }, true);
        } else if (done && o?.doneAt) {
          add({ ...base, start: o.doneAt.toISOString(), how: 'auto' }, false);
        } else {
          recurring.push({ id: base.key, minutes });
          // Platzhalter, Beginn setzt die Planung
          items.push({ ...base, start: '', how: 'auto' });
        }
        continue;
      }
      // Einmalig mit fester Zeit
      if (t.schedule === 'fixed' && t.fixedAt && dayInZone(t.fixedAt) === d) {
        add(
          {
            key: `${t.id}@${d}`,
            taskId: t.id,
            day: d,
            title: t.title,
            kind: t.kind,
            start: t.fixedAt.toISOString(),
            minutes: t.minutes,
            how: 'fixed',
            recurring: '',
            done: t.status === 'done',
            doneAt: t.doneAt?.toISOString() ?? null,
            changed: false,
          },
          true,
        );
      } else if (
        t.schedule === 'auto' &&
        t.status === 'done' &&
        t.doneAt &&
        dayInZone(t.doneAt) === d
      ) {
        // Heute erledigt: steht dort, wo es erledigt wurde
        add(
          {
            key: `${t.id}@${d}`,
            taskId: t.id,
            day: d,
            title: t.title,
            kind: t.kind,
            start: t.doneAt.toISOString(),
            minutes: t.minutes,
            how: 'auto',
            recurring: '',
            done: true,
            doneAt: t.doneAt.toISOString(),
            changed: false,
          },
          false,
        );
      }
    }
    out[d] = { items, hours };
    dayInputs.push({ day: d, hours, busy, recurring });
  }

  // Einmalige automatische Aufgaben in Reihenfolge; vergangene Tage planen nichts mehr
  const pending = past
    ? []
    : tasks
        .filter((t) => t.schedule === 'auto' && !t.recurrence && t.status === 'open')
        .sort(byOrder);
  const plan = planAhead(
    dayInputs,
    pending.map((t) => ({ id: t.id, minutes: t.minutes })),
    past ? undefined : now,
  );
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const d of days) {
    const entry = out[d]!;
    // Platzhalter der Wiederkehrenden: Beginn aus der Planung, sonst weg
    const placed = new Map(plan.byDay[d]!.map((p) => [p.taskId, p]));
    entry.items = entry.items.flatMap((i) => {
      if (i.start) return [i];
      const p = placed.get(i.key);
      return p ? [{ ...i, start: new Date(p.start).toISOString() }] : [];
    });
    for (const p of plan.byDay[d]!) {
      const t = byId.get(p.taskId);
      if (!t || t.recurrence) continue;
      entry.items.push({
        key: `${t.id}@${d}`,
        taskId: t.id,
        day: d,
        title: t.title,
        kind: t.kind,
        start: new Date(p.start).toISOString(),
        minutes: p.minutes,
        how: 'auto',
        recurring: '',
        done: false,
        doneAt: null,
        changed: false,
      });
    }
    entry.items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  return {
    days: out,
    waiting: plan.unplaced.map((id) => byId.get(id)!).filter(Boolean),
    settings,
    events,
  };
}

/** Freie Zeit eines Tages mit einem Vorschlag aus den Aufgaben ohne Zeit (oder ohne Platz). */
export function gapsOf(agenda: Agenda, day: Day, now: number, today: Day, later: TaskRow[]) {
  const entry = agenda.days[day];
  if (!entry || !entry.hours) return [];
  const busy: Interval[] = entry.items
    .filter((i) => i.start)
    .map((i) => ({
      start: new Date(i.start).getTime(),
      end: new Date(i.start).getTime() + i.minutes * MIN_MS,
    }));
  const candidates = [...later, ...agenda.waiting]
    .filter((t) => t.status === 'open' && t.kind === 'work')
    .map((t) => ({ id: t.id, title: t.title, minutes: t.minutes, due: t.due }));
  return freeGaps(day, entry.hours, busy, day === today ? now : undefined).map((g) => {
    const minutes = Math.floor((g.end - g.start) / MIN_MS);
    const s = suggestForGap(minutes, candidates, 1)[0];
    return {
      start: new Date(g.start).toISOString(),
      end: new Date(g.end).toISOString(),
      minutes,
      suggestion: s ? { taskId: s.id, title: s.title, minutes: s.minutes } : null,
    };
  });
}
