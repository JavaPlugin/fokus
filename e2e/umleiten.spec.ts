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

test('Umleiten: ohne Guthaben zu, Aufgabe mit Uhr, Guthaben nehmen gibt frei', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  await request.post('/api/tasks', { data: { title: 'Lena antworten', minutes: 2 } });
  await page.goto('/umleiten?app=instagram');
  await expect(page.getByText('Kurz was Kleines zuerst?')).toBeVisible();
  await expect(page.getByText('Lena antworten')).toBeVisible();
  // Aufgabe: erst nach ihrer Dauer erledigt
  await page.getByRole('button', { name: 'Aufgabe machen' }).click();
  await expect(page.getByRole('button', { name: /Erledigt \(in \d+ s\)/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  // Ausnahme erst nach der Wartezeit
  await expect(page.getByRole('button', { name: /Trotzdem öffnen geht in \d+ s/ })).toBeVisible();

  await request.post('/api/e2e/credit', { data: { minutes: 10 } });
  await page.reload();
  await page.getByRole('button', { name: '10 Min vom Guthaben nehmen' }).click();
  await expect(page.getByText(/^Bis \d\d:\d\d frei\.$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instagram öffnen' })).toBeVisible();

  // Der Kurzbefehl fragt nach: jetzt frei, also keine Schleife zurück zu FOKUS
  const { key } = (await (await request.post('/api/me/gate-key', { data: {} })).json()) as {
    key: string;
  };
  expect(await (await request.get(`/api/v1/gate/${key}?app=instagram`)).text()).toBe('frei');
  // Umleiten-Seite ohne Sitzung (Safari), nur mit Schlüssel
  const fresh = await browser.newContext({ baseURL, locale: 'de-DE' });
  const safari = await fresh.newPage();
  await safari.goto(`/umleiten?app=instagram&k=${key}`);
  await expect(safari.getByText(/^Bis \d\d:\d\d frei\.$/)).toBeVisible();
  await fresh.close();
});

test('Profil zeigt die Umleiten-Anleitung mit persönlicher Adresse', async ({ page }) => {
  await page.goto('/einfuehrung?wieder=1&schritt=umleiten');
  await expect(page.getByText('Umleiten statt sperren')).toBeVisible();
  await page.getByRole('button', { name: /Adresse erstellen/ }).click();
  await expect(page.getByRole('button', { name: 'Adresse kopieren' })).toBeVisible();
  await page.getByRole('button', { name: 'Adresse testen' }).click();
  await expect(page.getByText(/^Funktioniert\./)).toBeVisible();
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
