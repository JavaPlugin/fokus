// Erinnerungen: kurz vor einem Fokus-Block oder Social-Slot und der Tagesrückblick am Abend.
// Läuft jede Minute für alle Nutzer (Admin-Kontext liest nur Zeiten), Versand über den Notifier:
// pro Ereignis höchstens einmal, Kanal und Schalter wie in den Einstellungen.
import {
  DEFAULT_SETTINGS,
  MIN_MS,
  addDays,
  clock,
  instant,
  spentOn,
  type CreditEntry,
} from '@fokus/core';
import {
  creditEntry,
  focusSession,
  user,
  userSettings,
  withAdmin,
  withUser,
  type Db,
} from '@fokus/db';
import { and, gte, lt } from 'drizzle-orm';
import { buildAgenda } from './agenda';
import { berlin, type Notifier } from './notify';
import { recapMail, reminderMail } from './mail-templates';

/** So viele Minuten vor dem Beginn kommt die Erinnerung. */
export const LEAD_MINUTES = 5;
/** Ab dieser Stunde (Berlin) kommt der Tagesrückblick. */
export const RECAP_HOUR = 20;

export function createReminders({
  db,
  notifier,
  publicUrl,
}: {
  db: Db;
  notifier: Notifier;
  publicUrl: string;
}) {
  async function blockReminders(now: Date) {
    const lo = now.getTime() - MIN_MS;
    const hi = now.getTime() + LEAD_MINUTES * MIN_MS;
    const { day } = berlin(now);
    const users = await db.select({ id: user.id }).from(user);
    let sent = 0;
    for (const u of users) {
      // Tagesplan des Nutzers: was beginnt in den nächsten Minuten?
      const agenda = await withUser(db, u.id, (tx) => buildAgenda(tx, day, day, now.getTime()));
      for (const i of agenda.days[day]?.items ?? []) {
        const start = new Date(i.start).getTime();
        if (i.done || (i.kind !== 'work' && i.kind !== 'social') || start < lo || start >= hi)
          continue;
        const kind = i.kind === 'work' ? ('focus' as const) : ('social' as const);
        const time = clock(i.start);
        const ok = await notifier.send(
          u.id,
          kind,
          {
            push: {
              title: kind === 'focus' ? `Gleich: ${i.title}` : 'Gleich: Social-Slot',
              body: `${time} Uhr · ${i.minutes} Min.`,
              url: '/',
            },
            mail: (to) =>
              reminderMail(to, publicUrl, {
                title: i.title,
                kind,
                time,
                minutes: i.minutes,
                inMinutes: Math.max(0, Math.round((start - now.getTime()) / MIN_MS)),
              }),
          },
          `block:${i.key}`,
        );
        if (ok) sent++;
      }
    }
    return sent;
  }

  async function recaps(now: Date) {
    const { day, hour } = berlin(now);
    if (hour < RECAP_HOUR) return 0;
    const from = new Date(instant(day, '00:00'));
    const to = new Date(instant(addDays(day, 1), '00:00'));
    const users = await db.select({ id: user.id }).from(user);
    let sent = 0;
    for (const u of users) {
      const stats = await withAdmin(db, async (tx) => {
        // Nur dieser Nutzer: im Admin-Kontext filtern wir selbst
        const sessions = (
          await tx
            .select()
            .from(focusSession)
            .where(and(gte(focusSession.startedAt, from), lt(focusSession.startedAt, to)))
        ).filter((s) => s.userId === u.id);
        const credit = (
          await tx.select().from(creditEntry).where(gte(creditEntry.at, from))
        ).filter((c) => c.userId === u.id);
        return { sessions, credit };
      });
      const focus = stats.sessions.reduce((s, x) => s + x.focusedMinutes, 0);
      const entries: CreditEntry[] = stats.credit.map((c) => ({
        at: c.at.toISOString(),
        minutes: c.minutes,
        reason: c.reason,
      }));
      const social = spentOn(entries, day);
      if (!focus && !social) continue;
      const baseline = await withAdmin(
        db,
        async (tx) =>
          (await tx.select().from(userSettings)).find((x) => x.userId === u.id)?.plan
            ?.baselineScroll,
      );
      const regained = Math.max(0, (baseline ?? DEFAULT_SETTINGS.baselineScroll) - social);
      const ok = await notifier.send(
        u.id,
        'recap',
        {
          push: {
            title: `Heute: ${focus} Min. Fokus`,
            body: `${regained} Min. vom Scrollen zurückgeholt`,
            url: '/woche',
          },
          mail: (to) =>
            recapMail(to, publicUrl, { day, focusMinutes: focus, socialMinutes: social, regained }),
        },
        `recap:${day}`,
      );
      if (ok) sent++;
    }
    return sent;
  }

  return {
    /** Ein Durchlauf (jede Minute). */
    async tick(now = new Date()) {
      return { blocks: await blockReminders(now), recaps: await recaps(now) };
    },
    start(everyMs = 60_000) {
      const t = setInterval(() => void this.tick().catch(() => undefined), everyMs);
      t.unref?.();
      return () => clearInterval(t);
    },
  };
}
