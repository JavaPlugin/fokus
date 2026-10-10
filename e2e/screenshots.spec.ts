// Screenshots für docs/screenshots (hell und dunkel), nur mit Beispieldaten:
// SHOTS=1 pnpm e2e screenshots   (nach dem Web-Build)
import { addDays, instant, todayIn } from '@fokus/core';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { STATE } from './setup';

test.skip(!process.env.SHOTS, 'nur mit SHOTS=1');
test.use({ storageState: STATE, viewport: { width: 390, height: 844 } });

const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots');

async function shot(page: Page, name: string, scheme: 'dark' | 'light') {
  await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`) });
}

test('Beispieldaten und Screenshots', async ({ page, request }) => {
  const day = todayIn();
  await request.put('/api/plan/settings', { data: { workStart: '00:00', workEnd: '23:55' } });
  await request.post('/api/e2e/credit', { data: { minutes: 35 } });
  const at = (hhmm: string) => new Date(instant(day, hhmm)).toISOString();
  const block = (kind: string, hhmm: string, minutes: number, title: string, status = 'planned') =>
    request
      .post('/api/blocks', { data: { kind, startsAt: at(hhmm), minutes, title } })
      .then(async (r) => {
        const b = (await r.json()) as { id: string };
        if (status !== 'planned') await request.put(`/api/blocks/${b.id}`, { data: { status } });
      });
  // Beispiel-Tag (Zeiten fest, damit die Bilder ruhig aussehen)
  await block('focus', '09:00', 50, 'Mails & Planung', 'done');
  await block('focus', '14:00', 50, 'Angebot fertig schreiben');
  await block('pause', '16:00', 20, 'Spaziergang');
  await block('social', '18:00', 20, 'Social-Slot');
  await request.post('/api/inbox', { data: { text: 'Lena wegen Samstag antworten' } });
  await request.post('/api/inbox', { data: { text: 'Zahnarzttermin ausmachen' } });
  await request.post('/api/tasks', {
    data: { title: 'Steuerunterlagen sortieren', minutes: 50, heavy: true },
  });
  void addDays;

  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.getByText('Scroll-Guthaben')).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, 'heute', scheme);
    await page.goto('/woche');
    await expect(page.getByText('Vom Scrollen zurückgeholt')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'woche', scheme);
    await page.goto('/inbox');
    await expect(page.getByText('Notizen')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'inbox', scheme);
    await page.goto('/profil');
    await expect(page.getByText('Dabei seit').first()).toBeVisible();
    await shot(page, 'profil', scheme);
    await page.goto('/willkommen');
  }
});
