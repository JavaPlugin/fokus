// Kernablauf: Aufgabe erfassen, Tag planen, Fokus starten und beenden, Notiz in der Inbox.
import { expect, test } from '@playwright/test';
import { STATE } from './setup';

test.use({ storageState: STATE });

test.beforeEach(async ({ request }) => {
  // Arbeitsfenster über den ganzen Tag, damit der Plan unabhängig von der Uhrzeit etwas findet
  await request.put('/api/plan/settings', { data: { workStart: '00:00', workEnd: '23:55' } });
});

test('Aufgabe erfassen, Tag planen, Fokus starten und erledigen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Scroll-Guthaben')).toBeVisible();
  await expect(page.getByText('Noch nichts geplant.')).toBeVisible();

  await page.getByRole('button', { name: 'Notiz oder Aufgabe erfassen' }).click();
  await page.getByRole('textbox', { name: 'Was ist zu tun?' }).fill('Angebot schreiben');
  await page.getByRole('button', { name: '25 Min.' }).click();
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).last().click();

  await page.getByRole('button', { name: 'Tag planen' }).click();
  await expect(page.getByText('Angebot schreiben').first()).toBeVisible();
  await expect(page.getByText('Dein Tag', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Fokus starten' }).click();
  await expect(page).toHaveURL(/\/fokus-modus$/);
  await expect(page.getByText('Angebot schreiben').last()).toBeVisible();
  await expect(page.getByText(/Nach diesem Block/)).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();

  await page.getByRole('button', { name: 'Erledigt' }).click();
  await expect(page.getByText('Min. fokussiert')).toBeVisible();
  await page.getByRole('button', { name: 'Zu Heute' }).click();
  await expect(page).toHaveURL(/\/$/);
  // Unter einer Minute gearbeitet: kein Block, kein Guthaben, die Aufgabe ist trotzdem erledigt
  await expect(page.getByText('Noch nichts geplant.')).toBeVisible();
});

test('Inbox: Notiz erfassen und einplanen', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Notiz oder Aufgabe erfassen' }).click();
  await page.getByRole('textbox', { name: 'Was ist zu tun?' }).fill('Zahnarzt anrufen');
  await page.getByRole('button', { name: 'In die Inbox' }).last().click();
  await page.getByRole('button', { name: /Zahnarzt anrufen.*Einplanen/ }).click();
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).last().click();
  await expect(page.getByRole('button', { name: /Zahnarzt anrufen.*Erledigt/ })).toBeVisible();
  await expect(page.getByText('Aufgaben', { exact: true })).toBeVisible();
});

test('Fokus ohne Plan: freien Block starten, Pause, weiter', async ({ page }) => {
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
