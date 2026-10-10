import { afterSheets } from '@fokus/ui';
import { router, type Href } from 'expo-router';

/** Nur eigene, relative Pfade als Ziel nach dem Login (kein Umleiten auf fremde Seiten). */
export function safeNext(next: string | string[] | undefined | null): string {
  const n = Array.isArray(next) ? next[0] : next;
  return n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/';
}

/** Seite wechseln, nachdem offene Sheets geschlossen sind (siehe afterSheets). */
export function navigateAfterSheets(href: Href, how: 'push' | 'navigate' = 'push') {
  afterSheets(() => (how === 'push' ? router.push(href) : router.navigate(href)));
}

/** Seiten ohne Anmeldung (alles andere prüft AuthGate, ohne Sitzung → Willkommen). */
export const PUBLIC_PATHS = new Set([
  '/willkommen',
  '/login',
  '/registrieren',
  '/impressum',
  '/datenschutz',
  '/nutzungsbedingungen',
  '/setup',
  '/einladung',
  '/partner',
]);
export const isPublicPath = (path: string) =>
  PUBLIC_PATHS.has(path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);
