import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  appSettings,
  creditEntry,
  expectedMigrations,
  invite,
  migrationState,
  user,
  withUser,
  type Db,
} from '@fokus/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { attemptLimiter, looksLikeBot, purgeUnverified, surgeGuard } from './signup';
import { registerAdmin } from './admin';
import { auditMiddleware, registerAuditRoutes } from './audit';
import { deleteUserData, registerUserAdmin } from './users';
import { registerLegalRoutes } from './legal';
import { registerSeo } from './seo';
import { registerApiKeyRoutes } from './api-keys';
import { createWebhooks, registerWebhookRoutes, type Resolve } from './webhooks';
import { registerDataRoutes } from './data-routes';
import { registerSettingsRoutes } from './settings-routes';
import { registerTaskRoutes } from './task-routes';
import { registerDayRoutes } from './day-routes';
import { registerRedirectRoutes } from './redirect-routes';
import { registerWeekRoutes } from './week-routes';
import { createPush, type PushSend } from './push';
import { createMailer, e2eOutbox, type Mailer } from './mail';
import { loadEmailTemplates, registerEmailTemplateRoutes } from './email-templates';
import { createNotifier, createReminderJob, registerNotifyRoutes } from './notify';
import { createReminders } from './reminders';
import type { Auth } from './auth';
import type { Env } from './env';

/**
 * Ohne Anmeldung erreichbare API: Anmeldung, Einrichtung, Registrierung und Einladungen,
 * öffentlicher Push-Schlüssel, Suchmaschinen, Rechtstexte, API-Schlüssel (eigene Prüfung) und
 * das Test-Postfach nur in Browser-Tests (nie in Produktion).
 */
