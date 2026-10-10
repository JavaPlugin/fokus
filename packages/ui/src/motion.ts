// Anzeige-Einstellungen pro Gerät (Profil → Darstellung): Glas-Effekt und weniger Bewegung.
// Im Web zusätzlich als html[data-noglass] bzw. html[data-motion="reduce"] für die CSS-Regeln in
// +html.tsx. „Weniger Bewegung“ gilt auch, wenn das System es verlangt.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let glassOn = true;
let motionLess = false;
const listeners = new Set<() => void>();
const html = () =>
  Platform.OS === 'web' && typeof document !== 'undefined' ? document.documentElement : null;

export function setGlass(on: boolean) {
  glassOn = on;
  const h = html();
  if (h) {
    if (on) delete h.dataset.noglass;
    else h.dataset.noglass = '1';
  }
  listeners.forEach((l) => l());
}

export function setLessMotion(on: boolean) {
  motionLess = on;
  const h = html();
  if (h) {
    if (on) h.dataset.motion = 'reduce';
    else delete h.dataset.motion;
  }
  listeners.forEach((l) => l());
}

const sub = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const useGlass = () =>
  useSyncExternalStore(
    sub,
    () => glassOn,
    () => glassOn,
  );
/** Nur die Geräte-Einstellung (für den Schalter). */
export const useLessMotion = () =>
  useSyncExternalStore(
    sub,
    () => motionLess,
    () => motionLess,
  );

/** Wirksam: System „Bewegung reduzieren“ oder Geräte-Einstellung. */
export function useReducedMotion() {
  const [system, setSystem] = useState(false);
  const device = useLessMotion();
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystem);
    const s = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    return () => s.remove();
  }, []);
  return system || device;
}
