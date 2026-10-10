// Benachrichtigungen: ein Weg für alles (Erinnerung vor Fokus-Block und Social-Slot, Tagesrückblick).
// Kanal App (Web Push), E-Mail oder beides; pro Ereignis höchstens einmal (notification_log).
// Täglicher Job: ab 09:00 Europe/Berlin, holt nach, wenn der Server um 9 Uhr aus war.
import type { Day } from '@fokus/core';
import { notificationLog, user, userSettings, withUser, type Db } from '@fokus/db';
import { eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';
import type { Mail, Mailer } from './mail';
import { testMail, updateMail } from './mail-templates';
import type { Push, PushMessage } from './push';

export type NotifyKind = 'focus' | 'social' | 'recap';
export interface NotifyPrefs {
  channel: 'app' | 'email' | 'both';
  /** Erinnerung vor einem Fokus-Block */
  focus: boolean;
  /** Erinnerung vor einem Social-Slot */
  social: boolean;
  /** Tagesrückblick am Abend */
  recap: boolean;
}
export const DEFAULT_NOTIFY: NotifyPrefs = {
  channel: 'app',
  focus: true,
  social: true,
  recap: true,
};

/** Datum und Stunde in Berlin (Sommer-/Winterzeit inklusive). */
export function berlin(now: Date): { day: Day; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function createNotifier({
  db,
  mailer,
  push,
  publicUrl,
}: {
  db: Db;
  mailer: Mailer;
  push: Push;
  publicUrl: string;
}) {
  async function prefs(userId: string): Promise<NotifyPrefs> {
    const [row] = await withUser(db, userId, (tx) =>
      tx.select({ n: userSettings.notify }).from(userSettings),
    );
    return { ...DEFAULT_NOTIFY, ...(row?.n ?? {}) };
  }

  async function emailOf(userId: string) {
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
    return u?.email ?? null;
  }

  /** true, wenn der Schlüssel neu ist (und damit jetzt gesendet werden darf). */
  async function claim(userId: string, key: string) {
    const rows = await withUser(db, userId, (tx) =>
      tx
        .insert(notificationLog)
        .values({ userId, key })
        .onConflictDoNothing()
        .returning({ key: notificationLog.key }),
    );
    return rows.length > 0;
  }

  /**
   * An einen Nutzer, je nach Kanal und Art. Mit `key` höchstens einmal.
   * Fehler beim Versand brechen nie die Anfrage ab, die die Mitteilung ausgelöst hat.
   */
  async function send(
    userId: string,
    kind: NotifyKind | 'test',
    msg: { push: PushMessage; mail: (to: string) => Mail },
    key?: string,
  ): Promise<boolean> {
    const p = await prefs(userId);
    if (kind !== 'test' && !p[kind]) return false;
    if (key && !(await claim(userId, key))) return false;
    if (p.channel !== 'email') await push.notify(userId, msg.push).catch(() => undefined);
    if (p.channel !== 'app') {
      const to = await emailOf(userId);
      if (to) await mailer.send(msg.mail(to)).catch(() => undefined);
    }
    return true;
  }

  /** „Test senden“ in den Einstellungen. */
  const test = (userId: string) =>
    send(userId, 'test', {
      push: {
        title: 'FOKUS',
        body: 'Benachrichtigungen funktionieren.',
        url: '/profil',
      },
      mail: (to) => testMail(to, publicUrl),
    });

  /** Neue Version: Admins einmal per E-Mail informieren. */
  async function announceUpdate(version: string, current: string) {
    const admins = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.role, 'admin'));
    for (const a of admins)
      if (await claim(a.id, `update:${version}`))
        await mailer
          .send(updateMail(a.email, publicUrl, { version, current }))
          .catch(() => undefined);
  }

  return { prefs, send, claim, test, announceUpdate };
}

export type Notifier = ReturnType<typeof createNotifier>;

/**
 * Täglicher Lauf: ab 9 Uhr Berlin einmal pro Tag. Gibt zurück, ob er lief.
 * `latest` (optional) fragt beim Updater nach einer neuen Version.
 */
export function createReminderJob(
  notifier: Notifier,
  latest?: () => Promise<{ version: string; current: string } | null>,
  /** Weitere tägliche Aufgabe (z. B. unbestätigte Konten aufräumen). */
  daily?: (now: Date) => Promise<unknown>,
) {
  let lastDay = '';
  async function run(now = new Date()) {
    const { day, hour } = berlin(now);
    if (hour < 9 || lastDay === day) return false;
    lastDay = day;
    await daily?.(now).catch(() => undefined);
    const l = await latest?.().catch(() => null);
    if (l) await notifier.announceUpdate(l.version, l.current);
    return true;
  }
  return {
    run,
    /** Alle 10 Minuten prüfen (holt verpasste 9-Uhr-Läufe nach). */
    start() {
      const t = setInterval(() => void run().catch(() => undefined), 10 * 60_000);
      t.unref?.();
      void run().catch(() => undefined);
      return () => clearInterval(t);
    },
  };
}

/** Gespeicherte Einstellungen für die Seite „Mitteilungen“. */
export async function saveNotifyPrefs(db: Db, userId: string, prefs: NotifyPrefs) {
  await withUser(db, userId, (tx) =>
    tx
      .insert(userSettings)
      .values({ userId, notify: prefs })
      .onConflictDoUpdate({ target: userSettings.userId, set: { notify: prefs } }),
  );
}

export function registerNotifyRoutes(
  app: Hono<Vars>,
  { db, notifier }: { db: Db; notifier: Notifier },
) {
  const fail = (c: Context, status: 400 | 401 | 403 | 404, error: string) =>
    c.json({ error }, status);
  const userOf = (c: Context) => c.get('user') as SessionUser | null;

  app.get('/api/notify', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    return c.json({ prefs: await notifier.prefs(u.id) });
  });

  app.put('/api/notify', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const b = z
      .object({
        channel: z.enum(['app', 'email', 'both']),
        focus: z.boolean(),
        social: z.boolean(),
        recap: z.boolean(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Ungültige Einstellung.');
    await saveNotifyPrefs(db, u.id, b.data);
    return c.json({ prefs: b.data });
  });

  app.post('/api/notify/test', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    if (u.role !== 'admin') return fail(c, 403, 'Nur für Admins.');
    await notifier.test(u.id);
    return c.body(null, 204);
  });
}
