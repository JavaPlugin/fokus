import { afterAll, describe, expect, it } from 'vitest';
import { appSettings, createDb, expectedMigrations, migrationState } from './index';

describe('createDb (PGlite)', async () => {
  const h = await createDb('pglite:memory');
  afterAll(() => h.close());

  it('migriert ein leeres Schema vollständig', async () => {
    await h.migrate();
    const state = await migrationState(h.db);
    expect(state.applied).toBe(await expectedMigrations());
  });

  it('erlaubt nur eine Einstellungs-Zeile', async () => {
    await h.db.insert(appSettings).values({ id: 1 });
    await expect(h.db.insert(appSettings).values({ id: 2 })).rejects.toThrow();
    const [row] = await h.db.select().from(appSettings);
    expect(row).toMatchObject({ setupCompleted: false, registrationMode: 'invite' });
  });

  it('ist idempotent', async () => {
    await h.migrate();
    expect((await migrationState(h.db)).applied).toBe(await expectedMigrations());
  });
});
