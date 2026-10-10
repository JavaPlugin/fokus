// Läuft vor allen Browser-Tests: Admin anmelden, Beispieldaten, Sitzung in .auth.json.
// Specs mit test.use({ storageState }) brauchen die Datei schon beim Anlegen des Kontexts.
import { test as setup } from '@playwright/test';
import { ensureLogin } from './setup';

setup('anmelden', async ({ browser }) => {
  await ensureLogin(browser);
});
