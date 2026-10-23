// Export und Import der eigenen Daten (Profil → Daten).
// Export: versionierte FOKUS-Datei (JSON) mit allen Tabellen aus EXPORT_TABLES.
// Import: Zusammenführen überspringt vorhandene IDs, Ersetzen löscht vorher. Dateien anderer
// Personen bekommen neue, feste IDs (UUIDv5 aus Nutzer + alte ID), damit nichts kollidiert.
// Neue Fachtabellen (user_id) gehören in EXPORT_TABLES, und zwar nach den Tabellen, auf die sie zeigen.
// Eine Datei ist leicht zu bearbeiten: Ein Import bringt deshalb nie mehr Guthaben als vorher
// (Ausgleich als Korrektur „adjust“), und gelockerte Regeln gelten wie sonst erst ab morgen.
import { createHash } from 'node:crypto';
import { addDays, balanceOf, splitSettingsChange, todayIn, type PlanSettings } from '@fokus/core';
import {
  calendarFeed,
  creditEntry,
  focusSession,
  task,
  taskOccurrence,
  timeBlock,
  userSettings,
  withUser,
  type Db,
} from '@fokus/db';
import { getTableColumns, type Table } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';
import { loadCredit, loadSettings, resolvePlan, type PendingSettings } from './planning';

export const EXPORT_FORMAT = 'fokus';
export const SCHEMA_VERSION = 1;

export interface ExportTable {
  /** Schlüssel in der Datei */
  key: string;
  table: PgTable;
  /** Spalten (Namen im Schema), deren Werte IDs dieser Tabelle sind */
  ids?: string[];
  /** Spalten, die auf IDs anderer Tabellen zeigen */
  refs?: string[];
}

/** Reihenfolge = Einfügereihenfolge (Verweise zeigen auf frühere Tabellen). */
export const EXPORT_TABLES: ExportTable[] = [
  { key: 'settings', table: userSettings },
  { key: 'tasks', table: task, ids: ['id'] },
  { key: 'feeds', table: calendarFeed, ids: ['id'] },
  { key: 'occurrences', table: taskOccurrence, refs: ['taskId'] },
  { key: 'blocks', table: timeBlock, ids: ['id'], refs: ['taskId', 'feedId'] },
  { key: 'sessions', table: focusSession, ids: ['id'], refs: ['blockId', 'taskId'] },
  { key: 'credit', table: creditEntry, ids: ['id'], refs: ['sessionId', 'blockId'] },
];

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  exportedBy: string;
  data: Record<string, Record<string, unknown>[]>;
}

/** UUIDv5 (RFC 4122) aus Namensraum-UUID und Name: gleiche Eingabe, gleiche ID. */
export function uuidv5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(ns).update(name).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** JSON-Zeile zurück in Schreibweise der Tabelle (Zeitstempel als Date, user_id gesetzt). */
function revive(
  t: ExportTable,
  row: Record<string, unknown>,
  userId: string,
  foreign: boolean,
): Record<string, unknown> {
  const cols = getTableColumns(t.table as Table);
  const out: Record<string, unknown> = {};
  for (const [name, col] of Object.entries(cols)) {
    let v = row[name];
    if (v === undefined) continue;
    if (v !== null && col.dataType === 'date' && typeof v === 'string') v = new Date(v);
    if (foreign && typeof v === 'string' && (t.ids?.includes(name) || t.refs?.includes(name)))
      v = uuidv5(userId, v);
    out[name] = v;
  }
  if ('userId' in cols) out.userId = userId;
  return out;
}

function parseFile(text: string): ExportFile {
  let j: unknown;
  try {
    j = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('Diese Datei kennt FOKUS nicht.');
  }
  const f = j as Partial<ExportFile> | null;
  if (!f || f.format !== EXPORT_FORMAT || typeof f.data !== 'object' || !f.data)
    throw new Error('Diese Datei kennt FOKUS nicht.');
  if ((f.schemaVersion ?? 0) > SCHEMA_VERSION)
    throw new Error('Die Datei stammt aus einer neueren FOKUS-Version. Bitte erst aktualisieren.');
  return f as ExportFile;
}

