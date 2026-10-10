import { defineConfig } from 'tsup';

// Ein einziges Bundle für das Docker-Image, ohne node_modules zur Laufzeit.
// PGlite bleibt extern: nur für Entwicklung und Tests, in Produktion nie geladen.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  noExternal: [/.*/],
  external: ['@electric-sql/pglite'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  clean: true,
});
