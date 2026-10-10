// Umleiten und Social-Slots.
import { expect, test } from '@playwright/test';
import { STATE, clearTasks } from './setup';

test.use({ storageState: STATE });

test.beforeEach(async ({ request }) => {
  await clearTasks(request);
  // Standard-Arbeitszeiten: Mo–Fr 09–17, Sa/So frei
  await request.put('/api/plan/settings', {
    data: { week: [null, ...Array(5).fill({ from: '09:00', to: '17:00' }), null] },
  });
});

test('Umleiten: Aufgabe machen bringt Guthaben, Guthaben nehmen zieht ab', async ({
  page,
  request,
}) => {
  await request.post('/api/tasks', { data: { title: 'Lena antworten', minutes: 2 } });
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

test('Profil zeigt die Umleiten-Anleitung', async ({ page }) => {
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

test('Arbeitszeiten ändern', async ({ page }) => {
  await page.goto('/arbeitszeiten');
  await expect(
    page.getByText('Automatische Aufgaben plant FOKUS nur in diese Zeiten.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /Samstag/ }).click();
  await page.getByRole('switch', { name: 'Arbeitstag' }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/plan/settings')).json()).week[6])
    .toEqual({ from: '09:00', to: '17:00' });
  const s = await (await page.request.get('/api/plan/settings')).json();
  expect(s.week[6]).toEqual({ from: '09:00', to: '17:00' });
  await page.request.put('/api/plan/settings', {
    data: { week: [null, ...Array(5).fill({ from: '09:00', to: '17:00' }), null] },
  });
});
