// Umleiten: Wer eine Social-App außerhalb eines Slots öffnen will, bekommt eine 2-Minuten-Aufgabe
// statt einer Sperre. Aufgabe machen = Bonus-Guthaben (höchstens 3 am Tag), 10 Min. vom Guthaben
// nehmen = /api/credit/spend (reason redirect), trotzdem öffnen = nichts.
// Die PWA sieht nicht, welche App geöffnet wird: die Kurzbefehle-Automation ruft /umleiten?app=…
import { MIN_MS, creditSummary, pickRedirectTask, todayIn, type Day } from '@fokus/core';
import { creditEntry, task, withUser, type Db } from '@fokus/db';
import { and, eq, gt, gte } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import { buildAgenda } from './agenda';
import { authed, dayRange, loadCredit, loadSettings, parseBody, uuid } from './planning';

export const REDIRECT_APPS: Record<string, { label: string; url: string }> = {
  instagram: { label: 'Instagram', url: 'instagram://' },
  tiktok: { label: 'TikTok', url: 'tiktok://' },
  youtube: { label: 'YouTube', url: 'youtube://' },
  x: { label: 'X', url: 'twitter://' },
  facebook: { label: 'Facebook', url: 'fb://' },
  reddit: { label: 'Reddit', url: 'reddit://' },
  snapchat: { label: 'Snapchat', url: 'snapchat://' },
};

/** Höchstens so oft am Tag gibt eine Umleitungs-Aufgabe Guthaben. */
export const BONUS_PER_DAY = 3;

const FALLBACKS = [
  'Ein Glas Wasser trinken',
  'Fenster öffnen und dreimal tief atmen',
  'Schultern kreisen und strecken',
  'Den Schreibtisch kurz aufräumen',
  'Eine Nachricht beantworten, die schon wartet',
];

export function registerRedirectRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  app.get('/api/redirect', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const key = (c.req.query('app') ?? '').toLowerCase();
    const info = REDIRECT_APPS[key];
    const now = Date.now();
    const day: Day = todayIn();
    const out = await withUser(db, u.id, async (tx) => {
      const settings = await loadSettings(tx);
      const { from } = dayRange(day);
      // Social-Zeiten heute aus dem Tagesplan: gerade im Slot? sonst der nächste
      const agenda = await buildAgenda(tx, day, day, now);
      const slots = (agenda.days[day]?.items ?? []).filter((i) => i.kind === 'social' && !i.done);
      const start = (i: { start: string }) => new Date(i.start).getTime();
      const inside = slots.find((i) => start(i) <= now && start(i) + i.minutes * MIN_MS > now);
      const next = slots.filter((i) => start(i) > now).sort((a, b) => start(a) - start(b))[0];
      const open = await tx.select().from(task).where(eq(task.status, 'open'));
      const pick = pickRedirectTask(
        open
          .filter((t) => t.kind === 'work' && !t.recurrence && t.schedule !== 'fixed')
          .map((t) => ({ id: t.id, title: t.title, minutes: t.minutes, due: t.due })),
        2,
      );
      const entries = await loadCredit(tx);
      const bonusToday = (
        await tx
          .select({ id: creditEntry.id })
          .from(creditEntry)
          .where(
            and(
              eq(creditEntry.reason, 'redirect'),
              gt(creditEntry.minutes, 0),
              gte(creditEntry.at, from),
            ),
          )
      ).length;
      return {
        app: key,
        label: info?.label ?? 'Social Media',
        url: info?.url ?? null,
        insideSlot: !!inside,
        nextSocial: next?.start ?? null,
        task: pick ? { id: pick.id, title: pick.title, minutes: pick.minutes } : null,
        fallback: FALLBACKS[Math.floor(now / 60_000) % FALLBACKS.length],
        bonus: bonusToday < BONUS_PER_DAY ? settings.redirectBonus : 0,
        spend: settings.redirectSpend,
        credit: creditSummary(entries, day, settings),
      };
    });
    return c.json(out);
  });

  /** 2-Minuten-Aufgabe gemacht: Aufgabe erledigt (falls es eine echte war) und Bonus gutschreiben. */
  app.post('/api/redirect/done', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, z.object({ taskId: uuid.optional() }));
    if (b instanceof Response) return b;
    const res = await withUser(db, u.id, async (tx) => {
      const settings = await loadSettings(tx);
      const { from } = dayRange(todayIn());
      const bonusToday = (
        await tx
          .select({ id: creditEntry.id })
          .from(creditEntry)
          .where(
            and(
              eq(creditEntry.reason, 'redirect'),
              gt(creditEntry.minutes, 0),
              gte(creditEntry.at, from),
            ),
          )
      ).length;
      if (b.taskId)
        await tx
          .update(task)
          .set({ status: 'done', doneAt: new Date() })
          .where(eq(task.id, b.taskId));
      const bonus = bonusToday < BONUS_PER_DAY ? settings.redirectBonus : 0;
      if (bonus > 0)
        await tx.insert(creditEntry).values({ userId: u.id, minutes: bonus, reason: 'redirect' });
      return { bonus, credit: creditSummary(await loadCredit(tx), todayIn(), settings) };
    });
    return c.json(res);
  });
}
