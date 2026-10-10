// Umleiten und Social-Slots.
import { expect, test } from '@playwright/test';
import { STATE } from './setup';

test.use({ storageState: STATE });

test('Umleiten: Aufgabe machen bringt Guthaben, Guthaben nehmen zieht ab', async ({
  page,
  request,
}) => {
  await request.post('/api/tasks', { data: { title: 'Lena antworten', mini: true } });
  await page.goto('/umleiten?app=instagram');
  await expect(page.getByText('Kurz was Kleines zuerst?')).toBeVisible();
  await expect(page.getByText('Lena antworten')).toBeVisible();
  await page.getByRole('button', { name: 'Aufgabe machen' }).click();
  await expect(page.getByText('Geschafft.')).toBeVisible();
  await expect(page.getByText(/\+3 Min Scroll-Guthaben/)).toBeVisible();

  await page.goto('/umleiten?app=tiktok');
  await page.getByRole('button', { name: /10 Min vom Guthaben nehmen/ }).click();
  await expect(page.getByText('Viel Spaß.')).toBeVisible();
  await expect(page.getByText(/3 Min vom Guthaben genommen/)).toBeVisible();
});

test('Social-Slot einplanen und in der Liste sehen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Social-Slot planen' }).click();
  await page.getByRole('button', { name: '30 Min.', exact: true }).click();
  await page.getByRole('button', { name: 'Einplanen' }).click();
  await expect(page.getByText('30 Min · vom Guthaben')).toBeVisible();
});

test('Einführung zeigt die Umleiten-Anleitung', async ({ page }) => {
  await page.goto('/einfuehrung?wieder=1&schritt=umleiten');
  await expect(page.getByText('Umleiten statt sperren')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adresse kopieren' })).toBeVisible();
});
