// Admin: Nutzer verwalten (Liste, Rolle, sperren, Sitzungen, Passkeys, Link erneut, löschen).
// Schutz serverseitig: sich selbst nicht sperren/herabstufen/löschen, der letzte Admin bleibt.
// Die ändernden Better-Auth-Admin-Endpunkte sind gesperrt, damit niemand diese Regeln umgeht.
// Protokoll über die Audit-Middleware (/api/admin/*). Keine Finanzdaten.
import { passkey, session, user, type Db } from '@fokus/db';
import { asc, count, eq, max } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import type { createAuth } from './auth';

/** Better-Auth-Admin-Endpunkte, die an den Schutzregeln vorbei ändern würden. */
const BLOCKED = new Set([
  'set-role',
  'ban-user',
  'unban-user',
  'remove-user',
  'impersonate-user',
  'create-user',
  'update-user',
  'set-user-password',
  'revoke-user-session',
  'revoke-user-sessions',
]);

async function adminCount(db: Db) {
  const [r] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
  return r?.n ?? 0;
}

/**
 * Nutzer löschen: Sitzungen, Passkeys und alle Fachdaten gehen per ON DELETE CASCADE mit.
 * (Hier zentral, damit später Aufräumen für geteilte Daten wie Fokus-Räume ergänzt werden kann.)
 */
export async function deleteUserData(db: Db, userId: string) {
  await db.delete(user).where(eq(user.id, userId));
}

export function registerUserAdmin(
  app: Hono<Vars>,
  { db, auth, publicUrl }: { db: Db; auth: ReturnType<typeof createAuth>; publicUrl: string },
) {
  const fail = (c: Context, status: 400 | 404 | 409, error: string) => c.json({ error }, status);
  const me = (c: Context) => c.get('user') as NonNullable<Vars['Variables']['user']>;
  const target = async (id: string) => {
    if (!z.uuid().safeParse(id).success) return null;
    const [u] = await db.select().from(user).where(eq(user.id, id));
    return u ?? null;
  };

  app.use('/api/auth/admin/:action', async (c, next) => {
    if (c.req.method !== 'GET' && BLOCKED.has(c.req.param('action')))
      return c.json({ error: 'Bitte über Admin → Nutzer.' }, 403);
    await next();
  });

  app.get('/api/admin/users', async (c) => {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.createdAt));
    const seen = await db
      .select({ id: session.userId, at: max(session.updatedAt) })
      .from(session)
      .groupBy(session.userId);
    const keys = await db
      .select({ id: passkey.userId, n: count() })
      .from(passkey)
      .groupBy(passkey.userId);
    return c.json(
      rows.map((u) => ({
        ...u,
        role: u.role ?? 'user',
        banned: !!u.banned,
        lastSeen: seen.find((s) => s.id === u.id)?.at ?? null,
        passkeys: keys.find((k) => k.id === u.id)?.n ?? 0,
      })),
    );
  });

  app.put('/api/admin/users/:id/role', async (c) => {
    const b = z
      .object({ role: z.enum(['admin', 'user']) })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Ungültige Rolle.');
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    if (b.data.role === 'user' && u.role === 'admin') {
      if (u.id === me(c).id) return fail(c, 409, 'Du kannst dich nicht selbst herabstufen.');
      if ((await adminCount(db)) <= 1) return fail(c, 409, 'Der letzte Admin bleibt Admin.');
    }
    await db.update(user).set({ role: b.data.role }).where(eq(user.id, u.id));
    return c.body(null, 204);
  });

  app.put('/api/admin/users/:id/ban', async (c) => {
    const b = z.object({ banned: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Ungültige Anfrage.');
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    if (u.id === me(c).id) return fail(c, 409, 'Du kannst dich nicht selbst sperren.');
    await db
      .update(user)
      .set({ banned: b.data.banned, banReason: b.data.banned ? 'Im Admin-Panel gesperrt' : null })
      .where(eq(user.id, u.id));
    if (b.data.banned) await db.delete(session).where(eq(session.userId, u.id));
    return c.body(null, 204);
  });

  app.delete('/api/admin/users/:id/sessions', async (c) => {
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    await db.delete(session).where(eq(session.userId, u.id));
    return c.body(null, 204);
  });

  app.delete('/api/admin/users/:id/passkeys', async (c) => {
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    await db.delete(passkey).where(eq(passkey.userId, u.id));
    return c.body(null, 204);
  });

  // Anmeldelink erneut senden (z. B. unbestätigt oder Passkey verloren)
  app.post('/api/admin/users/:id/link', async (c) => {
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    if (u.banned) return fail(c, 409, 'Gesperrte Nutzer bekommen keinen Link.');
    await auth.api.signInMagicLink({
      body: { email: u.email, callbackURL: `${publicUrl}/` },
      headers: c.req.raw.headers,
    });
    return c.body(null, 204);
  });

  // Löschen: Name zur Bestätigung eintippen
  app.delete('/api/admin/users/:id', async (c) => {
    const b = z.object({ name: z.string() }).safeParse(await c.req.json().catch(() => null));
    const u = await target(c.req.param('id'));
    if (!u) return fail(c, 404, 'Nutzer nicht gefunden.');
    if (u.id === me(c).id) return fail(c, 409, 'Dich selbst löschst du im Profil, nicht hier.');
    if (u.role === 'admin' && (await adminCount(db)) <= 1)
      return fail(c, 409, 'Der letzte Admin kann nicht gelöscht werden.');
    if (!b.success || b.data.name.trim() !== u.name.trim())
      return fail(c, 400, 'Der Name stimmt nicht.');
    await deleteUserData(db, u.id);
    return c.body(null, 204);
  });
}
