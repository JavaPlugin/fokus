import { defineConfig } from 'tsup';

// Ein Bundle ohne node_modules zur Laufzeit, wie bei der API.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  clean: true,
});
