// Webhooks: Ereignisse an eigene URLs, signiert (HMAC-SHA256 über den Body), mit Wiederholung
// nach 1 min, 10 min und 1 h. Ziele nur öffentlich per HTTPS; Heimnetz und http nur bei
// Webhooks, die ein Admin angelegt hat (allowPrivate). Weiterleitungen werden nicht verfolgt.
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { webhook, webhookDelivery, withAdmin, withUser, type Db } from '@fokus/db';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';
import { EVENTS, onEvent, type FkEvent } from './events';

/** Wartezeit nach dem n-ten Fehlschlag; danach aufgeben. */
const RETRY_MS = [60_000, 10 * 60_000, 60 * 60_000];
const TIMEOUT_MS = 10_000;

export const sign = (secret: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/** Private, lokale oder reservierte Adresse (IPv4/IPv6)? */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
}

export type Resolve = (host: string) => Promise<string[]>;
const dnsResolve: Resolve = async (host) =>
  (await lookup(host, { all: true })).map((a) => a.address);

/** Ziel prüfen. Liefert Fehlertext oder null. */
export async function checkTarget(
  raw: string,
  allowPrivate: boolean,
  resolve: Resolve = dnsResolve,
): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Ungültige Adresse.';
  }
  if (u.username || u.password) return 'Bitte ohne Zugangsdaten in der Adresse.';
  if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:'))
    return 'Nur HTTPS-Adressen.';
  if (allowPrivate) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(local|internal|lan|home)$/i.test(host))
    return 'Adressen im Heimnetz darf nur ein Admin eintragen.';
  const ips = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (!ips.length) return 'Adresse nicht erreichbar.';
  if (ips.some(isPrivateIp)) return 'Adressen im Heimnetz darf nur ein Admin eintragen.';
  return null;
}

export function createWebhooks({
  db,
  fetchFn = fetch,
  resolve = dnsResolve,
  listen = true,
}: {
  db: Db;
  fetchFn?: typeof fetch;
  resolve?: Resolve;
  /** Auf Ereignisse hören (aus für eine zweite Instanz, z. B. im Test). */
  listen?: boolean;
}) {
  let running: Promise<number> | null = null;

  /** Ereignis für alle passenden Webhooks des Nutzers einreihen, dann gleich zustellen. */
  async function enqueue(userId: string, event: FkEvent, data: Record<string, unknown>) {
    const hooks = await withUser(db, userId, async (tx) => {
      const list = (await tx.select().from(webhook).where(eq(webhook.active, true))).filter(
        (h) => event === 'ping' || h.events.includes(event),
      );
      if (list.length)
        await tx.insert(webhookDelivery).values(
          list.map((h) => ({
            userId,
            webhookId: h.id,
            event,
            payload: { event, createdAt: new Date().toISOString(), data },
          })),
        );
      return list.length;
    });
    if (hooks) void deliverDue();
    return hooks;
  }

  /** Fällige Zustellungen senden (alle Nutzer, Admin-Kontext). Liefert die Anzahl. */
  function deliverDue(now = new Date()): Promise<number> {
    if (running) return running;
    running = (async () => {
      const due = await withAdmin(db, (tx) =>
        tx
          .select({ d: webhookDelivery, h: webhook })
          .from(webhookDelivery)
          .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
          .where(and(eq(webhookDelivery.status, 'pending'), lte(webhookDelivery.nextAt, now)))
          .orderBy(webhookDelivery.createdAt)
          .limit(20),
      );
      for (const { d, h } of due) {
        const body = JSON.stringify({ id: d.id, ...(d.payload as object) });
        let status: number | null = null;
        let error: string | null = null;
        const bad = await checkTarget(h.url, h.allowPrivate, resolve);
        if (bad) error = bad;
        else
          try {
            const r = await fetchFn(h.url, {
              method: 'POST',
              redirect: 'manual',
              signal: AbortSignal.timeout(TIMEOUT_MS),
              headers: {
                'content-type': 'application/json',
                'user-agent': 'FOKUS-Webhook',
                'x-fokus-event': d.event,
                'x-fokus-delivery': d.id,
                'x-fokus-signature': sign(h.secret, body),
              },
              body,
            });
            status = r.status;
            if (r.status < 200 || r.status >= 300) error = `HTTP ${r.status}`;
          } catch (e) {
            error = (e as Error).message.slice(0, 200);
          }
        const attempts = d.attempts + 1;
        const wait = RETRY_MS[attempts - 1];
        await withAdmin(db, (tx) =>
          tx
            .update(webhookDelivery)
            .set({
              attempts,
              lastStatus: status,
              lastError: error,
              status: !error ? 'ok' : wait === undefined ? 'failed' : 'pending',
              nextAt: new Date(now.getTime() + (wait ?? 0)),
            })
            .where(eq(webhookDelivery.id, d.id)),
        );
      }
      return due.length;
    })().finally(() => (running = null));
    return running;
  }

  const off = listen
    ? onEvent((userId, event, data) => void enqueue(userId, event, data).catch(() => 0))
    : () => undefined;

  return { enqueue, deliverDue, stop: off };
}

