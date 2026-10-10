// Content-Security-Policy: keine Seite löst einen Verstoß aus (nichts wird blockiert).
import { expect, test } from '@playwright/test';
import { STATE } from './setup';

test.use({ storageState: STATE });

test('keine CSP-Verstöße auf den Hauptseiten', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`Refused to load ${e.blockedURI} (${e.violatedDirective})`),
    ),
  );
  for (const path of ['/', '/aufgaben', '/woche', '/fokus', '/willkommen', '/profil']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(
    await page.evaluate(
      () => (globalThis as { __EXPO_ROUTER_HYDRATE__?: boolean }).__EXPO_ROUTER_HYDRATE__,
    ),
  ).toBe(true);
  expect(violations).toEqual([]);
});
