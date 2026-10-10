// Admin-Panel: System, Updates, Backups, Einstellungen. Nur Rolle admin.
// Updates und Backups führt der Updater aus. Die API reicht nur weiter und fügt das Secret an,
// der Browser spricht nie direkt mit dem Updater.

import { appSettings, session, user, withAdmin, type Db } from '@fokus/db';
import { eq, max, sql } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import type { Env } from './env';

export function registerAdmin(
  app: Hono<Vars>,
  { db, env, fetchFn = fetch }: { db: Db; env: Env; fetchFn?: typeof fetch },
) {
  const err = (c: Context, status: 400 | 401 | 403 | 503, error: string) =>
    c.json({ error }, status);

  app.use('/api/admin/*', async (c, next) => {
    const u = c.get('user');
    if (!u) return err(c, 401, 'Nicht angemeldet.');
    if (u.role !== 'admin') return err(c, 403, 'Nur für Admins.');
    await next();
  });

  async function settings() {
    await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    return row!;
  }

  /** Anfrage an den Updater. null = nicht erreichbar. */
  async function updater(path: string, init: RequestInit = {}): Promise<Response | null> {
    if (!env.UPDATER_URL || !env.UPDATER_SECRET) return null;
    try {
      return await fetchFn(`${env.UPDATER_URL}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${env.UPDATER_SECRET}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(
          path.startsWith('/backups/') && !init.method ? 10 * 60_000 : 20_000,
        ),
      });
    } catch {
      return null;
    }
  }

  /** Antwort des Updaters 1:1 durchreichen, mit klarer Meldung, wenn er fehlt. */
  async function relay(c: Context, path: string, init?: RequestInit) {
    const res = await updater(path, init);
    if (!res) return err(c, 503, 'Der Updater ist nicht erreichbar.');
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  app.get('/api/admin/system', async (c) => {
    const s = await settings();
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
    const size = await db.execute(
      sql`select pg_database_size(current_database())::bigint as bytes`,
    );
    const rows = (Array.isArray(size) ? size : (size as { rows: unknown[] }).rows) as {
      bytes: string | number;
    }[];
    const res = await updater('/system');
    return c.json({
      version: env.FK_VERSION,
      users: n,
      dbBytes: Number(rows[0]?.bytes ?? 0),
      registrationMode: s.registrationMode,
      showTestReleases: s.showTestReleases,
      legal: s.legal,
      updater: res?.ok ? await res.json() : null,
    });
  });

  // Nutzungsübersicht: nur Zählwerte je Nutzer (Aufgaben, letzte Anmeldung), nie Inhalte
  app.get('/api/admin/usage', async (c) => {
    const counts = await withAdmin(db, async () => ({
      tasks: [] as { userId: string; n: number }[],
    }));
    const seen = await db
      .select({ userId: session.userId, at: max(session.updatedAt) })
      .from(session)
      .groupBy(session.userId);
    const out: Record<string, { tasks: number; lastSeen: Date | null }> = {};
    const row = (id: string) => (out[id] ??= { tasks: 0, lastSeen: null });
    for (const x of counts.tasks) row(x.userId).tasks = x.n;
    for (const x of seen) row(x.userId).lastSeen = x.at;
    return c.json(out);
  });

  app.put('/api/admin/settings', async (c) => {
    const b = z
      .object({
        registrationMode: z.enum(['invite', 'open']).optional(),
        showTestReleases: z.boolean().optional(),
        legal: z
          .object({
            name: z.string().trim().max(100),
            address: z.string().trim().max(300),
            email: z.union([z.email(), z.literal('')]),
          })
          .optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return err(c, 400, 'Ungültige Einstellung.');
    await settings();
    await db.update(appSettings).set(b.data).where(eq(appSettings.id, 1));
    return c.body(null, 204);
  });

  const pre = async () => ((await settings()).showTestReleases ? '1' : '0');

  app.get('/api/admin/updates', async (c) => relay(c, `/status?prerelease=${await pre()}`));
  app.post('/api/admin/updates/check', async (c) =>
    relay(c, `/check?prerelease=${await pre()}`, { method: 'POST' }),
  );
  app.post('/api/admin/updates/install', async (c) => {
    const b = z
      .object({ version: z.string().max(40) })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return err(c, 400, 'Version fehlt.');
    const allowPrerelease = (await settings()).showTestReleases;
    return relay(c, '/install', {
      method: 'POST',
      body: JSON.stringify({ version: b.data.version, allowPrerelease }),
    });
  });
  app.post('/api/admin/updates/rollback', async (c) => relay(c, '/rollback', { method: 'POST' }));
  app.get('/api/admin/updates/jobs/:id/log', async (c) =>
    relay(c, `/jobs/${encodeURIComponent(c.req.param('id'))}/log`),
  );

  app.get('/api/admin/backups', async (c) => relay(c, '/backups'));
  app.post('/api/admin/backups', async (c) => relay(c, '/backups', { method: 'POST' }));
  app.get('/api/admin/backups/:name', async (c) => {
    const name = c.req.param('name');
    if (!/^[\w.-]+\.dump$/.test(name)) return err(c, 400, 'Ungültiger Dateiname.');
    const res = await updater(`/backups/${encodeURIComponent(name)}`);
    if (!res) return err(c, 503, 'Der Updater ist nicht erreichbar.');
    if (!res.ok) return new Response(res.body, { status: res.status });
    return new Response(res.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${name}"`,
        ...(res.headers.get('content-length') && {
          'content-length': res.headers.get('content-length')!,
        }),
      },
    });
  });
  app.post('/api/admin/backups/:name/restore', async (c) =>
    relay(c, `/backups/${encodeURIComponent(c.req.param('name'))}/restore`, { method: 'POST' }),
  );
}