const countsOf = (f: ExportFile) =>
  Object.fromEntries(EXPORT_TABLES.map((t) => [t.key, f.data[t.key]?.length ?? 0]));

export function registerDataRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const fail = (c: Context, status: 400 | 401 | 413, error: string) => c.json({ error }, status);
  const userOf = (c: Context) => c.get('user') as SessionUser | null;

  app.get('/api/me/export', async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const file: ExportFile = await withUser(db, u.id, async (tx) => {
      const data: ExportFile['data'] = {};
      for (const t of EXPORT_TABLES)
        data[t.key] = (await tx.select().from(t.table as never)) as Record<string, unknown>[];
      return {
        format: EXPORT_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        exportedBy: u.id,
        data,
      };
    });
    c.header('content-disposition', `attachment; filename="fokus-export-${todayIn()}.json"`);
    return c.json(file);
  });

  const limit = bodyLimit({
    maxSize: 10 * 1024 * 1024,
    onError: (c) => c.json({ error: 'Die Datei ist größer als 10 MB.' }, 413),
  });

  app.post('/api/import/preview', limit, async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const b = z.object({ text: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Die Datei ist leer.');
    try {
      return c.json({ counts: countsOf(parseFile(b.data.text)) });
    } catch (e) {
      return fail(c, 400, (e as Error).message);
    }
  });

  app.post('/api/import', limit, async (c) => {
    const u = userOf(c);
    if (!u) return fail(c, 401, 'Nicht angemeldet.');
    const b = z
      .object({ text: z.string().min(1), mode: z.enum(['merge', 'replace']) })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return fail(c, 400, 'Ungültige Anfrage.');
    let file: ExportFile;
    try {
      file = parseFile(b.data.text);
    } catch (e) {
      return fail(c, 400, (e as Error).message);
    }
    const foreign = file.exportedBy !== u.id;
    await withUser(db, u.id, async (tx) => {
      const balanceBefore = balanceOf(await loadCredit(tx));
      const settingsBefore = await loadSettings(tx);
      const [rowBefore] = await tx.select({ p: userSettings.plan }).from(userSettings);
      if (b.data.mode === 'replace')
        for (const t of [...EXPORT_TABLES].reverse()) await tx.delete(t.table as never);
      for (const t of EXPORT_TABLES) {
        const rows = (file.data[t.key] ?? []).map((r) => revive(t, r, u.id, foreign));
        if (rows.length)
          await tx
            .insert(t.table as never)
            .values(rows as never)
            .onConflictDoNothing();
      }
      // Kein Guthaben aus der Datei
      const gained = balanceOf(await loadCredit(tx)) - Math.max(0, balanceBefore);
      if (gained > 0)
        await tx.insert(creditEntry).values({ userId: u.id, minutes: -gained, reason: 'adjust' });
      // Regeln aus der Datei: Lockerungen erst ab morgen, wie beim Ändern
      type Stored = Partial<PlanSettings> & { pending?: PendingSettings };
      const [row] = await tx.select({ p: userSettings.plan }).from(userSettings);
      const before = resolvePlan(rowBefore?.p as Stored | null);
      const { own } = resolvePlan(row?.p as Stored | null);
      const { later } = splitSettingsChange(settingsBefore, own);
      if (row && Object.keys(later).length) {
        const values = { ...(before.pending?.values ?? {}), ...later };
        const kept = Object.fromEntries(
          Object.keys(later).map((k) => [k, settingsBefore[k as keyof PlanSettings]]),
        );
        const plan = {
          ...own,
          ...kept,
          pending: { from: addDays(todayIn(), 1), values },
        };
        await tx.update(userSettings).set({ plan });
      }
    });
    return c.json({ counts: countsOf(file) });
  });
}
