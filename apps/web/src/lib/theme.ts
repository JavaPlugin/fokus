// Darstellung merken (nur dieses Gerät) und beim Start anwenden.
import { setGlass, setLessMotion, setScheme, type SchemeChoice } from '@fokus/ui';

const KEY = 'fk.scheme';

export function loadScheme() {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'light' || v === 'dark') setScheme(v);
  } catch {
    // ohne Speicher: System
  }
}

const GLASS = 'fk.glass';
const MOTION = 'fk.motion';

/** Glas-Effekt und weniger Bewegung (nur dieses Gerät) beim Start anwenden. */
export function loadDisplay() {
  try {
    if (globalThis.localStorage?.getItem(GLASS) === 'off') setGlass(false);
    if (globalThis.localStorage?.getItem(MOTION) === 'less') setLessMotion(true);
  } catch {
    // ohne Speicher: Standard
  }
}

export function chooseGlass(on: boolean) {
  setGlass(on);
  try {
    if (on) globalThis.localStorage?.removeItem(GLASS);
    else globalThis.localStorage?.setItem(GLASS, 'off');
  } catch {
    // egal
  }
}

export function chooseLessMotion(on: boolean) {
  setLessMotion(on);
  try {
    if (on) globalThis.localStorage?.setItem(MOTION, 'less');
    else globalThis.localStorage?.removeItem(MOTION);
  } catch {
    // egal
  }
}

export function chooseScheme(v: SchemeChoice) {
  setScheme(v);
  try {
    if (v === 'system') globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, v);
  } catch {
    // egal
  }
}
