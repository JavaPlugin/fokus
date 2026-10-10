// Darstellung: Hell, Dunkel oder wie das System. Die Wahl gilt für alle Komponenten (usePalette),
// im Web zusätzlich als html[data-scheme] für die CSS-Regeln in +html.tsx.
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

export type SchemeChoice = 'system' | 'light' | 'dark';

let choice: SchemeChoice = 'system';
const listeners = new Set<() => void>();

export function setScheme(next: SchemeChoice) {
  choice = next;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    if (next === 'system') delete document.documentElement.dataset.scheme;
    else document.documentElement.dataset.scheme = next;
  }
  listeners.forEach((l) => l());
}

export function useSchemeChoice(): SchemeChoice {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => choice,
    () => choice,
  );
}

/** Bereich mit fester Darstellung (z. B. ein Sheet immer dunkel, Farbwelt). */
const Forced = createContext<'light' | 'dark' | null>(null);
export const ForceScheme = ({
  scheme,
  children,
}: {
  scheme: 'light' | 'dark';
  children: ReactNode;
}) => createElement(Forced.Provider, { value: scheme }, children);

/** Wirksames Schema: fester Bereich, sonst Wahl, sonst System. */
const media = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
const subscribeSystem = (cb: () => void) => {
  const m = media();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
};
const systemNow = (): 'light' | 'dark' => (media()?.matches ? 'dark' : 'light');

/**
 * System-Schema. Im Web mit festem Server-Wert „hell“: die statische Seite wird hell gerendert,
 * beim Hydrieren rechnet React danach neu und passt die Farben an (der Hook von React Native
 * liefert beim Hydrieren schon den Browserwert, dann blieben die hellen Inline-Farben stehen).
 */
function useSystemScheme(): 'light' | 'dark' | null | undefined {
  // Platform.OS ändert sich zur Laufzeit nie: die Hook-Reihenfolge bleibt gleich
  if (Platform.OS !== 'web') return useColorScheme() as 'light' | 'dark' | null;
  return useSyncExternalStore(subscribeSystem, systemNow, () => 'light' as const);
}

export function useScheme(): 'light' | 'dark' {
  const forced = useContext(Forced);
  const system = useSystemScheme();
  const c = useSchemeChoice();
  if (forced) return forced;
  return c === 'system' ? (system === 'light' ? 'light' : 'dark') : c;
}
