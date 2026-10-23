// Umleiten: Wer eine Social-App öffnet, kommt nur mit einer Freigabe durch. Freigaben entstehen
// allein durch ausgegebenes Guthaben (Social-Slot starten, „vom Guthaben nehmen“, Ausnahme), nie
// durch einen bloß geplanten Social-Slot. Während eines Fokus-Blocks gibt es keine Freigabe.
//
// Ablauf auf dem iPhone (die PWA sieht nicht, welche App geöffnet wird): Eine Kurzbefehle-
// Automation fragt beim Öffnen der App GET /api/v1/gate/<schlüssel>?app=instagram. Antwort leer =
// „frei“, sonst eine Adresse, die der Kurzbefehl öffnet (/umleiten). Öffnet FOKUS danach Instagram,
// fragt die Automation erneut und bekommt „frei“: keine Schleife mehr.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  MIN_MS,
  OVERRIDES_PER_DAY,
  OVERRIDE_MINUTES,
  OVERRIDE_WAIT_S,
  activePass,
  creditSummary,
  dayInZone,
  gateState,
  pickRedirectTask,
  spend,
  todayIn,
  type CreditEntry,
  type Day,
} from '@fokus/core';
import { apiKey, creditEntry, focusSession, task, withUser, type Db } from '@fokus/db';
import { and, arrayContains, eq, isNull } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import { buildAgenda } from './agenda';
import { bearerOf, newKey, tokenAuth } from './api-keys';
import { authed, loadCredit, loadSettings, parseBody, uuid } from './planning';

export const REDIRECT_APPS: Record<string, { label: string; url: string }> = {
  instagram: { label: 'Instagram', url: 'instagram://' },
  tiktok: { label: 'TikTok', url: 'tiktok://' },
  youtube: { label: 'YouTube', url: 'youtube://' },
  x: { label: 'X', url: 'twitter://' },
  facebook: { label: 'Facebook', url: 'fb://' },
  reddit: { label: 'Reddit', url: 'reddit://' },
  snapchat: { label: 'Snapchat', url: 'snapchat://' },
};

/** Kleine Aufgaben aus dem Plan, die Umleiten vorschlägt (Minuten). */
export const REDIRECT_TASK_MAX = 2;
/** So lange gilt ein Ticket (Aufgabe machen, Ausnahme). */
const TICKET_MAX_MS = 15 * MIN_MS;

const FALLBACKS = [
  'Ein Glas Wasser trinken',
  'Fenster öffnen und dreimal tief atmen',
  'Schultern kreisen und strecken',
  'Den Schreibtisch kurz aufräumen',
  'Eine Nachricht beantworten, die schon wartet',
];

const appKey = (raw: string | undefined) => {
  const k = (raw ?? '').toLowerCase();
  return k in REDIRECT_APPS ? k : '';
};

type Deps = { db: Db; publicUrl: string; secret: string };

