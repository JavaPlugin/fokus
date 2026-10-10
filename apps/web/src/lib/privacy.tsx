// Privatmodus: Titel von Aufgaben und Notizen unscharf (Auge oben rechts), z. B. in der Bahn.
// Zustand bleibt auf dem Gerät gespeichert. Texte, die verborgen werden sollen, tragen
// `dataSet={{ private: '' }}`; CSS blurrt sie (+html.tsx), solange `html.fk-private` gesetzt ist.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const KEY = 'fk.private';
const AUTO = 'fk.private.auto';
const web = Platform.OS === 'web' && typeof document !== 'undefined';

function read(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function write(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* privates Fenster: nur für diese Sitzung */
  }
}

interface PrivacyApi {
  hidden: boolean;
  toggle: () => void;
  /** Beim Zurückkehren in die App automatisch verbergen. */
  auto: boolean;
  setAuto: (on: boolean) => void;
}

const Ctx = createContext<PrivacyApi>({
  hidden: false,
  toggle: () => undefined,
  auto: false,
  setAuto: () => undefined,
});
export const usePrivacy = () => useContext(Ctx);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => (web ? read(KEY) || read(AUTO) : false));
  const [auto, setAutoState] = useState(() => (web ? read(AUTO) : false));

  const set = useCallback((on: boolean) => {
    setHidden(on);
    write(KEY, on);
  }, []);

  // Klasse am <html>, solange der Modus an ist
  useEffect(() => {
    if (!web) return;
    document.documentElement.classList.toggle('fk-private', hidden);
  }, [hidden]);

  // Automatisch an, wenn die App in den Hintergrund geht (beim Zurückkommen verborgen)
  useEffect(() => {
    if (!web || !auto) return;
    const on = () => document.visibilityState === 'hidden' && set(true);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [auto, set]);

  const setAuto = (on: boolean) => {
    setAutoState(on);
    write(AUTO, on);
  };

  return (
    <Ctx.Provider value={{ hidden, toggle: () => set(!hidden), auto, setAuto }}>
      {children}
    </Ctx.Provider>
  );
}
