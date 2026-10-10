// Eingabe-Bausteine: Sheet, Ziffernblock, Chips, Segmente, Wischzeile.
// Lesen und Eingeben sind getrennt: Eingaben passieren in Sheets, die von unten kommen.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { usePalette } from './components';
import { glass } from './glass';
import { useReducedMotion } from './motion';
import { onAccent } from './theme';
import { SymbolIcon, type SymbolKey, type UiSymbol } from './symbols';
import { font, layout, motion, radius, type } from './tokens';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

// Offene Sheets von unten nach oben: Escape (über onRequestClose) und Browser-Zurück schließen
// nur das oberste.
// Jedes offene Sheet hat einen eigenen Verlaufseintrag. Eigene history.back()-Aufrufe zählen wir
// mit, weil der Router den Verlaufszustand beim Zurück neu schreibt (Markierungen gehen verloren).
// history.back() wirkt erst später (asynchron). Öffnet ein Sheet, während ein eigenes Zurück noch
// unterwegs ist (ein Sheet schließt, das nächste öffnet im selben Moment), wartet sein
// Verlaufseintrag darauf. Sonst landet das Zurück auf dem neuen Eintrag, der Verlauf steht eins
// zu weit, und das nächste Schließen verlässt die Seite.
const stack: { id: number; close: () => void }[] = [];
let nextId = 1;
let listening = false;
let ownBacks = 0;
const waiting: { id: number; push: () => void }[] = [];
const afterBack: (() => void)[] = [];
function listen() {
  if (listening || !web) return;
  listening = true;
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) {
      ownBacks--;
      if (ownBacks === 0) {
        for (const w of waiting.splice(0)) w.push();
        for (const fn of afterBack.splice(0)) fn();
      }
      return;
    }
    // Zurück-Taste: oberstes Sheet schließen, sein Verlaufseintrag ist schon weg
    const top = stack.pop();
    top?.close();
  });
}

/**
 * Etwas tun, nachdem gerade geschlossene Sheets ihren Verlaufseintrag entfernt haben, z. B. zu
 * einer anderen Seite wechseln. Sonst kommt deren asynchrones history.back() erst nach dem
 * Seitenwechsel an und nimmt die neue Seite gleich wieder zurück (Ursache: „Importieren tut
 * nichts“). Das Schließen räumt erst nach dem nächsten Rendern auf, daher zwei Frames warten.
 */
export function afterSheets(fn: () => void) {
  if (!web) return fn();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (ownBacks > 0) afterBack.push(fn);
      else fn();
    }),
  );
}

/**
 * Zurück-Taste und -Geste für alles, was wie ein Sheet über der Seite liegt (Sheet, Overlays):
 * eigener Verlaufseintrag im gemeinsamen Stapel, Zurück schließt nur das oberste.
 * Liefert, ob dieses Element gerade oben liegt (für Escape über onRequestClose).
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const id = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    listen();
    id.current = nextId++;
    const me = { id: id.current, close: () => closeRef.current() };
    stack.push(me);
    const push = () =>
      window.history.pushState({ ...(window.history.state ?? {}), kbSheet: me.id }, '');
    if (web) {
      if (ownBacks > 0) waiting.push({ id: me.id, push });
      else push();
    }
    return () => {
      const i = stack.indexOf(me);
      if (i < 0) return;
      stack.splice(i, 1);
      // Eintrag noch gar nicht angelegt: nur aus der Warteschlange nehmen
      const w = waiting.findIndex((x) => x.id === me.id);
      if (w >= 0) waiting.splice(w, 1);
      else if (web) {
        // Selbst geschlossen (Button, Wisch): eigenen Verlaufseintrag wieder entfernen
        ownBacks++;
        window.history.back();
      }
    };
  }, [open]);
  return { isTop: () => !web || stack.at(-1)?.id === id.current };
}

/** Sichtbare Höhe und Tastatur (visualViewport), damit Buttons über der Tastatur bleiben. */
export function useVisualViewport(active: boolean) {
  const [vv, setVv] = useState<{ height: number; keyboard: number } | null>(null);
  useEffect(() => {
    if (!active || !web || !window.visualViewport) return;
    const v = window.visualViewport;
    const update = () =>
      setVv({
        height: v.height,
        keyboard: Math.max(0, window.innerHeight - v.height - v.offsetTop),
      });
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  }, [active]);
  return vv;
}

