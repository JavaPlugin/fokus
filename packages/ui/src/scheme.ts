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
export function useScheme(): 'light' | 'dark' {
  const forced = useContext(Forced);
  const system = useColorScheme();
  const c = useSchemeChoice();
  if (forced) return forced;
  return c === 'system' ? (system === 'light' ? 'light' : 'dark') : c;
}
