// Web Push: Mitteilungen an installierte Apps (iPhone ab iOS 16.4 nur als Home-Bildschirm-App).
// Das VAPID-Schlüsselpaar erzeugt die API beim ersten Bedarf und legt es in app_settings ab,
// damit bestehende Installationen nichts an .env oder install.sh ändern müssen.
import { appSettings, pushSubscription, withUser, type Db } from '@fokus/db';
import { and, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import webpush from 'web-push';
import { z } from 'zod';
import type { Vars } from './app';

export interface PushMessage {
  title: string;
  body: string;
  /** Pfad in der App, der beim Antippen öffnet. */
  url: string;
}

export type PushSend = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapid: { subject: string; publicKey: string; privateKey: string },
) => Promise<void>;

/** Standard: echter Versand. Antwortet der Dienst 404/410, ist das Abo tot. */
const realSend: PushSend = async (sub, payload, v) => {
  await webpush.sendNotification(sub, payload, {
    vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey },
    TTL: 24 * 3600,
  });
};

export function createPush(db: Db, publicUrl: string, send: PushSend = realSend) {
  let cached: { publicKey: string; privateKey: string } | null = null;

  async function keys() {
    if (cached) return cached;
    await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await db.select({ vapid: appSettings.vapid }).from(appSettings);
    if (row?.vapid) return (cached = row.vapid);
    const fresh = webpush.generateVAPIDKeys();
    await db.update(appSettings).set({ vapid: fresh }).where(eq(appSettings.id, 1));
    return (cached = fresh);
  }

  /** An alle Geräte eines Nutzers. Fehler beim Versand brechen nie die Anfrage ab. */
  async function notify(userId: string, msg: PushMessage) {
    try {
      const subs = await withUser(db, userId, (tx) => tx.select().from(pushSubscription));
      if (!subs.length) return;
      const v = {
        subject: publicUrl.startsWith('https') ? publicUrl : 'mailto:admin@localhost',
        ...(await keys()),
      };
      for (const s of subs) {
        try {
          await send(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(msg),
            v,
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await withUser(db, userId, (tx) =>
              tx
                .delete(pushSubscription)
                .where(
                  and(
                    eq(pushSubscription.userId, userId),
                    eq(pushSubscription.endpoint, s.endpoint),
                  ),
                ),
            );
        }
      }
    } catch {
      /* Mitteilung ist ein Extra, die Buchung zählt */
    }
  }

  function register(app: Hono<Vars>) {
    const fail = (c: Context, status: 400 | 401, error: string) => c.json({ error }, status);

    app.get('/api/push/key', async (c) => c.json({ publicKey: (await keys()).publicKey }));

    app.post('/api/push/subscription', async (c) => {
      const u = c.get('user');
      if (!u) return fail(c, 401, 'Nicht angemeldet.');
      const r = z
        .object({
          endpoint: z.url().max(1000),
          keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!r.success) return fail(c, 400, 'Ungültiges Abo.');
      const row = { p256dh: r.data.keys.p256dh, auth: r.data.keys.auth };
      await withUser(db, u.id, (tx) =>
        tx
          .insert(pushSubscription)
          .values({ userId: u.id, endpoint: r.data.endpoint, ...row })
          .onConflictDoUpdate({
            target: [pushSubscription.userId, pushSubscription.endpoint],
            set: row,
          }),
      );
      return c.body(null, 204);
    });

    app.delete('/api/push/subscription', async (c) => {
      const u = c.get('user');
      if (!u) return fail(c, 401, 'Nicht angemeldet.');
      const r = z
        .object({ endpoint: z.string().max(1000) })
        .safeParse(await c.req.json().catch(() => null));
      if (!r.success) return fail(c, 400, 'Ungültiges Abo.');
      await withUser(db, u.id, (tx) =>
        tx.delete(pushSubscription).where(eq(pushSubscription.endpoint, r.data.endpoint)),
      );
      return c.body(null, 204);
    });
  }

  return { keys, notify, register };
}

export type Push = ReturnType<typeof createPush>;
