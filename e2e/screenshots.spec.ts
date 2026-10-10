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

test('Beispieldaten und Screenshots', async ({ page, request, browser }) => {
  const day = todayIn();
  await request.put('/api/plan/settings', {
    data: { week: Array.from({ length: 7 }, () => ({ from: '09:00', to: '17:00' })) },
  });
  await request.post('/api/e2e/credit', { data: { minutes: 15 } });
  const at = (hhmm: string) => new Date(instant(day, hhmm)).toISOString();
  const task = (data: object) => request.post('/api/tasks', { data });
  // Beispiel-Tag (feste Zeiten, damit die Bilder ruhig aussehen)
  const mails = (await (
    await task({
      title: 'Mails beantworten',
      schedule: 'fixed',
      fixedAt: at('09:00'),
      minutes: 30,
      recurrence: { freq: 'daily' },
    })
  ).json()) as { id: string };
  await request.post(`/api/tasks/${mails.id}/done`, { data: { day } });
  await task({ title: 'Angebot schreiben', schedule: 'fixed', fixedAt: at('14:00'), minutes: 50 });
  await task({
    title: 'Spaziergang',
    kind: 'pause',
    schedule: 'fixed',
    fixedAt: at('15:00'),
    minutes: 20,
  });
  await task({
    title: 'Social-Slot',
    kind: 'social',
    schedule: 'fixed',
    fixedAt: at('18:00'),
    minutes: 15,
    recurrence: { freq: 'daily' },
  });
  await task({ title: 'Steuererklärung anfangen', minutes: 90 });
  await task({ title: 'Rechnung abheften', minutes: 15 });
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
    await page.goto('/aufgaben');
    await expect(page.getByText('Noch ohne Zeit')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'aufgaben', scheme);
    await page.goto('/arbeitszeiten');
    await expect(page.getByText('Regeln')).toBeVisible();
    await shot(page, 'arbeitszeiten', scheme);
    await page.goto('/umleiten?app=instagram');
    await expect(page.getByText('Kurz was Kleines zuerst?')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'umleiten', scheme);
    await page.goto('/profil');
    await expect(page.getByText('Dabei seit').first()).toBeVisible();
    await shot(page, 'profil', scheme);
    await page.goto('/kalender');
    await expect(page.getByText('Wo finde ich die Adresse?')).toBeVisible();
    await shot(page, 'kalender', scheme);
  }

  // Fokus-Modus: laufender Block, ruhig (ein Durchgang, danach beendet)
  const focusTask = (await (
    await request.post('/api/tasks', {
      data: { title: 'Angebot fertig schreiben', schedule: 'auto', minutes: 50 },
    })
  ).json()) as { id: string };
  const run = await request.post('/api/focus/start', { data: { taskId: focusTask.id } });
  const session = (await run.json()) as { id: string };
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/fokus-modus');
    await expect(page.getByText('Nach diesem Block')).toBeVisible();
    await shot(page, 'fokus-modus', scheme);
  }
  await request.post(`/api/focus/${session.id}/finish`, { data: {} });
  // Willkommensseite: ohne Anmeldung
  const anon = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });
  const ap = await anon.newPage();
  for (const scheme of ['dark', 'light'] as const) {
    await ap.emulateMedia({ colorScheme: scheme });
    await ap.goto('/willkommen');
    await expect(ap.getByText('Tagesplan')).toBeVisible();
    await ap.waitForTimeout(400);
    await shot(ap, 'willkommen', scheme);
  }
  await anon.close();
});