export function registerRedirectRoutes(app: Hono<Vars>, { db, publicUrl, secret }: Deps) {
  // ---------- Ticket: beweist, seit wann die Umleiten-Seite offen ist ----------
  const sign = (userId: string, ts: number) =>
    createHmac('sha256', secret).update(`redirect:${userId}:${ts}`).digest('base64url');
  const ticketFor = (userId: string, ts = Date.now()) => `${ts}.${sign(userId, ts)}`;
  /** Alter des Tickets in ms, oder null wenn ungültig/abgelaufen. */
  function ticketAge(userId: string, ticket: string | undefined, now: number): number | null {
    const m = /^(\d{10,15})\.([A-Za-z0-9_-]{20,})$/.exec(ticket ?? '');
    if (!m) return null;
    const ts = Number(m[1]);
    const want = Buffer.from(sign(userId, ts));
    const got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const age = now - ts;
    return age >= 0 && age <= TICKET_MAX_MS ? age : null;
  }

  /** Angemeldet (Sitzung) oder mit Umleiten-Schlüssel (Kurzbefehl öffnet Safari ohne Sitzung). */
  async function who(c: Context<Vars>): Promise<string | Response> {
    const u = c.get('user');
    if (u) return u.id;
    const k = await tokenAuth(db, c, bearerOf(c), 'gate');
    return k instanceof Response ? k : k.userId;
  }

  /** Alles, was Umleiten über den Moment wissen muss. */
  async function snapshot(tx: Db, now: number) {
    const day: Day = todayIn();
    const settings = await loadSettings(tx);
    const entries = await loadCredit(tx);
    const [running] = await tx
      .select()
      .from(focusSession)
      .where(eq(focusSession.status, 'running'));
    const state = gateState(entries, now, !!running);
    return { day, settings, entries, running, state };
  }

  const overridesOn = (entries: CreditEntry[], day: Day) =>
    entries.filter((e) => e.reason === 'override' && e.minutes < 0 && dayInZone(e.at) === day)
      .length;

  const passOut = (entries: CreditEntry[], now: number) => {
    const p = activePass(entries, now);
    return p ? new Date(p.end).toISOString() : null;
  };

  // ---------- Kurzbefehl: darf die App auf? ----------

  /**
   * Antwort als Text für die Kurzbefehle-Automation: „frei“ = nichts tun, sonst die Adresse der
   * Umleiten-Seite (enthält „umleiten“), die der Kurzbefehl öffnet. Auch ein falscher Schlüssel
   * liefert eine Adresse (mit Hinweis), damit die Einrichtung nicht still scheitert.
   */
  app.get('/api/v1/gate/:key', async (c) => {
    const key = c.req.param('key');
    const a = appKey(c.req.query('app'));
    const q = a ? `app=${a}&` : '';
    const text = (body: string) =>
      c.text(body, 200, { 'content-type': 'text/plain; charset=utf-8' });
    const auth = await tokenAuth(db, c, key, 'gate');
    if (auth instanceof Response) return text(`${publicUrl}/umleiten?${q}fehler=adresse`);
    const now = Date.now();
    const { state } = await withUser(db, auth.userId, (tx) => snapshot(tx, now));
    if (state === 'free') return text('frei');
    return text(`${publicUrl}/umleiten?${q}k=${encodeURIComponent(key)}`);
  });

  // ---------- Umleiten-Seite ----------

  app.get('/api/v1/redirect', async (c) => {
    const userId = await who(c);
    if (userId instanceof Response) return userId;
    const a = appKey(c.req.query('app'));
    const info = a ? REDIRECT_APPS[a] : undefined;
    const now = Date.now();
    const out = await withUser(db, userId, async (tx) => {
      const { day, settings, entries, running, state } = await snapshot(tx, now);
      // Nächster geplanter Social-Slot heute (nur Hinweis: frei wird erst mit Start)
      const agenda = await buildAgenda(tx, day, day, now);
      const start = (i: { start: string }) => new Date(i.start).getTime();
      const next = (agenda.days[day]?.items ?? [])
        .filter((i) => i.kind === 'social' && !i.done && start(i) + i.minutes * MIN_MS > now)
        .sort((x, y) => start(x) - start(y))[0];
      const open = await tx.select().from(task).where(eq(task.status, 'open'));
      const pick = pickRedirectTask(
        open
          .filter((t) => t.kind === 'work' && !t.recurrence && t.schedule !== 'fixed')
          .map((t) => ({ id: t.id, title: t.title, minutes: t.minutes, due: t.due })),
        REDIRECT_TASK_MAX,
      );
      let focus = null;
      if (running) {
        const [t] = running.taskId
          ? await tx.select().from(task).where(eq(task.id, running.taskId))
          : [];
        focus = {
          title: t?.title ?? 'Fokus',
          endsAt: new Date(
            running.startedAt.getTime() + running.plannedMinutes * MIN_MS,
          ).toISOString(),
        };
      }
      const used = overridesOn(entries, day);
      return {
        app: a,
        label: info?.label ?? 'Social Media',
        url: info?.url ?? null,
        state,
        passUntil: passOut(entries, now),
        focus,
        nextSocial: next?.start ?? null,
        task: pick ? { id: pick.id, title: pick.title, minutes: pick.minutes } : null,
        fallback: FALLBACKS[Math.floor(now / MIN_MS) % FALLBACKS.length],
        spend: settings.redirectSpend,
        canSpend: spend(entries, settings.redirectSpend, day, settings.dailyLimit).granted,
        credit: creditSummary(entries, day, settings),
        override: {
          left: Math.max(0, OVERRIDES_PER_DAY - used),
          cost: OVERRIDE_MINUTES,
          waitSeconds: OVERRIDE_WAIT_S,
        },
        ticket: ticketFor(userId, now),
      };
    });
    return c.json(out);
  });

  /** „X Min. vom Guthaben nehmen“: gibt genau so viele Minuten frei. */
  app.post('/api/v1/redirect/spend', async (c) => {
    const userId = await who(c);
    if (userId instanceof Response) return userId;
    const now = Date.now();
    const res = await withUser(db, userId, async (tx) => {
      const { day, settings, entries, running } = await snapshot(tx, now);
      if (running) return { error: 'Erst den Fokus-Block beenden.', status: 409 as const };
      const r = spend(entries, settings.redirectSpend, day, settings.dailyLimit);
      if (r.granted > 0) {
        const at = new Date(now);
        await tx
          .insert(creditEntry)
          .values({ userId, at, minutes: -r.granted, reason: 'redirect' });
        entries.push({ at: at.toISOString(), minutes: -r.granted, reason: 'redirect' });
      }
      return {
        ...r,
        passUntil: passOut(entries, now),
        credit: creditSummary(entries, day, settings),
      };
    });
    if ('error' in res) return c.json({ error: res.error }, res.status);
    return c.json(res);
  });

  /**
   * Ausnahme („Trotzdem öffnen“): erst nach kurzer Wartezeit, höchstens 3-mal am Tag, kostet
   * Guthaben auch ins Minus. Die Schulden zahlt der nächste Fokus-Block zurück.
   */
  app.post('/api/v1/redirect/override', async (c) => {
    const userId = await who(c);
    if (userId instanceof Response) return userId;
    const b = await parseBody(c, z.object({ ticket: z.string().max(200) }));
    if (b instanceof Response) return b;
    const now = Date.now();
    const age = ticketAge(userId, b.ticket, now);
    if (age === null) return c.json({ error: 'Seite neu laden und noch einmal.' }, 400);
    if (age < OVERRIDE_WAIT_S * 1000)
      return c.json({ error: `Noch ${Math.ceil(OVERRIDE_WAIT_S - age / 1000)} s warten.` }, 400);
    const res = await withUser(db, userId, async (tx) => {
      const { day, settings, entries, running } = await snapshot(tx, now);
      if (running) return { error: 'Erst den Fokus-Block beenden.', status: 409 as const };
      if (overridesOn(entries, day) >= OVERRIDES_PER_DAY)
        return { error: 'Heute keine Ausnahmen mehr.', status: 429 as const };
      const at = new Date(now);
      await tx
        .insert(creditEntry)
        .values({ userId, at, minutes: -OVERRIDE_MINUTES, reason: 'override' });
      entries.push({ at: at.toISOString(), minutes: -OVERRIDE_MINUTES, reason: 'override' });
      return {
        passUntil: passOut(entries, now),
        credit: creditSummary(entries, day, settings),
        overridesLeft: Math.max(0, OVERRIDES_PER_DAY - overridesOn(entries, day)),
      };
    });
    if ('error' in res) return c.json({ error: res.error }, res.status);
    return c.json(res);
  });

  /** Kleine Aufgabe erledigt: nur eine echte aus dem Plan und erst nach ihrer Dauer. */
  app.post('/api/v1/redirect/done', async (c) => {
    const userId = await who(c);
    if (userId instanceof Response) return userId;
    const b = await parseBody(c, z.object({ taskId: uuid, ticket: z.string().max(200) }));
    if (b instanceof Response) return b;
    const now = Date.now();
    const age = ticketAge(userId, b.ticket, now);
    if (age === null) return c.json({ error: 'Seite neu laden und noch einmal.' }, 400);
    const res = await withUser(db, userId, async (tx) => {
      const [t] = await tx.select().from(task).where(eq(task.id, b.taskId));
      if (
        !t ||
        t.status !== 'open' ||
        t.kind !== 'work' ||
        t.recurrence ||
        t.schedule === 'fixed' ||
        t.minutes > REDIRECT_TASK_MAX
      )
        return { error: 'Diese Aufgabe passt hier nicht.', status: 400 as const };
      // Kleine Toleranz für Uhren und Netz
      if (age < t.minutes * MIN_MS - 5000)
        return { error: `Die Aufgabe dauert ${t.minutes} Min.`, status: 400 as const };
      await tx
        .update(task)
        .set({ status: 'done', doneAt: new Date(now) })
        .where(eq(task.id, t.id));
      return { ok: true };
    });
    if ('error' in res) return c.json({ error: res.error }, res.status);
    return c.json(res);
  });

  // ---------- Schlüssel für den Kurzbefehl (angemeldet) ----------

  const gateUrl = (key: string) => `${publicUrl}/api/v1/gate/${key}`;

  app.get('/api/me/gate-key', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const [row] = await withUser(db, u.id, (tx) =>
      tx
        .select({ prefix: apiKey.prefix, lastUsedAt: apiKey.lastUsedAt })
        .from(apiKey)
        .where(and(arrayContains(apiKey.scopes, ['gate']), isNull(apiKey.revokedAt))),
    );
    return c.json({
      active: !!row,
      prefix: row?.prefix ?? null,
      lastUsedAt: row?.lastUsedAt?.toISOString() ?? null,
    });
  });

  /** Neuer Schlüssel für Umleiten. Der alte gilt danach nicht mehr. */
  app.post('/api/me/gate-key', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const k = newKey();
    await withUser(db, u.id, async (tx) => {
      await tx
        .update(apiKey)
        .set({ revokedAt: new Date() })
        .where(and(arrayContains(apiKey.scopes, ['gate']), isNull(apiKey.revokedAt)));
      await tx.insert(apiKey).values({
        userId: u.id,
        name: 'Umleiten (Kurzbefehl)',
        prefix: k.prefix,
        hash: k.hash,
        scopes: ['gate'],
      });
    });
    return c.json({ key: k.key, gateUrl: gateUrl(k.key) }, 201);
  });
}
