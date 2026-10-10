// Sitzung beenden, ohne Spuren auf dem Gerät: Abmelden auf dem Server, dann alles Lokale weg
// (Speicher der Seite, Offline-Warteschlange, Einstellungen pro Person, Laufzeit-Caches,
// IndexedDB) und neu laden. Gilt auch, wenn die Sitzung abläuft (401), und für andere Tabs.
import { Platform } from 'react-native';
import { authClient, onUnauthorized } from './api';

/** Bleibt nach dem Abmelden: gilt fürs Gerät, nicht für die Person (Darstellung). */
const KEEP = new Set(['fk.scheme', 'fk.glass', 'fk.motion']);
const CHANNEL = 'fk-auth';

const web = () => Platform.OS === 'web' && typeof window !== 'undefined';

/** Alles Persönliche aus dem Browser entfernen. */
export async function wipeLocal() {
  if (!web()) return;
  try {
    for (const k of Object.keys(localStorage))
      if ((k.startsWith('fk') || k.startsWith('fokus')) && !KEEP.has(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {
    // Speicher gesperrt (privates Fenster): nichts zu löschen
  }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise<void>((done) => {
            if (!d.name) return done();
            const r = indexedDB.deleteDatabase(d.name);
            r.onsuccess = r.onerror = r.onblocked = () => done();
          }),
      ),
    );
  } catch {
    // ohne IndexedDB
  }
  try {
    // Nur Laufzeit-Caches; der Precache der App-Shell (statische Dateien) bleibt für offline
    for (const name of await caches.keys())
      if (!name.includes('precache')) await caches.delete(name);
  } catch {
    // ohne Cache-API
  }
}

let leaving = false;

/**
 * Lokal abmelden und zur Willkommensseite (volles Neuladen: nichts bleibt im Speicher).
 * `server`: Sitzung auch auf dem Server beenden. `broadcast`: andere offene Tabs mitnehmen.
 */
export async function endSession({ server = true, broadcast = true } = {}) {
  if (leaving) return;
  leaving = true;
  if (server) await authClient.signOut().catch(() => undefined);
  if (broadcast && web() && 'BroadcastChannel' in window) {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage('logout');
    ch.close();
  }
  await wipeLocal();
  if (web()) window.location.replace('/willkommen');
}

/** Beim Start: abgelaufene Sitzung (401) und Abmelden in anderen Tabs beenden auch hier alles. */
export function initSession() {
  onUnauthorized(() => void endSession({ server: false }));
  if (!web() || !('BroadcastChannel' in window)) return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => {
    if (e.data === 'logout') void endSession({ server: false, broadcast: false });
  };
}
