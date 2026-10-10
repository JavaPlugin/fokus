// Löschen mit „Rückgängig“: die Zeile verschwindet sofort, die Anfrage geht erst nach 5 Sekunden
// raus. Rückgängig bricht ab, nichts wurde gelöscht. Verlässt man die App (pagehide), wird sofort
// gelöscht (DELETE-Anfragen laufen mit keepalive). Ohne neue Server-Logik.
import { font, type, usePalette } from '@fokus/ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DELAY = 5000;

interface Pending {
  key: string;
  label: string;
  run: () => Promise<void>;
  timer: ReturnType<typeof setTimeout>;
  /** Bei „Rückgängig“ zusätzlich ausführen (Meldungen ohne verzögerte Anfrage). */
  onUndo?: () => void;
}

interface UndoApi {
  /** Löschen vormerken; `key` blendet die Zeile bis dahin aus. */
  remove: (key: string, run: () => Promise<void>, label?: string) => void;
  /** Gerade vorgemerkte Schlüssel (für Listen: diese Zeilen nicht zeigen). */
  hidden: ReadonlySet<string>;
  /** Meldung mit „Rückgängig“ für etwas, das schon passiert ist (z. B. „Gesichert“). */
  notify: (label: string, onUndo?: () => void) => void;
}

const Ctx = createContext<UndoApi>({
  remove: (_k, run) => void run(),
  hidden: new Set(),
  notify: () => undefined,
});
export const useUndo = () => useContext(Ctx);

export function UndoProvider({ children }: { children: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const pending = useRef<Pending | null>(null);
  const [shown, setShown] = useState<{ key: string; label: string; undo: boolean } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');

  const unhide = (key: string) =>
    setHidden((h) => {
      const n = new Set(h);
      n.delete(key);
      return n;
    });

  /** Vorgemerktes jetzt ausführen. */
  const flush = useCallback(() => {
    const cur = pending.current;
    if (!cur) return;
    pending.current = null;
    clearTimeout(cur.timer);
    setShown((s) => (s?.key === cur.key ? null : s));
    cur
      .run()
      .catch((e: Error) => setError(e.message))
      .finally(() => unhide(cur.key));
  }, []);

  const remove = useCallback(
    (key: string, run: () => Promise<void>, label = 'Gelöscht') => {
      flush();
      setError('');
      setHidden((h) => new Set(h).add(key));
      pending.current = { key, label, run, timer: setTimeout(flush, DELAY) };
      setShown({ key, label, undo: true });
    },
    [flush],
  );

  const notify = useCallback(
    (label: string, onUndo?: () => void) => {
      flush();
      setError('');
      const key = `n:${Date.now()}`;
      pending.current = {
        key,
        label,
        run: async () => {},
        onUndo,
        timer: setTimeout(flush, DELAY),
      };
      setShown({ key, label, undo: !!onUndo });
    },
    [flush],
  );

  function undo() {
    const cur = pending.current;
    if (!cur) return;
    pending.current = null;
    clearTimeout(cur.timer);
    unhide(cur.key);
    setShown(null);
    cur.onUndo?.();
  }

  // App wird verlassen oder in den Hintergrund geschickt: sofort löschen
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const onHide = () => flush();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [flush]);

  // Fehlermeldung nach ein paar Sekunden ausblenden
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), DELAY);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <Ctx.Provider value={{ remove, hidden, notify }}>
      {children}
      {shown || error ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 92,
            alignItems: 'center',
          }}
        >
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingLeft: 16,
              paddingRight: shown?.undo ? 4 : 16,
              minHeight: 44,
              borderRadius: 22,
              backgroundColor: p.ink,
            }}
          >
            <Text style={[type.small, { color: error ? p.negative : p.bg }]}>
              {error || shown?.label}
            </Text>
            {shown?.undo && !error ? (
              <Pressable
                accessibilityRole="button"
                onPress={undo}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
              >
                <Text style={[type.small, { color: p.bg, fontFamily: font.semibold }]}>
                  Rückgängig
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
