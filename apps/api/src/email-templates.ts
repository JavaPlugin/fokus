// Admin-Panel → E-Mail-Vorlagen: Texte bearbeiten, Vorschau (Hell/Dunkel), Testmail, zurücksetzen.
// Gespeichert in email_template (aktueller Stand) und email_template_version (letzte 10).
import { emailTemplate, emailTemplateVersion, type Db } from '@fokus/db';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';
import type { Mailer } from './mail';
import { forceDark, sampleMail } from './mail-templates';
import {
  FIELDS,
  isTemplateKey,
  setOverride,
  setOverrides,
  TEMPLATES,
  textsFor,
  unknownPlaceholders,
  type TemplateKey,
  type Texts,
} from './mail-texts';

const KEEP_VERSIONS = 10;

const fieldsInput = z.object({
  betreff: z.string().trim().min(1, 'Betreff fehlt.').max(200),
  ueberschrift: z.string().trim().min(1, 'Überschrift fehlt.').max(200),
  hinweis: z.string().trim().max(600),
  button: z.string().trim().min(1, 'Button-Text fehlt.').max(60),
  fusszeile: z.string().trim().max(400),
});

/** Gespeicherte Texte in den Speicher laden (beim Start). */
export async function loadEmailTemplates(db: Db) {
  const rows = await db.select().from(emailTemplate);
  setOverrides(
    Object.fromEntries(
      rows.filter((r) => isTemplateKey(r.key)).map((r) => [r.key, r.fields as Partial<Texts>]),
    ),
  );
}

export function registerEmailTemplateRoutes(
  app: Hono<Vars>,
  { db, mailer, publicUrl }: { db: Db; mailer: Mailer; publicUrl: string },
) {
  const fail = (c: Context, status: 400 | 401 | 403 | 404, error: string, extra?: object) =>
    c.json({ error, ...extra }, status);

  /** Nur Admins; liefert Nutzer und Vorlage oder eine Fehlerantwort. */
  function guard(c: Context): { u: SessionUser; key: TemplateKey | null } | Response {
    const u = c.get('user') as SessionUser | null;
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    if (u.role !== 'admin') return fail(c, 403, 'Nur für Admins.');
    const k = c.req.param('key');
    if (k === undefined) return { u, key: null };
    if (!isTemplateKey(k)) return fail(c, 404, 'Diese Vorlage gibt es nicht.');
    return { u, key: k };
  }

  /** Texte aus dem Body prüfen: Pflichtfelder und nur erlaubte Platzhalter. */
  async function body(c: Context, key: TemplateKey) {
    const raw = (await c.req.json().catch(() => null)) as { fields?: unknown; dark?: unknown };
    const p = fieldsInput.safeParse(raw?.fields);
    if (!p.success) return fail(c, 400, p.error.issues[0]?.message ?? 'Ungültige Texte.');
    const bad = unknownPlaceholders(key, p.data);
    if (Object.keys(bad).length)
      return fail(c, 400, 'Unbekannter Platzhalter.', { placeholders: bad });
    return { fields: p.data as Texts, dark: raw?.dark === true };
  }

  app.get('/api/admin/email-templates', async (c) => {
    const g = guard(c);
    if (g instanceof Response) return g;
    const rows = await db.select().from(emailTemplate);
    return c.json({
      fields: FIELDS,
      templates: (Object.keys(TEMPLATES) as TemplateKey[]).map((key) => {
        const row = rows.find((r) => r.key === key);
        return {
          key,
          label: TEMPLATES[key].label,
          placeholders: TEMPLATES[key].placeholders,
          defaults: TEMPLATES[key].defaults,
          fields: textsFor(key),
          custom: !!row,
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    });
  });

  // Vorschau mit ungesicherten Texten; als HTML für <iframe srcdoc> (kein Laden aus der API nötig)
  app.post('/api/admin/email-templates/:key/preview', async (c) => {
    const g = guard(c);
    if (g instanceof Response) return g;
    const b = await body(c, g.key!);
    if (b instanceof Response) return b;
    const m = sampleMail(g.key!, g.u.email, publicUrl, b.fields);
    return c.json({ subject: m.subject, html: b.dark ? forceDark(m.html!) : m.html });
  });

  app.put('/api/admin/email-templates/:key', async (c) => {
    const g = guard(c);
    if (g instanceof Response) return g;
    const key = g.key!;
    const b = await body(c, key);
    if (b instanceof Response) return b;
    await db.transaction(async (tx) => {
      await tx
        .insert(emailTemplate)
        .values({ key, fields: b.fields, updatedBy: g.u.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: emailTemplate.key,
          set: { fields: b.fields, updatedBy: g.u.id, updatedAt: new Date() },
        });
      await tx.insert(emailTemplateVersion).values({ key, fields: b.fields, updatedBy: g.u.id });
      const keep = await tx
        .select({ id: emailTemplateVersion.id })
        .from(emailTemplateVersion)
        .where(eq(emailTemplateVersion.key, key))
        .orderBy(desc(emailTemplateVersion.createdAt), desc(emailTemplateVersion.id))
        .limit(KEEP_VERSIONS);
      await tx.delete(emailTemplateVersion).where(
        and(
          eq(emailTemplateVersion.key, key),
          notInArray(
            emailTemplateVersion.id,
            keep.map((k) => k.id),
          ),
        ),
      );
    });
    setOverride(key, b.fields);
    return c.json({ fields: textsFor(key), custom: true });
  });

  app.delete('/api/admin/email-templates/:key', async (c) => {
    const g = guard(c);
    if (g instanceof Response) return g;
    await db.delete(emailTemplate).where(eq(emailTemplate.key, g.key!));
    setOverride(g.key!, null);
    return c.json({ fields: textsFor(g.key!), custom: false });
  });

  // Testmail an die eigene Adresse, mit den aktuellen (auch ungesicherten) Texten
  app.post('/api/admin/email-templates/:key/test', async (c) => {
    const g = guard(c);
    if (g instanceof Response) return g;
    const b = await body(c, g.key!);
    if (b instanceof Response) return b;
    await mailer.send(sampleMail(g.key!, g.u.email, publicUrl, b.fields));
    return c.body(null, 204);
  });
}
