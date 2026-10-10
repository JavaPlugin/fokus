// App zum Home-Bildschirm: Plattform erkennen, Installations-Angebot von Chrome/Android früh
// abfangen (beforeinstallprompt kommt nur einmal, oft bevor die Einführung offen ist).
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type InstallPlatform = 'ios' | 'ios-other' | 'android' | 'desktop' | 'native';

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

/** Beim Start aufrufen (Root-Layout). */
export function initInstall() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function installPlatform(): InstallPlatform {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'native';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'ios-other' : 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** Läuft die App schon als installierte App (Home-Bildschirm)? */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  return (
    !!window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    platform: installPlatform(),
    standalone: isStandalone(),
    canPrompt: !!deferred,
    /** Chrome-Dialog „App installieren“ öffnen. */
    async prompt() {
      if (!deferred) return false;
      await deferred.prompt();
      const r = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferred = null;
      listeners.forEach((x) => x());
      return r.outcome === 'accepted';
    },
  };
}
