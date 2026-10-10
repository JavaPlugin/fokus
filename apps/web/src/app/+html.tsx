import { ScrollViewStyleReset } from 'expo-router/html';
import { colors } from '@fokus/ui';
import type { PropsWithChildren } from 'react';

// HTML-Gerüst der statischen Web-Export. Nur auf dem Server/beim Export ausgeführt.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FOKUS" />
        <meta name="theme-color" content={colors.dark.bg} media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content={colors.light.bg} media="(prefers-color-scheme: light)" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="preload"
          href="/fonts/Geist_400Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Geist_700Bold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script src="/sw-register.js" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}

const fonts = ['400Regular', '500Medium', '600SemiBold', '700Bold']
  .map(
    (w) =>
      `@font-face { font-family: Geist_${w}; src: url(/fonts/Geist_${w}.ttf) format('truetype'); font-display: swap; }`,
  )
  .join(String.fromCharCode(10));

const css = `
${fonts}
body { background-color: ${colors.dark.bg}; }
@media (prefers-color-scheme: light) { body { background-color: ${colors.light.bg}; } }
/* Glas: Kopfzeile, Tab-Leiste, Hintergrund von Sheets. Fallback ohne Blur fast deckend. */
[data-glass="bar"], [data-glass="head"] {
  background-color: rgba(18,18,20,0.55);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
}
[data-glass="bar"] { border: 1px solid rgba(255,255,255,0.06); }
[data-glass="head"] { border-bottom: 1px solid rgba(255,255,255,0.06); }
[data-pager] { touch-action: pan-y; }
[data-glass="scrim"] { -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
[data-glass="overlay"] { background-color: rgba(0,0,0,0.55); -webkit-backdrop-filter: blur(28px) saturate(160%); backdrop-filter: blur(28px) saturate(160%); }
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) { [data-glass="overlay"] { background-color: rgba(0,0,0,0.92); } }
@media (prefers-color-scheme: light) {
  [data-glass="bar"], [data-glass="head"] { background-color: rgba(255,255,255,0.6); border-color: rgba(0,0,0,0.06); }
}
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  [data-glass="bar"], [data-glass="head"] { background-color: rgba(18,18,20,0.96); }
}
@media (prefers-reduced-transparency: reduce) {
  [data-glass] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  [data-glass="bar"], [data-glass="head"] { background-color: rgba(18,18,20,0.96); }
}
@media (prefers-color-scheme: light) and (prefers-reduced-transparency: reduce) {
  [data-glass="bar"], [data-glass="head"] { background-color: rgba(255,255,255,0.96); }
}
@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  @media (prefers-color-scheme: light) { [data-glass="bar"], [data-glass="head"] { background-color: rgba(255,255,255,0.96); } }
}
/* Gewählte Darstellung (Profil → Darstellung) schlägt das System */
html[data-scheme="light"] body { background-color: ${colors.light.bg}; }
html[data-scheme="dark"] body { background-color: ${colors.dark.bg}; }
html[data-scheme="light"] [data-glass="bar"], html[data-scheme="light"] [data-glass="head"] { background-color: rgba(255,255,255,0.6); border-color: rgba(0,0,0,0.06); }
html[data-scheme="dark"] [data-glass="bar"], html[data-scheme="dark"] [data-glass="head"] { background-color: rgba(18,18,20,0.55); border-color: rgba(255,255,255,0.06); }
/* Willkommen: schwebende Karte und Pillen, wachsender Balken, Abschnitte blenden ein */
@keyframes fk-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes fk-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes fk-tap { 0% { transform: scale(.6); opacity: 0; } 25% { opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }
[data-anim="tap"] { animation: fk-tap 1.6s ease-out infinite; }
@keyframes fk-in { from { transform: translateY(24px); } to { transform: none; } }
[data-anim="float"] { animation: fk-float 6s ease-in-out infinite; }
[data-anim="float2"] { animation: fk-float 7s ease-in-out 1s infinite; }
[data-anim="grow"] { transform-origin: left center; animation: fk-grow 1.4s cubic-bezier(.2,.8,.2,1) both; }
[data-anim="in"] { animation: fk-in .7s ease-out both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
@media (prefers-reduced-motion: reduce) { [data-anim] { animation: none !important; } }
/* Profil → Darstellung: Glas aus bzw. weniger Bewegung (nur dieses Gerät) */
html[data-noglass] [data-glass] { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
html[data-noglass] [data-glass="bar"], html[data-noglass] [data-glass="head"] { background-color: rgba(18,18,20,0.96) !important; }
@media (prefers-color-scheme: light) { html[data-noglass]:not([data-scheme="dark"]) [data-glass="bar"], html[data-noglass]:not([data-scheme="dark"]) [data-glass="head"] { background-color: rgba(255,255,255,0.96) !important; } }
html[data-noglass][data-scheme="light"] [data-glass="bar"], html[data-noglass][data-scheme="light"] [data-glass="head"] { background-color: rgba(255,255,255,0.96) !important; }
html[data-noglass] [data-glass="overlay"] { background-color: rgba(0,0,0,0.92); }
html[data-motion="reduce"] *, html[data-motion="reduce"] *::before, html[data-motion="reduce"] *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
html[data-motion="reduce"] [data-anim] { animation: none !important; }
`;
