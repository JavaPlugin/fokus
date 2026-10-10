// Kernablauf: Aufgabe mit fester Zeit, Kreis (erledigt + Rückgängig), Antippen = Bearbeiten,
// Wiederholung am richtigen Tag, Fokus starten.
import { expect, test } from '@playwright/test';
import { STATE, clearTasks } from './setup';

test.use({ storageState: STATE });

const ALL_DAYS = Array.from({ length: 7 }, () => ({ from: '00:00', to: '23:55' }));

test.beforeEach(async ({ request }) => {
  await clearTasks(request);
  // Arbeitszeit rund um die Uhr, damit automatische Aufgaben unabhängig von der Uhrzeit Platz haben
  await request.put('/api/plan/settings', { data: { week: ALL_DAYS } });
});

test('Aufgabe mit fester Zeit anlegen: steht in Heute, Kreis = erledigt mit Rückgängig, Antippen = bearbeiten', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Scroll-Guthaben')).toBeVisible();
  await expect(page.getByText('Noch nichts geplant')).toBeVisible();

  await page.getByRole('button', { name: 'Neue Aufgabe', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Was?' }).fill('Angebot schreiben');
  await page.getByRole('radio', { name: 'Feste Zeit' }).click();
  await expect(page.getByText('Feste Zeit gilt immer')).toBeVisible();
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).last().click();

  // Steht in Heute, mit Toast
  await expect(page.getByText(/„Angebot schreiben“ angelegt/)).toBeVisible();
  const row = page.getByRole('button', { name: /Angebot schreiben, .*feste Zeit/ });
  await expect(row).toBeVisible();

  // Kreis antippen = erledigt, Toast mit Rückgängig
  const circle = page.getByRole('checkbox', { name: /Angebot schreiben erledigt/ });
  await circle.click();
  await expect(page.getByText(/„Angebot schreiben“ erledigt/)).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /Angebot schreiben wieder öffnen/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('checkbox', { name: /Angebot schreiben erledigt/ })).toBeVisible();

  // Antippen öffnet Bearbeiten, nichts verschwindet
  await row.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Löschen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeVisible();
});

test('automatisch geplante Aufgabe steht in Heute und lässt sich starten', async ({
  page,
  request,
}) => {
  await request.post('/api/tasks', { data: { title: 'Konzept', schedule: 'auto', minutes: 50 } });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Konzept, .*automatisch geplant/ })).toBeVisible();
  await expect(page.getByText(/bringt \+12 Min Guthaben/)).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page).toHaveURL(/\/fokus-modus$/);
  await expect(page.getByText('Konzept').last()).toBeVisible();
  await page.getByRole('button', { name: 'Erledigt' }).click();
  await page.getByRole('button', { name: 'Zu Heute' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('wöchentliche Aufgabe erscheint am richtigen Tag', async ({ page, request }) => {
  // Nächster Montag (frühestens übermorgen)
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  const monday = d.toISOString().slice(0, 10);
  const tuesday = new Date(d.getTime() + 86400_000).toISOString().slice(0, 10);
  await request.post('/api/tasks', {
    data: {
      title: 'Team-Call',
      schedule: 'fixed',
      fixedAt: `${monday}T14:00:00.000Z`,
      minutes: 30,
      recurrence: { freq: 'weekly', days: [1] },
    },
  });
  const on = async (day: string) =>
    (
      (await (await request.get(`/api/day/${day}`)).json()) as {
        items: { title: string; recurring: string }[];
      }
    ).items;
  expect((await on(monday)).map((i) => [i.title, i.recurring])).toEqual([
    ['Team-Call', 'jeden Mo'],
  ]);
  expect(await on(tuesday)).toEqual([]);

  await page.goto('/aufgaben');
  await page.getByRole('radio', { name: 'Wiederkehrend' }).click();
  await expect(page.getByRole('button', { name: /Team-Call, .*jeden Mo/ })).toBeVisible();
});

test('Aufgaben: ohne Zeit einplanen, Kreis, Antippen löscht nie', async ({ page, request }) => {
  await request.post('/api/tasks', { data: { title: 'Rechnung abheften', minutes: 15 } });
  await page.goto('/aufgaben');
  await expect(page.getByText('Noch ohne Zeit')).toBeVisible();
  const row = page.getByRole('button', { name: /Rechnung abheften, 15 Min/ });
  // Antippen öffnet das Bearbeiten-Sheet, die Aufgabe bleibt
  await row.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Löschen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toBeVisible();
  // Einplanen = automatisch
  await page.getByRole('button', { name: 'Rechnung abheften einplanen' }).click();
  await expect(page.getByText(/wird automatisch eingeplant/)).toBeVisible();
  await expect(page.getByText('Heute eingeplant')).toBeVisible();
});

test('Fokus ohne Aufgabe: freien Block starten, Pause, weiter', async ({ page }) => {
  await page.goto('/fokus');
  await page.getByRole('button', { name: /Freien Block starten/ }).click();
  await expect(page).toHaveURL(/\/fokus-modus$/);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Weiter fokussieren')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter fokussieren' }).click();
  await expect(page.getByRole('button', { name: 'Erledigt' })).toBeVisible();
  await page.getByRole('button', { name: 'Erledigt' }).click();
  await page.getByRole('button', { name: 'Zu Heute' }).click();
});
