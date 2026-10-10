// Service Worker registrieren (eigene Datei statt Inline-Skript, wegen der Content-Security-Policy).
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
