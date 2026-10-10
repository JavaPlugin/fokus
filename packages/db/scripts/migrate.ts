// Wendet alle Migrationen auf DATABASE_URL an. Für CI und manuelle Wartung.
import { createDb, expectedMigrations, migrationState } from '../src';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL fehlt');

const h = await createDb(url);
await h.migrate();
const s = await migrationState(h.db);
console.info(`Migrationen: ${s.applied}/${await expectedMigrations()}`);
await h.close();
