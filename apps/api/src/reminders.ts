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
  timeBlock,
  user,
  userSettings,
  withAdmin,
  type Db,
} from '@fokus/db';
import { and, gte, inArray, lt } from 'drizzle-orm';
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
    const from = new Date(now.getTime() - MIN_MS);
    const to = new Date(now.getTime() + LEAD_MINUTES * MIN_MS);
    const due = await withAdmin(db, (tx) =>
      tx
        .select()
        .from(timeBlock)
        .where(
          and(
            inArray(timeBlock.kind, ['focus', 'social']),
            inArray(timeBlock.status, ['planned']),
            gte(timeBlock.startsAt, from),
            lt(timeBlock.startsAt, to),
          ),
        ),
    );
    let sent = 0;
    for (const b of due) {
      const kind = b.kind === 'focus' ? ('focus' as const) : ('social' as const);
      const title = b.title || (kind === 'focus' ? 'Fokus-Block' : 'Social-Slot');
      const time = clock(b.startsAt);
      const inMinutes = Math.max(0, Math.round((b.startsAt.getTime() - now.getTime()) / MIN_MS));
      const ok = await notifier.send(
        b.userId,
        kind,
        {
          push: {
            title: kind === 'focus' ? `Gleich: ${title}` : 'Gleich: Social-Slot',
            body: `${time} Uhr · ${b.minutes} Min.`,
            url: '/',
          },
          mail: (to) =>
            reminderMail(to, publicUrl, { title, kind, time, minutes: b.minutes, inMinutes }),
        },
        `block:${b.id}`,
      );
      if (ok) sent++;
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
