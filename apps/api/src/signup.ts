// Offene Registrierung für einen öffentlichen Dienst: Grenzen gegen Missbrauch.
// - pro IP 5 je Stunde (app.ts), pro E-Mail 3 je Tag
// - Honeypot-Feld und Mindest-Ausfüllzeit gegen einfache Bots (still: Antwort wie bei Erfolg)
// - mehr als 50 Registrierungen in einer Stunde: automatisch „Nur Einladung“ und Hinweis an Admins
// - unbestätigte Konten (Link nie geklickt) löscht der tägliche Job nach 24 Stunden
import { appSettings, user, type Db } from '@fokus/db';
import { and, count, eq, gt, lt, ne } from 'drizzle-orm';
import { audit } from './audit';
import type { Mailer } from './mail';

export const SURGE_PER_HOUR = 50;
export const MIN_FILL_MS = 2500;
const UNVERIFIED_MS = 24 * 3600_000;

/** Einfache Bremse: höchstens `max` Versuche je Fenster und Schlüssel (im Speicher). */
export function attemptLimiter(max = 10, windowMs = 15 * 60_000) {
  const hits = new Map<string, { n: number; until: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.until < now) {
      hits.set(key, { n: 1, until: now + windowMs });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}

/** Sieht nach Bot aus: Honeypot gefüllt oder Formular schneller als ein Mensch abgeschickt. */
export function looksLikeBot(b: { website?: string; startedAt?: number }, now = Date.now()) {
  if (b.website && b.website.trim()) return true;
  return typeof b.startedAt === 'number' && now - b.startedAt < MIN_FILL_MS;
}

/**
 * Massen-Anmeldung? Mehr als SURGE_PER_HOUR neue Konten in der letzten Stunde: Registrierung auf
 * „Nur Einladung“ stellen und die Admins einmal per E-Mail informieren. Liefert true, wenn zu.
 */
export async function surgeGuard(db: Db, mailer: Mailer, publicUrl: string, now = new Date()) {
  const [r] = await db
    .select({ n: count() })
    .from(user)
    .where(and(gt(user.createdAt, new Date(now.getTime() - 3600_000)), ne(user.role, 'admin')));
  if ((r?.n ?? 0) < SURGE_PER_HOUR) return false;
  const changed = await db
    .update(appSettings)
    .set({ registrationMode: 'invite' })
    .where(and(eq(appSettings.id, 1), eq(appSettings.registrationMode, 'open')))
    .returning({ id: appSettings.id });
  if (changed.length) {
    await audit(db, null, 'Registrierung automatisch auf „Nur Einladung“', null, {
      perHour: r?.n ?? 0,
    });
    const admins = await db.select({ email: user.email }).from(user).where(eq(user.role, 'admin'));
    for (const a of admins)
      await mailer
        .send({
          to: a.email,
          subject: 'FOKUS: Registrierung automatisch geschlossen',
          text: `In der letzten Stunde gab es mehr als ${SURGE_PER_HOUR} Registrierungen. Neue Konten gehen jetzt nur noch mit Einladung. Wieder öffnen: ${publicUrl}/admin`,
        })
        .catch(() => undefined);
  }
  return true;
}

/** Konten, deren Anmeldelink nie geklickt wurde, nach 24 Stunden löschen (nie Admins). */
export async function purgeUnverified(db: Db, now = new Date()) {
  const gone = await db
    .delete(user)
    .where(
      and(
        eq(user.emailVerified, false),
        lt(user.createdAt, new Date(now.getTime() - UNVERIFIED_MS)),
        ne(user.role, 'admin'),
      ),
    )
    .returning({ id: user.id });
  return gone.length;
}
