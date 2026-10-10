import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Db;
  /** Wendet alle ausstehenden Migrationen an (nur vorwärts). */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** Ordner mit den von drizzle-kit erzeugten SQL-Migrationen. Im Image per MIGRATIONS_DIR gesetzt. */
export const defaultMigrationsDir = (): string =>
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url));

// Fester Schlüssel für pg_advisory_lock, damit nie zwei Prozesse gleichzeitig migrieren.
const MIGRATION_LOCK = 4242017;

/**
 * Verbindet mit Postgres.
 * - "postgres://…": echtes Postgres (Produktion, CI)
 * - "pglite:memory" bzw. "pglite:./pfad": eingebettetes Postgres für Entwicklung und Tests
 */
export async function createDb(
  url: string,
  migrationsDir = defaultMigrationsDir(),
): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const target = url.slice('pglite:'.length);
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    const pdb = drizzle(client, { schema });
    return {
      db: pdb as unknown as Db,
      migrate: () => migrate(pdb, { migrationsFolder: migrationsDir }),
      close: () => client.close(),
    };
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return {
    db: drizzle(client, { schema }) as unknown as Db,
    async migrate() {
      // Eigene Verbindung, damit Lock und Migration in derselben Session laufen.
      const one = postgres(url, { max: 1, onnotice: () => {} });
      try {
        const mdb = drizzle(one, { schema });
        await mdb.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK})`);
        await migrate(mdb, { migrationsFolder: migrationsDir });
        await mdb.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK})`);
      } finally {
        await one.end();
      }
    },
    close: () => client.end(),
  };
}

/** Anzahl angewendeter Migrationen und Zeitstempel der letzten, für /health. */
export async function migrationState(db: Db): Promise<{ applied: number; latest: number | null }> {
  try {
    const res = await db.execute(
      sql`select created_at from drizzle.__drizzle_migrations order by created_at desc`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as {
      created_at: string | number;
    }[];
    return { applied: rows.length, latest: rows[0] ? Number(rows[0].created_at) : null };
  } catch {
    return { applied: 0, latest: null };
  }
}

/** Anzahl der Migrationen im Ordner (aus dem drizzle-Journal). */
export async function expectedMigrations(migrationsDir = defaultMigrationsDir()): Promise<number> {
  const { readFile } = await import('node:fs/promises');
  const journal = JSON.parse(await readFile(`${migrationsDir}/meta/_journal.json`, 'utf8')) as {
    entries: unknown[];
  };
  return journal.entries.length;
}

/**
 * API-Schlüssel nachschlagen (Nutzer noch unbekannt): darf api_key per Hash lesen und
 * last_used_at setzen, sonst nichts (Policies in 0001).
 */
export async function withKeyLookup<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role fokus_app`);
    await tx.execute(sql`select set_config('app.key_lookup', '1', true)`);
    return fn(tx as unknown as Db);
  });
}

/**
 * Admin-Kontext (nur serverseitig): App-Rolle wie withUser, aber mit app.admin = '1'. Eigene
 * Policies (Migration 0001) erlauben damit nutzerübergreifende Jobs (Webhook-Zustellung,
 * Zählwerte). Nie mit Nutzereingaben aufrufen.
 */
export async function withAdmin<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role fokus_app`);
    await tx.execute(sql`select set_config('app.admin', '1', true)`);
    return fn(tx as unknown as Db);
  });
}

/**
 * Einziger Weg der API zu Fachdaten: eine Transaktion als Rolle fokus_app mit gesetzter
 * app.user_id. Row Level Security lässt dann nur Zeilen dieses Nutzers durch, auch wenn
 * eine Abfrage den Filter vergisst.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role fokus_app`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx as unknown as Db);
  });
}
