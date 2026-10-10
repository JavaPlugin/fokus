// Kopiert die Geist-Schriftdateien nach public/fonts (vor dem Export). +html.tsx lädt sie per
// CSS vorab, damit Text sofort in Geist erscheint (kein Nachladen per JavaScript, kein Springen).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = dirname(require.resolve('@expo-google-fonts/geist/package.json'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
mkdirSync(out, { recursive: true });
for (const w of ['400Regular', '500Medium', '600SemiBold', '700Bold'])
  copyFileSync(join(src, w, `Geist_${w}.ttf`), join(out, `Geist_${w}.ttf`));
