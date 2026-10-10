// Browser-Tests (Zurück-Knopf, Deep-Links, Update, Sheets). Vorher: pnpm --filter @fokus/web build
import { defineConfig, devices } from '@playwright/test';

const WEB = 4173;
const API = 3100;

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    // 127.0.0.1 statt localhost: dort registriert die App ihren Service Worker
    baseURL: `http://127.0.0.1:${WEB}`,
    ...devices['Pixel 7'],
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    { name: 'app', testMatch: '*.spec.ts', dependencies: ['setup'] },
  ],
  webServer: [
    {
      command: 'pnpm --filter @fokus/api exec tsx src/main.ts',
      url: `http://127.0.0.1:${API}/health`,
      reuseExistingServer: false,
      cwd: '..',
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(API),
        DATABASE_URL: 'pglite:memory',
        PUBLIC_URL: `http://127.0.0.1:${WEB}`,
        BETTER_AUTH_SECRET: 'e2e'.repeat(12),
        SETUP_CODE: 'e2e-setup-code',
        FK_E2E: '1',
      },
    },
    {
      command: 'node e2e/serve.mjs',
      url: `http://127.0.0.1:${WEB}/`,
      reuseExistingServer: false,
      cwd: '..',
      env: { WEB_PORT: String(WEB), API_PORT: String(API) },
    },
  ],
});
