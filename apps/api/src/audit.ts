// Audit-Log: jede ändernde Admin-Aktion (Admin-API und Better-Auth-Admin wie Sperren, Rollen)
// mit wer, was, wann. Werte von Geheimnissen werden nie gespeichert.
import { adminAudit, type Db } from '@fokus/db';
import { desc } from 'drizzle-orm';
import type { Context, Hono, Next } from 'hono';
import type { SessionUser, Vars } from './app';

const SECRET = /secret|token|password|pass|key|code/i;

/** Kleiner, unbedenklicher Auszug aus dem Body (keine Geheimnisse, keine langen Texte). */
function summary(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SECRET.test(k)) out[k] = '…';
    else if (typeof v === 'string') out[k] = v.length > 80 ? `${v.slice(0, 80)}…` : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else out[k] = '…';
  }
  return out;
}

export async function audit(
  db: Db,
  actor: { id: string; email: string } | null,
  action: string,
  target?: string | null,
  detail?: Record<string, unknown> | null,
) {
  await db
    .insert(adminAudit)
    .values({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      target: target ?? null,
      detail: detail ?? null,
    })
    .catch(() => undefined);
}

/** Middleware: nach erfolgreicher Änderung (POST/PUT/PATCH/DELETE, Status < 400) protokollieren. */
export function auditMiddleware(db: Db) {
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const body = await c.req.raw
      .clone()
      .json()
      .catch(() => null);
    await next();
    const u = c.get('user') as SessionUser | null;
    if (c.res.status >= 400 || !u || u.role !== 'admin') return;
    const path = new URL(c.req.url).pathname;
    const detail = summary(body);
    // Ziel: Nutzer-ID bei Better-Auth-Admin-Aktionen, sonst der Pfad selbst
    const target = (body as { userId?: string } | null)?.userId ?? null;
    await audit(db, u, `${method} ${path}`, target, detail);
  };
}

export function registerAuditRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  app.get('/api/admin/audit', async (c) =>
    c.json(await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(200)),
  );
}
