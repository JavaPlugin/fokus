// Jede Seite hat einen Titel „Seite · FOKUS“; die ⌘K-Palette schließt mit Browser-Zurück.
import { expect, test } from '@playwright/test';
import { STATE } from './setup';

test.use({ storageState: STATE });

test('Titel je Seite, auch beim Wischen zwischen Tabs', async ({ page }) => {
  for (const [path, title] of [
    ['/', 'Heute'],
    ['/woche', 'Woche'],
    ['/inbox', 'Inbox'],
    ['/fokus', 'Fokus'],
    ['/profil', 'Profil'],
    ['/admin', 'System'],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} · FOKUS`);
  }
  await page.goto('/');
  await page.getByRole('tab', { name: 'Fokus' }).click();
  await expect(page).toHaveTitle('Fokus · FOKUS');
});

test('⌘K-Palette: Browser-Zurück schließt sie, die Seite bleibt', async ({ page }) => {
  await page.goto('/woche');
  await expect(page.getByRole('tab', { name: 'Woche' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const box = page.getByRole('textbox', { name: 'Befehl' });
  await expect(box).toBeVisible();
  await page.goBack();
  await expect(box).toBeHidden();
  await expect(page).toHaveURL(/\/woche$/);
  // Befehl ausführen schließt die Palette und navigiert
  await page.keyboard.press('Control+k');
  await box.fill('inbox');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(box).toBeHidden();
});