/**
 * Bottom-Sheet für alle Eingaben. Kopfzeile (Abbrechen · Titel · Aktion) bleibt stehen, nur der
 * Inhalt scrollt. Schließen per Wisch nach unten, Hintergrund, Escape und Browser-Zurück.
 * Nie höher als der sichtbare Bereich (Notch, Statusleiste, offene Tastatur).
 */
export function Sheet({
  open,
  onClose,
  title,
  action,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Rechts in der Kopfzeile, z. B. „Sichern“. */
  action?: { label: string; onPress: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(800)).current;
  const vv = useVisualViewport(open);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // In den Stapel, Verlaufseintrag für die Zurück-Taste
  const back = useBackClose(open, onClose);

  // Öffnen: hochfedern
  useEffect(() => {
    if (!open) return;
    if (reduced) y.setValue(0);
    else Animated.spring(y, { toValue: 0, useNativeDriver: true, ...motion.sheetSpring }).start();
    return () => y.setValue(800);
  }, [open, reduced, y]);

  const close = () => {
    if (reduced) return closeRef.current();
    Animated.timing(y, { toValue: 800, duration: 180, useNativeDriver: true }).start(() =>
      closeRef.current(),
    );
  };

  // Wisch nach unten an Griff oder Kopfzeile
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) close();
        else
          Animated.spring(y, { toValue: 0, useNativeDriver: true, ...motion.sheetSpring }).start();
      },
    }),
  ).current;

  const webSize = web
    ? ({
        maxHeight: `calc(${vv ? `${vv.height}px` : '100dvh'} - env(safe-area-inset-top) - 12px)`,
        marginBottom: vv?.keyboard ?? 0,
      } as unknown as { maxHeight: number; marginBottom: number })
    : { maxHeight: '92%' as const };

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      // Escape (Web) und Android-Zurück kommen bei allen offenen Modals an: nur das oberste schließt
      onRequestClose={() => {
        if (back.isTop()) close();
      }}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Schließen"
          onPress={close}
          {...glass('scrim')}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              transform: [{ translateY: y }],
              backgroundColor: p.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
              overflow: 'hidden',
            },
            webSize,
          ]}
        >
          <View {...pan.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View
                style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: p.surface2 }}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: layout.touchMin,
                paddingHorizontal: layout.gutter - 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={{
                  minHeight: layout.touchMin,
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  minWidth: 90,
                }}
              >
                <Text style={[type.body, { color: p.ink2 }]}>Abbrechen</Text>
              </Pressable>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[
                  type.body,
                  { flex: 1, textAlign: 'center', color: p.ink, fontFamily: font.semibold },
                ]}
              >
                {title ?? ''}
              </Text>
              <View style={{ minWidth: 90, alignItems: 'flex-end' }}>
                {action ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={action.disabled}
                    onPress={action.onPress}
                    style={{
                      minHeight: layout.touchMin,
                      justifyContent: 'center',
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={[
                        type.body,
                        { color: action.disabled ? p.ink3 : p.ink, fontFamily: font.semibold },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexShrink: 1 }}
            contentContainerStyle={[
              { padding: layout.gutter, paddingTop: 8, gap: 16 },
              web
                ? ({ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' } as unknown as {
                    paddingBottom: number;
                  })
                : { paddingBottom: 32 },
            ]}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  dot,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Farbpunkt (Kategorie). */
  dot?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        minHeight: layout.touchMin,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        backgroundColor: selected ? p.ink : p.surface2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={[type.body, { fontFamily: font.medium, color: selected ? p.bg : p.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        backgroundColor: p.surface2,
        borderRadius: radius.chip,
        padding: 3,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.chip - 3,
              backgroundColor: on ? p.surface : 'transparent',
            }}
          >
            <Text style={[type.body, { fontFamily: font.medium, color: on ? p.ink : p.ink2 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ziffernblock für Beträge. Wert als Text in Euro mit Komma („24,5“). */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const p = usePalette();
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === ',') return value.includes(',') ? undefined : onChange((value || '0') + ',');
    const [, dec = ''] = value.split(',');
    if (value.includes(',') && dec.length >= 2) return;
    if (!value.includes(',') && value.replace(/^0+/, '').length >= 7) return;
    onChange(value === '0' ? k : value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {keys.map((k) => (
        <Pressable
          key={k}
          onPress={() => press(k)}
          accessibilityRole="button"
          accessibilityLabel={k === '⌫' ? 'Löschen' : k === ',' ? 'Komma' : k}
          style={({ pressed }) => ({
            width: '33.33%',
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            backgroundColor: pressed ? p.surface2 : 'transparent',
          })}
        >
          <Text style={{ fontSize: 26, fontFamily: font.regular, color: p.ink }}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Zeile mit Wischen nach links zum Löschen (zweiter Tipp auf „Löschen“ bestätigt). */
export function SwipeRow({
  children,
  onDelete,
  label = 'Löschen',
}: {
  children: ReactNode;
  onDelete: () => void;
  label?: string;
}) {
  const p = usePalette();
  const x = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const snap = (to: number) => {
    setOpen(to !== 0);
    openRef.current = to !== 0;
    Animated.spring(x, { toValue: to, useNativeDriver: true, ...motion.sheetSpring }).start();
  };
  const pan = useRef(
    PanResponder.create({
      // Nur nach links (Löschen) oder wenn offen; nach rechts gehört die Geste dem Seiten-Wischen
      onMoveShouldSetPanResponder: (_, g) =>
        (g.dx < -12 || (openRef.current && g.dx > 12)) && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, Math.max(-120, g.dx))),
      onPanResponderRelease: (_, g) => snap(g.dx < -50 ? -96 : 0),
      onPanResponderTerminate: () => snap(0),
    }),
  ).current;
  // Löschen-Fläche erst zeigen, wenn gewischt wird (sonst scheint sie am Rand durch)
  const reveal = x.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View
      style={{ overflow: 'hidden' }}
      {...(Platform.OS === 'web' ? ({ dataSet: { swiperow: '' } } as object) : {})}
    >
      <AnimatedPressable
        onPress={() => {
          snap(0);
          onDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 96,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: p.negative,
          opacity: reveal,
        }}
      >
        <Text style={[type.body, { color: onAccent, fontFamily: font.semibold }]}>{label}</Text>
      </AnimatedPressable>
      <Animated.View
        {...pan.panHandlers}
        accessibilityActions={[{ name: 'delete', label }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}
        // userSelect: kein Markieren von Text beim Wischen im Browser
        style={[
          { transform: [{ translateX: x }], backgroundColor: p.surface },
          { userSelect: 'none' } as object,
        ]}
      >
        {children}
        {open ? (
          <Pressable
            onPress={() => snap(0)}
            accessibilityLabel="Zuklappen"
            style={{ position: 'absolute', inset: 0 }}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Schalter an/aus (grün = an). Für Einstellungen; die ganze Zeile ist tippbar. */
export function Toggle({
  label,
  value,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Symbol vor dem Text, z. B. „pause“. */
  icon?: SymbolKey | UiSymbol;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: layout.rowMin,
        paddingHorizontal: 16,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? (
        <View style={{ marginRight: 10 }}>
          <SymbolIcon name={icon} color={p.ink2} size={18} />
        </View>
      ) : null}
      <Text style={[type.body, { flex: 1, color: p.ink, fontFamily: font.medium }]}>{label}</Text>
      <View
        style={{
          width: 50,
          height: 30,
          borderRadius: 15,
          padding: 3,
          backgroundColor: value ? p.positive : p.surface2,
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: onAccent }} />
      </View>
    </Pressable>
  );
}
