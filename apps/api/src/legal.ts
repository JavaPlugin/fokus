// Rechtstexte bearbeiten (Markdown, Darstellung in der App: packages/core/src/markdown.ts).
// Lesen öffentlich, schreiben nur Admins (Middleware /api/admin/*, Audit-Log). Je Text bleiben die
// letzten 10 Versionen. Ohne gespeicherte Version gilt der Standardtext aus dem Kern.
// Neue Nutzungsbedingungen: wer vor der neuen Version zugestimmt hat, sieht einmal einen Hinweis;
// „Gelesen“ setzt user.terms_accepted_at neu.
import { LEGAL_DEFAULTS, LEGAL_KEYS, type LegalKey } from '@fokus/core';
import { legalText, user, type Db } from '@fokus/db';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';

const KEEP = 10;

export interface LegalDoc {
  key: LegalKey;
  body: string;
  stand: string | null;
  /** 0 = Standardtext (noch nichts gespeichert). */
  version: number;
  createdAt: string | null;
}

export async function currentLegal(db: Db, key: LegalKey): Promise<LegalDoc> {
  const [row] = await db
    .select()
    .from(legalText)
    .where(eq(legalText.key, key))
    .orderBy(desc(legalText.version))
    .limit(1);
  return row
    ? {
        key,
        body: row.body,
        stand: row.stand,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
      }
    : { key, body: LEGAL_DEFAULTS[key], stand: null, version: 0, createdAt: null };
}

export function registerLegalRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const keyOf = (c: Context) => {
    const k = c.req.param('key');
    return (LEGAL_KEYS as readonly string[]).includes(k ?? '') ? (k as LegalKey) : null;
  };
  const notFound = (c: Context) => c.json({ error: 'Nicht gefunden.' }, 404);

  app.get('/api/legal/:key', async (c) => {
    const k = keyOf(c);
    return k ? c.json(await currentLegal(db, k)) : notFound(c);
  });

  app.get('/api/admin/legal/:key', async (c) => {
    const k = keyOf(c);
    return k ? c.json(await currentLegal(db, k)) : notFound(c);
  });

  app.get('/api/admin/legal/:key/versions', async (c) => {
    const k = keyOf(c);
    if (!k) return notFound(c);
    const rows = await db
      .select({
        version: legalText.version,
        body: legalText.body,
        stand: legalText.stand,
        createdAt: legalText.createdAt,
        by: user.name,
      })
      .from(legalText)
      .leftJoin(user, eq(user.id, legalText.createdBy))
      .where(eq(legalText.key, k))
      .orderBy(desc(legalText.version));
    return c.json(rows);
  });

  app.put('/api/admin/legal/:key', async (c) => {
    const k = keyOf(c);
    if (!k) return notFound(c);
    const b = z
      .object({
        body: z.string().trim().min(1).max(100_000),
        stand: z.iso.date().nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'Text fehlt oder ist zu lang.' }, 400);
    const u = c.get('user')!;
    const doc = await db.transaction(async (tx) => {
      const cur = await currentLegal(tx as unknown as Db, k);
      const version = cur.version + 1;
      await tx.insert(legalText).values({
        key: k,
        version,
        body: b.data.body,
        stand: b.data.stand ?? null,
        createdBy: u.id,
      });
      await tx
        .delete(legalText)
        .where(and(eq(legalText.key, k), lt(legalText.version, version - KEEP + 1)));
      return currentLegal(tx as unknown as Db, k);
    });
    return c.json(doc);
  });

  // Hinweis „Die Nutzungsbedingungen haben sich geändert“
  app.get('/api/me/terms', async (c) => {
    const u = c.get('user');
    if (!u) return c.json({ error: 'Nicht angemeldet.' }, 401);
    const cur = await currentLegal(db, 'nutzungsbedingungen');
    if (!cur.version) return c.json({ version: 0, changed: false });
    const [row] = await db.select({ at: user.termsAcceptedAt }).from(user).where(eq(user.id, u.id));
    // Zugestimmt bzw. gelesen nach der Änderung: kein Hinweis
    const after = !!row?.at && !!cur.createdAt && row.at.toISOString() >= cur.createdAt;
    return c.json({ version: cur.version, changed: !after });
  });

  app.put('/api/me/terms-seen', async (c) => {
    const u = c.get('user');
    if (!u) return c.json({ error: 'Nicht angemeldet.' }, 401);
    await db.update(user).set({ termsAcceptedAt: new Date() }).where(eq(user.id, u.id));
    return c.body(null, 204);
  });
}
