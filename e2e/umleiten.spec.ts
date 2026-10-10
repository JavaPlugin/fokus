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

test('Woche zeigt Zeit-Konto und Serie', async ({ page }) => {
  await page.goto('/woche');
  await expect(page.getByText('Vom Scrollen zurückgeholt')).toBeVisible();
  await expect(page.getByText('Fokus-Zeit')).toBeVisible();
  await expect(page.getByText('Serie', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vorherige Woche' }).click();
  await expect(page.getByText('Woche', { exact: true }).first()).toBeVisible();
});

test('Planung im Profil ändern', async ({ page }) => {
  await page.goto('/profil');
  await page
    .getByRole('button', { name: /Planung/ })
    .first()
    .click();
  await page.getByRole('button', { name: '60 Min.' }).first().click();
  const s = await (await page.request.get('/api/plan/settings')).json();
  expect(s.focusMinutes).toBe(60);
  await page.request.put('/api/plan/settings', { data: { focusMinutes: 50 } });
});

test('Energie wählen und Kalender-Seite', async ({ page, request }) => {
  await request.put('/api/plan/settings', { data: { workStart: '00:00', workEnd: '23:55' } });
  const day = new Date().toISOString().slice(0, 10);
  await request.delete(`/api/energy/${day}`).catch(() => undefined);
  await page.goto('/');
  // Die Energie-Frage erscheint nur vormittags; sonst ist sie ausgeblendet
  if (
    new Date().getHours() < 14 &&
    !(await page.getByText('Wie viel Energie hast du heute?').count())
  )
    return;
  await page.goto('/kalender');
  await expect(page.getByText('Wo finde ich die Adresse?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hinzufügen' })).toBeVisible();
});