export type Webhooks = ReturnType<typeof createWebhooks>;

export function registerWebhookRoutes(
  app: Hono<Vars>,
  { db, hooks, resolve }: { db: Db; hooks: Webhooks; resolve?: Resolve },
) {
  const fail = (c: Context, status: 400 | 401 | 404, error: string) => c.json({ error }, status);
  const userOf = (c: Context) => c.get('user') as SessionUser | null;

  const list = (userId: string) =>
    withUser(db, userId, async (tx) => {
      const hs = await tx
        .select({
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          active: webhook.active,
          allowPrivate: webhook.allowPrivate,
          createdAt: webhook.createdAt,
        })
        .from(webhook)
        .orderBy(webhook.createdAt);
      const ds = hs.length
        ? await tx
            .select({
              id: webhookDelivery.id,
              webhookId: webhookDelivery.webhookId,
              event: webhookDelivery.event,
              status: webhookDelivery.status,
              attempts: webhookDelivery.attempts,
              lastStatus: webhookDelivery.lastStatus,
              lastError: webhookDelivery.lastError,
              createdAt: webhookDelivery.createdAt,
            })
            .from(webhookDelivery)
            .where(
              inArray(
                webhookDelivery.webhookId,
                hs.map((h) => h.id),
              ),
            )
            .orderBy(desc(webhookDelivery.createdAt))
            .limit(50)
        : [];
      return hs.map((h) => ({
        ...h,
        deliveries: ds.filter((d) => d.webhookId === h.id).slice(0, 10),
      }));
    });

  app.get('/api/me/webhooks', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    return c.json(await list(u.id));
  });

  app.post('/api/me/webhooks', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const b = z
      .object({
        url: z.string().trim().max(500),
        events: z.array(z.enum(EVENTS as [FkEvent, ...FkEvent[]])).min(1),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Adresse und mindestens ein Ereignis nötig.');
    const admin = u.role === 'admin';
    const bad = await checkTarget(b.data.url, admin, resolve);
    if (bad) return fail(c, 400, bad);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    await withUser(db, u.id, (tx) =>
      tx.insert(webhook).values({
        userId: u.id,
        url: b.data.url,
        secret,
        events: [...new Set(b.data.events)],
        allowPrivate: admin,
      }),
    );
    // Geheimnis nur jetzt sichtbar (zum Prüfen der Signatur auf der Gegenseite)
    return c.json({ secret, webhooks: await list(u.id) }, 201);
  });

  app.delete('/api/me/webhooks/:id', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return fail(c, 404, 'Webhook nicht gefunden.');
    const done = await withUser(db, u.id, (tx) =>
      tx.delete(webhook).where(eq(webhook.id, id)).returning({ id: webhook.id }),
    );
    if (!done.length) return fail(c, 404, 'Webhook nicht gefunden.');
    return c.json(await list(u.id));
  });

  // Test: „ping“ an diesen einen Webhook (sofort zustellen)
  app.post('/api/me/webhooks/:id/test', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return fail(c, 404, 'Webhook nicht gefunden.');
    const found = await withUser(db, u.id, async (tx) => {
      const [h] = await tx.select({ id: webhook.id }).from(webhook).where(eq(webhook.id, id));
      if (h)
        await tx.insert(webhookDelivery).values({
          userId: u.id,
          webhookId: h.id,
          event: 'ping',
          payload: {
            event: 'ping',
            createdAt: new Date().toISOString(),
            data: { hallo: 'FOKUS' },
          },
        });
      return !!h;
    });
    if (!found) return fail(c, 404, 'Webhook nicht gefunden.');
    await hooks.deliverDue();
    return c.json(await list(u.id));
  });
}