export function isPublicApi(method: string, path: string, e2e: boolean): boolean {
  if (/^\/api\/(auth|setup|seo|legal)\//.test(path)) return true;
  if (path.startsWith('/api/v1/')) return true;
  if (method === 'POST' && /^\/api\/(register|invites\/accept)$/.test(path)) return true;
  if (method === 'GET' && path === '/api/push/key') return true;
  if (e2e && path.startsWith('/api/e2e/')) return true;
  return false;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  createdAt?: Date | string;
};
export type Vars = { Variables: { user: SessionUser | null } };

export interface AppDeps {
  db: Db;
  auth: Auth;
  env: Env;
  /** Für Tests austauschbar: Aufrufe an den Updater. */
  updaterFetch?: typeof fetch;
  /** Für Tests austauschbar: Versand von Push-Mitteilungen. */
  pushSend?: PushSend;
  /** E-Mail-Versand für Benachrichtigungen (Standard: SMTP aus der .env bzw. Log). */
  mailer?: Mailer;
  /** Für Tests: Webhook-Zustellung und DNS-Auflösung. */
  webhookFetch?: typeof fetch;
  webhookResolve?: Resolve;
  /** Täglichen Erinnerungs-Job starten (nur im echten Server, nicht in Tests). */
  jobs?: boolean;
}

const email = z
  .email('Bitte gib eine gültige E-Mail-Adresse ein.')
  .transform((e) => e.toLowerCase());
const name = z.string().trim().min(1, 'Bitte gib einen Namen ein.').max(80);
const code = z.string().trim().min(1);

const sha256 = (s: string) => createHash('sha256').update(s).digest();
const hashToken = (s: string) => sha256(s).toString('hex');

export function createApp({
  db,
  auth,
  env,
  updaterFetch,
  pushSend,
  mailer,
  jobs,
  webhookFetch,
  webhookResolve,
}: AppDeps) {
  const push = createPush(db, env.PUBLIC_URL, pushSend);
  const mail = mailer ?? createMailer(env);
  const hooks = createWebhooks({ db, fetchFn: webhookFetch, resolve: webhookResolve });
  if (jobs) setInterval(() => void hooks.deliverDue().catch(() => 0), 30_000).unref();
  void loadEmailTemplates(db).catch(() => undefined);
  const notifier = createNotifier({
    db,
    mailer: mail,
    push,
    publicUrl: env.PUBLIC_URL,
  });
  if (jobs) createReminders({ db, notifier, publicUrl: env.PUBLIC_URL }).start();
  if (jobs) {
    // Neue Version beim Updater? (nur wenn er eingerichtet ist)
    const latest = async () => {
      if (!env.UPDATER_URL || !env.UPDATER_SECRET) return null;
      const r = await (updaterFetch ?? fetch)(`${env.UPDATER_URL}/status?prerelease=0`, {
        headers: { authorization: `Bearer ${env.UPDATER_SECRET}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) return null;
      const s = (await r.json()) as { current: string; available: { version: string }[] };
      const v = s.available[0]?.version;
      return v && v !== s.current ? { version: v, current: s.current } : null;
    };
    createReminderJob(notifier, latest, async (now) => {
      await purgeUnverified(db, now);
      // Lebenszeichen: bleibt es aus, meldet der Uptime-Dienst den Ausfall des täglichen Laufs
      if (env.HEARTBEAT_URL)
        await fetch(env.HEARTBEAT_URL, { signal: AbortSignal.timeout(10_000) }).catch(
          () => undefined,
        );
    }).start();
  }
  const app = new Hono<Vars>();
  const limitSetup = attemptLimiter();
  // Offene Registrierung verschickt Mails: höchstens 5 je Stunde und IP
  const limitRegister = attemptLimiter(5, 60 * 60_000);
  // Pro E-Mail-Adresse höchstens 3 Anmeldelinks am Tag (niemand wird mit Mails überflutet)
  const limitEmail = attemptLimiter(3, 24 * 60 * 60_000);
  /** Felder gegen Bots: Honeypot (bleibt leer) und Zeitpunkt, an dem das Formular erschien. */
  const botFields = { website: z.string().max(200).optional(), startedAt: z.number().optional() };
  /** Neue Konten nur mit akzeptierten Nutzungsbedingungen (Zeitpunkt wird gespeichert). */
  const acceptTerms = z.literal(true, 'Bitte akzeptiere die Nutzungsbedingungen.');
  const ipOf = (c: Context) =>
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';

  if (env.API_URL) {
    // Nur Entwicklung: Expo-Dev-Server und API laufen auf verschiedenen Ports.
    app.use('/api/*', cors({ origin: env.PUBLIC_URL, credentials: true }));
  }

  app.use('/api/*', async (c, next) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', (s?.user as SessionUser | undefined) ?? null);
    await next();
  });

  // Keine API-Antwort darf in einem Cache landen (Browser, Service Worker, Proxy): sie enthalten
  // persönliche Daten bzw. hängen von der Sitzung ab.
  app.use('/api/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/seo/')) return;
    c.res.headers.set('Cache-Control', 'no-store');
    c.res.headers.set('Pragma', 'no-cache');
  });

  // Ohne Sitzung nur, was ausdrücklich öffentlich ist; alles andere 401, bevor eine Route läuft
  // (zusätzlich zu den Prüfungen in den Routen selbst).
  const e2e = env.FK_E2E === '1' && env.NODE_ENV !== 'production';
  app.use('/api/*', async (c, next) => {
    if (c.get('user') || isPublicApi(c.req.method, c.req.path, e2e)) return next();
    return c.json({ error: 'Nicht angemeldet.' }, 401);
  });

  // Audit-Log (vor allen Admin-Routen registriert): protokolliert nur, was erfolgreich war
  app.use('/api/admin/*', auditMiddleware(db));
  app.use('/api/auth/admin/*', auditMiddleware(db));

  const fail = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 410 | 429, error: string) =>
    c.json({ error }, status);

  async function body<T extends z.ZodType>(c: Context, s: T): Promise<z.infer<T> | Response> {
    const json = await c.req.json().catch(() => null);
    const r = s.safeParse(json);
    if (!r.success) return fail(c, 400, r.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    return r.data;
  }

  async function settings() {
    await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    return row!;
  }

  function checkSetupCode(c: Context, given: string): Response | null {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
    if (!limitSetup(ip)) return fail(c, 429, 'Zu viele Versuche. Warte 15 Minuten.');
    if (!timingSafeEqual(sha256(given), sha256(env.SETUP_CODE))) {
      return fail(c, 403, 'Der Setup-Code stimmt nicht.');
    }
    return null;
  }

  /** Legt den Nutzer an, falls nötig, und schickt einen Anmeldelink. */
  async function createUserAndSendLink(
    c: Context,
    input: { email: string; name: string; role: 'admin' | 'user' },
    callbackPath: string,
  ) {
    // Bestehende Nutzer behalten Namen und Rolle, außer der Setup-Assistent macht sie zum Admin.
    const [u] = await db
      .insert(user)
      .values({
        email: input.email,
        name: input.name,
        role: input.role,
        // Setup-Assistent (Betreiber) ohne, alle anderen haben gerade zugestimmt
        termsAcceptedAt: input.role === 'admin' ? null : new Date(),
      })
      .onConflictDoUpdate({
        target: user.email,
        set: input.role === 'admin' ? { role: 'admin' } : { termsAcceptedAt: new Date() },
      })
      .returning({ id: user.id });
    await auth.api.signInMagicLink({
      body: { email: input.email, callbackURL: `${env.PUBLIC_URL}${callbackPath}` },
      headers: c.req.raw.headers,
    });
    return u!;
  }

  // ---------- Betrieb ----------

  registerSeo(app, env.PUBLIC_URL);

  app.get('/health', async (c) => {
    // Test-Release für den Rollback: meldet sich absichtlich nie gesund.
    if (env.FK_SELFTEST_BROKEN === '1') {
      return c.json({ status: 'selftest-broken', version: env.FK_VERSION }, 503);
    }
    try {
      await db.execute(sql`select 1`);
      const m = await migrationState(db);
      const expected = await expectedMigrations();
      const ok = m.applied === expected;
      return c.json(
        {
          status: ok ? 'ok' : 'migrations-pending',
          version: env.FK_VERSION,
          migrations: { ...m, expected },
        },
        ok ? 200 : 503,
      );
    } catch {
      return c.json({ status: 'db-unavailable', version: env.FK_VERSION }, 503);
    }
  });

  // ---------- Einrichtungs-Assistent ----------

  app.get('/api/setup/status', async (c) => {
    const s = await settings();
    const pub = new URL(env.PUBLIC_URL);
    // Maßgeblich ist die Adresse, die der Browser sieht: Origin, sonst Host hinter dem Proxy.
    const origin = c.req.header('origin');
    const host = origin
      ? new URL(origin).host
      : (c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '');
    const proto = origin
      ? new URL(origin).protocol.replace(':', '')
      : (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', ''));
    return c.json({
      setupCompleted: s.setupCompleted,
      publicUrl: env.PUBLIC_URL,
      hostMatches: host === pub.host,
      https: proto === 'https',
      registrationMode: s.registrationMode,
      legal: s.legal,
      // Für die Willkommensseite: angemeldet → direkt in die App (ohne 401 in der Konsole)
      signedIn: !!c.get('user'),
    });
  });

  app.post('/api/setup/verify', async (c) => {
    if ((await settings()).setupCompleted)
      return fail(c, 410, 'Die Einrichtung ist abgeschlossen.');
    const b = await body(c, z.object({ code }));
    if (b instanceof Response) return b;
    return checkSetupCode(c, b.code) ?? c.body(null, 204);
  });

  app.post('/api/setup/admin', async (c) => {
    if ((await settings()).setupCompleted)
      return fail(c, 410, 'Die Einrichtung ist abgeschlossen.');
    const b = await body(c, z.object({ code, email, name }));
    if (b instanceof Response) return b;
    const denied = checkSetupCode(c, b.code);
    if (denied) return denied;
    await createUserAndSendLink(
      c,
      { email: b.email, name: b.name, role: 'admin' },
      '/setup?schritt=passkey',
    );
    return c.body(null, 204);
  });

  app.post('/api/setup/complete', async (c) => {
    if ((await settings()).setupCompleted)
      return fail(c, 410, 'Die Einrichtung ist abgeschlossen.');
    const b = await body(c, z.object({ code }));
    if (b instanceof Response) return b;
    const denied = checkSetupCode(c, b.code);
    if (denied) return denied;
    const u = c.get('user');
    if (!u || u.role !== 'admin')
      return fail(c, 401, 'Melde dich zuerst über den Link in der Mail an.');
    await db.update(appSettings).set({ setupCompleted: true }).where(eq(appSettings.id, 1));
    return c.body(null, 204);
  });

  // ---------- Registrierung ----------

  app.post('/api/register', async (c) => {
    const s = await settings();
    if (!s.setupCompleted || s.registrationMode !== 'open') {
      return fail(c, 403, 'Registrierung nur mit Einladung.');
    }
    const b = await body(
      c,
      z.object({ email, name, next: z.string().max(200).optional(), acceptTerms, ...botFields }),
    );
    if (b instanceof Response) return b;
    // Bots bekommen dieselbe Antwort wie Menschen, aber keine Mail und kein Konto
    if (looksLikeBot(b)) return c.body(null, 204);
    if (!limitRegister(ipOf(c))) return fail(c, 429, 'Zu viele Versuche. Warte eine Stunde.');
    if (!limitEmail(b.email.toLowerCase()))
      return fail(
        c,
        429,
        'Für diese Adresse gab es heute schon genug Links. Schau in dein Postfach.',
      );
    if (await surgeGuard(db, mail, env.PUBLIC_URL))
      return fail(c, 403, 'Registrierung gerade nur mit Einladung.');
    // Ziel nach dem Login: nur eigene, relative Pfade
    const next =
      b.next && b.next.startsWith('/') && !b.next.startsWith('//') && !b.next.includes('\\')
        ? b.next
        : '/';
    await createUserAndSendLink(c, { email: b.email, name: b.name, role: 'user' }, next);
    return c.body(null, 204);
  });

  app.post('/api/invites/accept', async (c) => {
    const b = await body(c, z.object({ token: z.string().min(20), email, name, acceptTerms }));
    if (b instanceof Response) return b;
    // Atomar einlösen, damit ein Link nur einmal funktioniert.
    const [inv] = await db
      .update(invite)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(invite.tokenHash, hashToken(b.token)),
          isNull(invite.usedAt),
          gt(invite.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!inv) return fail(c, 404, 'Die Einladung ist ungültig oder abgelaufen.');
    if (inv.email && inv.email !== b.email) {
      await db.update(invite).set({ usedAt: null }).where(eq(invite.id, inv.id));
      return fail(c, 403, 'Die Einladung gilt für eine andere E-Mail-Adresse.');
    }
    const u = await createUserAndSendLink(c, { email: b.email, name: b.name, role: 'user' }, '/');
    await db.update(invite).set({ usedBy: u.id }).where(eq(invite.id, inv.id));
    return c.body(null, 204);
  });

  app.post('/api/admin/invites', async (c) => {
    const u = c.get('user');
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    if (u.role !== 'admin') return fail(c, 403, 'Nur für Admins.');
    const b = await body(c, z.object({ email: email.optional() }));
    if (b instanceof Response) return b;
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);
    await db.insert(invite).values({
      tokenHash: hashToken(token),
      email: b.email ?? null,
      createdBy: u.id,
      expiresAt,
    });
    return c.json({ url: `${env.PUBLIC_URL}/einladung?token=${token}`, expiresAt }, 201);
  });

  registerAdmin(app, { db, env, fetchFn: updaterFetch });
  registerAuditRoutes(app, { db });
  registerUserAdmin(app, { db, auth, publicUrl: env.PUBLIC_URL });
  registerLegalRoutes(app, { db });
  registerNotifyRoutes(app, { db, notifier });
  registerEmailTemplateRoutes(app, { db, mailer: mail, publicUrl: env.PUBLIC_URL });
  registerDataRoutes(app, { db });
  registerSettingsRoutes(app, { db });
  registerTaskRoutes(app, { db });
  registerDayRoutes(app, { db });
  registerRedirectRoutes(app, { db });
  registerWeekRoutes(app, { db });
  registerApiKeyRoutes(app, { db });
  registerWebhookRoutes(app, { db, hooks, resolve: webhookResolve });

  // Nur Browser-Tests: Anmeldelinks aus dem Test-Postfach lesen (siehe e2e/)
  if (env.FK_E2E === '1' && env.NODE_ENV !== 'production') {
    app.get('/api/e2e/mails', (c) => c.json(e2eOutbox));
    // Beispieldaten für Screenshots: Guthaben direkt gutschreiben (nur mit Anmeldung)
    app.post('/api/e2e/credit', async (c) => {
      const u = c.get('user');
      if (!u) return c.json({ error: 'Nicht angemeldet.' }, 401);
      const b = (await c.req.json().catch(() => ({}))) as { minutes?: number };
      await withUser(db, u.id, (tx) =>
        tx.insert(creditEntry).values({ userId: u.id, minutes: b.minutes ?? 0, reason: 'focus' }),
      );
      return c.body(null, 204);
    });
  }
  push.register(app);

  // ---------- Eigenes Konto ----------

  app.get('/api/me', (c) => {
    const u = c.get('user');
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    return c.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role ?? 'user',
      createdAt: u.createdAt,
      version: env.FK_VERSION,
    });
  });

  app.delete('/api/me', async (c) => {
    const u = c.get('user');
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    if (u.role === 'admin') {
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'admin'));
      if (n <= 1)
        return fail(c, 409, 'Du bist der einzige Admin. Ernenne zuerst einen anderen Admin.');
    }
    // Sitzungen, Passkeys und Fachdaten hängen per ON DELETE CASCADE am Nutzer.
    await deleteUserData(db, u.id);
    return c.body(null, 204);
  });

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.notFound((c) => c.json({ error: 'Nicht gefunden.' }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Da ist etwas schiefgelaufen.' }, 500);
  });

  return app;
}
