// Service Worker für die App-Shell. API-Aufrufe werden nie gecacht (Finanzdaten, Sitzungen).
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{js,html,css,ttf,woff2,ico,png,svg,json,webmanifest}'],
  swDest: 'dist/sw.js',
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//, /^\/health/],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  cacheId: 'fokus',
  // Kein stilles Update mitten in der Nutzung: der neue Worker wartet, bis man in der App
  // „Neu laden“ tippt (Nachricht SKIP_WAITING, bringt Workbox mit). Bis dahin liefert der alte
  // Worker die alten Dateien aus seinem Cache, Seite und Code passen also zusammen.
  clientsClaim: false,
  skipWaiting: false,
  // Push-Mitteilungen (public/push-sw.js)
  importScripts: ['push-sw.js'],
};
