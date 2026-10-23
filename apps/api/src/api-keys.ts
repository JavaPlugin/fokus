// Persönliche API-Schlüssel und die öffentliche API unter /api/v1 (Kurzbefehle). Schlüssel „fk_…“ nur einmal sichtbar, gespeichert als SHA-256.
import { createHash, randomBytes } from 'node:crypto';
import { apiKey, withKeyLookup, withUser, type Db } from '@fokus/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';

/** `gate`: nur „Darf die Social-App auf?“ und Umleiten (Kurzbefehl beim Öffnen einer App). */
export const SCOPES = ['inbox:create', 'gate'] as const;
export type Scope = (typeof SCOPES)[number];

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Schlüssel „fk_…“ prüfen (aus Header oder Adresse). Liefert Nutzer oder Fehlerantwort. */
export async function tokenAuth(
  db: Db,
  c: Context,
  token: string | undefined,
  scope: Scope,
): Promise<{ userId: string } | Response> {
  if (!token || !/^fk_[A-Za-z0-9_-]{20,}$/.test(token))
    return c.json({ error: 'API-Schlüssel fehlt.' }, 401);
  const hash = hashKey(token);
  const [row] = await withKeyLookup(db, async (tx) => {
    const found = await tx
      .select({ userId: apiKey.userId, scopes: apiKey.scopes })
      .from(apiKey)
      .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)));
    if (found.length)
      await tx.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.hash, hash));
    return found;
  });
  if (!row) return c.json({ error: 'API-Schlüssel ungültig oder widerrufen.' }, 401);
  if (!row.scopes.includes(scope))
    return c.json({ error: `Dem Schlüssel fehlt das Recht ${scope}.` }, 403);
  return { userId: row.userId };
}

/** Token aus „Authorization: Bearer fk_…“. */
export const bearerOf = (c: Context) =>
  /^Bearer\s+(fk_[A-Za-z0-9_-]{20,})$/.exec(c.req.header('authorization') ?? '')?.[1];

/** Schlüssel aus „Authorization: Bearer fk_…“ prüfen. Liefert Nutzer oder Fehlerantwort. */
export const keyAuth = (db: Db, c: Context, scope: Scope) => tokenAuth(db, c, bearerOf(c), scope);

/** Neuen Schlüssel erzeugen: Klartext (nur jetzt sichtbar) und was gespeichert wird. */
export function newKey() {
  const key = `fk_${randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 9), hash: hashKey(key) };
}

export function registerApiKeyRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const fail = (c: Context, status: 400 | 401 | 404, error: string) => c.json({ error }, status);
  const userOf = (c: Context) => c.get('user') as SessionUser | null;

  // ---------- Schlüssel verwalten (angemeldet) ----------

  const list = (userId: string) =>
    withUser(db, userId, (tx) =>
      tx
        .select({
          id: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          scopes: apiKey.scopes,
          lastUsedAt: apiKey.lastUsedAt,
          createdAt: apiKey.createdAt,
        })
        .from(apiKey)
        .where(isNull(apiKey.revokedAt))
        .orderBy(apiKey.createdAt),
    );

  app.get('/api/me/keys', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    return c.json(await list(u.id));
  });

  app.post('/api/me/keys', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const b = z
      .object({
        name: z.string().trim().min(1, 'Gib dem Schlüssel einen Namen.').max(60),
        scopes: z.array(z.enum(SCOPES)).min(1).default(['inbox:create']),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, b.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    const key = `fk_${randomBytes(24).toString('base64url')}`;
    await withUser(db, u.id, (tx) =>
      tx.insert(apiKey).values({
        userId: u.id,
        name: b.data.name,
        prefix: key.slice(0, 9),
        hash: hashKey(key),
        scopes: [...new Set(b.data.scopes)],
      }),
    );
    // Nur jetzt im Klartext
    return c.json({ key, keys: await list(u.id) }, 201);
  });

  app.delete('/api/me/keys/:id', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return fail(c, 404, 'Schlüssel nicht gefunden.');
    const done = await withUser(db, u.id, (tx) =>
      tx
        .update(apiKey)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
        .returning({ id: apiKey.id }),
    );
    if (!done.length) return fail(c, 404, 'Schlüssel nicht gefunden.');
    return c.json(await list(u.id));
  });

  // ---------- /api/v1: öffentliche API mit Schlüssel (Kurzbefehle) ----------

  // Prüft Schlüssel und Recht; Phase 1 ergänzt /api/v1/inbox (Notiz per Kurzbefehl).
  app.get('/api/v1/ping', async (c) => {
    const auth = await keyAuth(db, c, 'inbox:create');
    if (auth instanceof Response) return auth;
    return c.json({ ok: true });
  });
}
