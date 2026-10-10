// Gemeinsame Vorbereitung der Browser-Tests: Admin, Beispieldaten, Sitzung.
import { join } from 'node:path';
import type { APIRequestContext, Browser } from '@playwright/test';

export const STATE = join(import.meta.dirname, '.auth.json');
const CODE = 'e2e-setup-code';

/** Anmeldelink aus dem Test-Postfach der API (nur mit FK_E2E=1). */
export async function lastLink(r: APIRequestContext) {
  const mails = (await (await r.get('/api/e2e/mails')).json()) as { text: string }[];
  const m = mails.at(-1)?.text.match(/https?:\/\/\S+/);
  if (!m) throw new Error('Keine Mail mit Link');
  return m[0];
}

/**
 * Admin anmelden, Sitzung in .auth.json.
 * Wiederholbar: jede Spec ruft das in beforeAll auf (auch nach einem Neustart des Workers).
 */
export async function ensureLogin(browser: Browser): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = ctx.request;
  const setup = await r.post('/api/setup/admin', {
    data: { code: CODE, email: 'admin@e2e.test', name: 'Admin' },
  });
  if (!setup.ok())
    await r.post('/api/auth/sign-in/magic-link', {
      data: { email: 'admin@e2e.test', callbackURL: '/' },
    });
  await page.goto(await lastLink(r));
  await r.post('/api/setup/complete', { data: { code: CODE } });
  // Einführung als erledigt markieren, damit Tabs ohne Umweg erreichbar sind
  await r.put('/api/onboarding', { data: { step: 3, done: true } });
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

/** Alle Aufgaben der Testperson löschen (jeder Test startet mit einem leeren Plan). */
export async function clearTasks(r: APIRequestContext) {
  type L = { id?: string; taskId?: string | null };
  const open = (await (await r.get('/api/tasks?view=open')).json()) as {
    today: L[];
    week: { items: L[] }[];
    later: L[];
    waiting: L[];
  };
  const rec = (await (await r.get('/api/tasks?view=recurring')).json()) as L[];
  const done = (await (await r.get('/api/tasks?view=done')).json()) as L[];
  const ids = [
    ...open.today,
    ...open.week.flatMap((w) => w.items),
    ...open.later,
    ...open.waiting,
    ...rec,
    ...done,
  ].map((x) => x.taskId ?? x.id);
  for (const id of new Set(ids.filter(Boolean))) await r.delete(`/api/tasks/${id}`);
}
