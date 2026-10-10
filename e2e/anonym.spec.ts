// Sicherheit: ohne Anmeldung ist keine App-Seite und kein API-Endpunkt mit Daten erreichbar.
// Nach dem Abmelden zeigt das Gerät nichts mehr (auch nicht offline, auch nicht in anderen Tabs).
import { expect, test, type BrowserContext } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lastLink } from './setup';

const APP = join(import.meta.dirname, '..', 'apps', 'web', 'src', 'app');
const DIST = join(import.meta.dirname, '..', 'apps', 'web', 'dist');
const PUBLIC = new Set([
  '/willkommen',
  '/login',
  '/registrieren',
  '/impressum',
  '/datenschutz',
  '/nutzungsbedingungen',
  '/setup',
  '/einladung',
]);
const ID = '00000000-0000-4000-8000-000000000001';
const EMAIL = 'admin@e2e.test';

/** Alle Routen aus src/app (Gruppen wie (tabs) zählen nicht, [id] → feste UUID). */
function routes(dir = APP, base = ''): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      const seg = n.startsWith('(') ? '' : `/${n.replace(/^\[.*\]$/, ID)}`;
      return routes(p, base + seg);
    }
    if (!n.endsWith('.tsx') || n.startsWith('_') || n.startsWith('+')) return [];
    const name = n.slice(0, -4);
    const seg = name === 'index' ? '' : `/${name.replace(/^\[.*\]$/, ID)}`;
    return [base + seg || '/'];
  });
}

test('ohne Anmeldung: jede App-Seite führt zur Willkommensseite, nichts Persönliches im DOM', async ({
  browser,
}) => {
  const list = routes().filter((r) => !PUBLIC.has(r));
  expect(list.length).toBeGreaterThan(8);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const r of list) {
    await page.goto(r);
    await expect(page, r).toHaveURL(/\/willkommen/);
    expect(await page.content(), r).not.toContain(EMAIL);
  }
  // API: ohne Sitzung 401, nie cachebar
  for (const path of ['/api/me', '/api/notify', '/api/me/export', '/api/admin/system']) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(401);
    expect(res.headers()['cache-control'], path).toBe('no-store');
    expect(await res.text(), path).not.toContain(EMAIL);
  }
  await ctx.close();
});

test('Service Worker cacht nie die API', () => {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
  // Nur Precache der statischen Dateien, keine Laufzeit-Strategien
  expect(sw).not.toMatch(/NetworkFirst|CacheFirst|StaleWhileRevalidate|NetworkOnly/);
  expect(sw).toContain('/^\\/api\\//');
});

/** Eigene Sitzung (nicht die der anderen Tests), damit Abmelden sie nicht beendet. */
async function login(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email: EMAIL, callbackURL: '/' },
  });
  await page.goto(await lastLink(page.request));
  return page;
}

test('Abmelden: nichts bleibt, auch nicht über Zurück, offline oder in einem zweiten Tab', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await login(ctx);
  await page.goto('/profil');
  await expect(page.getByText(/Dabei seit/).first()).toBeVisible();
  const other = await ctx.newPage();
  await other.goto('/woche');
  await expect(other.getByRole('tab', { name: 'Woche' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('fk_queue', '[{"path":"/api/inbox"}]'));

  await page.getByRole('button', { name: 'Abmelden', exact: true }).first().click();
  await expect(page).toHaveURL(/\/willkommen/);
  // Der andere Tab meldet sich mit ab
  await expect(other).toHaveURL(/\/willkommen/);
  // Lokale Daten weg (Darstellung bleibt)
  expect(await page.evaluate(() => localStorage.getItem('fk_queue'))).toBeNull();
  // Zurück zeigt keine Daten
  await page.goBack();
  await expect(page).toHaveURL(/\/willkommen/);
  expect(await page.content()).not.toContain(EMAIL);
  // Offline: die App-Hülle lädt, aber ohne Sitzung keine Seite und keine Daten
  await ctx.setOffline(true);
  await page.goto('/profil').catch(() => undefined);
  await expect(page.getByText(/Dabei seit/)).toHaveCount(0);
  await ctx.setOffline(false);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/willkommen/);
  await ctx.close();
});

test('Abgelaufene Sitzung (401): App räumt auf und geht zur Willkommensseite', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await login(ctx);
  await page.goto('/woche');
  await expect(page.getByRole('tab', { name: 'Woche' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('fk_queue', '[]'));
  // Sitzung auf dem Server beenden, ohne dass die Seite es weiß
  const origin = new URL(page.url()).origin;
  expect(
    (await page.request.post('/api/auth/sign-out', { data: {}, headers: { origin } })).ok(),
  ).toBe(true);
  // Nächster Aufruf der App (Profil lädt Mitteilungen und Splits) bekommt 401 → aufräumen
  // (ein Hintergrund-Abruf der App kann den 401 schon vor dem Tipp auslösen: auch gut)
  await page
    .getByRole('button', { name: 'Profil' })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect(page).toHaveURL(/\/willkommen/);
  expect(await page.evaluate(() => localStorage.getItem('fk_queue'))).toBeNull();
  await ctx.close();
});
