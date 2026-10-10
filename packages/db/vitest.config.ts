import { defineConfig } from 'vitest/config';

// PGlite startet ein ganzes Postgres im Prozess. Auf CI-Runnern dauert der
// erste Start mit Migration länger als die 5 s Standard.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
