// Fokus-Partner: Einladungslink, Vorschau ohne Anmeldung, Mitmachen.
import { expect, test } from '@playwright/test';
import { STATE } from './setup';

test.describe('mit Anmeldung', () => {
  test.use({ storageState: STATE });

  test('Partner einladen im Fokus-Modus, Link öffnet die Vorschau, Mitmachen startet den Timer', async ({
    page,
    browser,
    request,
  }) => {
    await page.goto('/fokus');
    await page.getByRole('button', { name: /Freien Block starten/ }).click();
    await expect(page).toHaveURL(/\/fokus-modus$/);
    await page.getByRole('button', { name: 'Partner einladen' }).click();
    const link = await page.getByRole('button', { name: 'Einladungslink kopieren' }).innerText();
    expect(link).toContain('/partner?token=');
    const token = new URL(link.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

    // Ohne Anmeldung: nur Vorschau und Anmelden
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const ap = await anon.newPage();
    await ap.goto(`/partner?token=${token}`);
    await expect(ap.getByText(/lädt dich zu einem Fokus-Block ein/)).toBeVisible();
    await expect(ap.getByRole('button', { name: 'Anmelden und mitmachen' })).toBeVisible();
    expect(await ap.content()).not.toContain('admin@e2e.test');
    await anon.close();

    // Ende: Sheet zu, Raum beenden, Block beenden
    await page.keyboard.press('Escape');
    const room = (await (await request.get('/api/rooms/current')).json()) as { id: string };
    expect((await request.delete(`/api/rooms/${room.id}`)).status()).toBe(204);
    await page.getByRole('button', { name: 'Erledigt' }).click();
    await page.getByRole('button', { name: 'Zu Heute' }).click();
  });

  test('Ungültiger Link', async ({ page }) => {
    await page.goto('/partner?token=' + 'x'.repeat(30));
    await expect(page.getByText('Diese Einladung gibt es nicht mehr.')).toBeVisible();
  });
});
