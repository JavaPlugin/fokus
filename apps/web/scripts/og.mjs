// Erzeugt public/og.png (1200×630, Vorschaubild für geteilte Links) aus der Hero-Karte der
// Willkommensseite. Einmalig bzw. nach Designänderungen: node apps/web/scripts/og.mjs
// Farben wie packages/ui/src/theme.ts (hero, planColors).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fontDir = dirname(require.resolve('@expo-google-fonts/geist/package.json'));
const font = (w) => readFileSync(join(fontDir, `${w}`, `Geist_${w}.ttf`)).toString('base64');

const html = `<!doctype html><html><head><style>
@font-face { font-family: G; font-weight: 400; src: url(data:font/ttf;base64,${font('400Regular')}); }
@font-face { font-family: G; font-weight: 700; src: url(data:font/ttf;base64,${font('700Bold')}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #000; font-family: G; color: #F5F5F7;
  display: flex; align-items: center; gap: 72px; padding: 0 88px; }
.left { flex: 1; display: flex; flex-direction: column; gap: 24px; }
.logo { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
.k { width: 44px; height: 44px; border-radius: 11px; background: #F5F5F7; color: #000;
  display: flex; align-items: center; justify-content: center; font-weight: 700; }
h1 { font-size: 58px; line-height: 1.05; font-weight: 700; letter-spacing: -1px; }
p { font-size: 24px; color: #A1A1A6; line-height: 1.35; }
.card { width: 470px; border-radius: 32px; padding: 36px; border: 1px solid rgba(255,255,255,.06);
  background: radial-gradient(60% 60% at 90% 0%, rgba(48,209,88,.16) 0%, rgba(48,209,88,0) 70%),
    radial-gradient(120% 120% at 0% 0%, #2A3F35 0%, #121A16 45%, #0B0B0C 100%); }
.label { font-size: 20px; color: #A1A1A6; }
.big { font-size: 84px; font-weight: 700; margin: 6px 0 24px; letter-spacing: -2px; }
.big span { color: #8E8E93; }
.bar { display: flex; gap: 8px; height: 10px; }
.bar i { border-radius: 5px; display: block; }
</style></head><body>
<div class="left">
  <div class="logo"><div class="k">F</div>FOKUS</div>
  <h1>Produktive Zeit verdient Scroll-Zeit.</h1>
  <p>Tagesplaner mit Fokus-Blöcken und Social-Slots. Ohne Werbung, ohne Tracking.</p>
</div>
<div class="card">
  <div class="label">Scroll-Guthaben</div>
  <div class="big">45<span> Min.</span></div>
  <div class="bar"><i style="width:40%;background:#5AC8FA"></i><i style="width:12%;background:#30D158"></i><i style="width:28%;background:#5AC8FA"></i><i style="width:14%;background:#BF5AF2"></i></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, '..', 'public', 'og.png') });
await browser.close();
console.log('public/og.png geschrieben');
