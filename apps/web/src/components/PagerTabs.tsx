// Tabs als horizontaler Pager: die 4 Seiten liegen nebeneinander, Wischen wechselt die Seite.
// Eigener Navigator (TabRouter wie die normalen Tabs), damit URLs, Zurück und Deep-Links gleich
// bleiben. Ohne neue Abhängigkeit: Animated + PanResponder, läuft im Web und nativ.
//
// Gesten: nur klar horizontal (Winkel < 30°, Weg ≥ 24 px), nicht in den ersten 20 px vom linken
// Rand (iOS-Zurück-Geste), nicht über horizontal scrollbaren Reihen, nicht auf Unterseiten
// (z. B. Aufgaben-Detail). Listen-Wischen (SwipeRow) meldet sich zuerst und hat Vorrang.
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type NavigationState,
} from 'expo-router/react-navigation';
import { useReducedMotion } from '@fokus/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, View, type GestureResponderEvent } from 'react-native';

const EDGE = 20;
const MIN = 24;
const TAN30 = Math.tan(Math.PI / 6);

/** Position des Pagers (0 … Anzahl−1, auch zwischen den Seiten) für Tab-Pille und Punkte. */
export const PagerPos = createContext<Animated.Value | null>(null);
export const usePagerPos = () => useContext(PagerPos);

/**
 * Gehört die Geste etwas anderem? Horizontal scrollbare Reihen (Chips, Karten) immer,
 * Listenzeilen mit Wischen-zum-Löschen bei Bewegung nach links.
 */
function ownedByChild(e: GestureResponderEvent, dx: number) {
  if (Platform.OS !== 'web') return false;
  let el = (e.nativeEvent as unknown as { target?: Element }).target ?? null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noswipe !== undefined) return true;
      if (dx < 0 && el.dataset.swiperow !== undefined) return true;
      const ox = getComputedStyle(el).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    }
    el = el.parentElement;
  }
  return false;
}

type Props = {
  id?: string;
  initialRouteName?: string;
  backBehavior?: 'firstRoute' | 'initialRoute' | 'order' | 'history' | 'none';
  children: ReactNode;
  screenListeners?: object;
  screenOptions?: object;
  /** Tab-Leiste (unten, schwebend). Bekommt state, descriptors, navigation. */
  tabBar: (props: { state: never; descriptors: never; navigation: never }) => ReactNode;
};

function PagerNavigator({ tabBar, ...rest }: Props) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(
    TabRouter,
    rest as never,
  );
  const [width, setWidth] = useState(0);
  const pos = useRef(new Animated.Value(state.index)).current;
  const [visited, setVisited] = useState(() => new Set([state.routes[state.index]!.key]));
  const reduced = useReducedMotion();
  const live = useRef({ index: state.index, width, count: state.routes.length, state });
  live.current = { index: state.index, width, count: state.routes.length, state };

  // Seite gewechselt (Tab, URL, Wischen): hinfahren, Seite merken (bleibt gemountet)
  useEffect(() => {
    const key = state.routes[state.index]!.key;
    setVisited((v) => (v.has(key) ? v : new Set(v).add(key)));
    if (reduced) pos.setValue(state.index);
    else
      Animated.spring(pos, {
        toValue: state.index,
        useNativeDriver: false,
        damping: 30,
        stiffness: 320,
      }).start();
  }, [state.index, state.routes, pos, reduced]);

  const go = (i: number) => {
    const { state: s } = live.current;
    const route = s.routes[i];
    if (!route) return;
    void Haptics.selectionAsync().catch(() => undefined);
    navigation.navigate(route.name as never);
  };

  const startX = useRef(0);
  const pan = useRef(
    PanResponder.create({
      // Startpunkt selbst merken: gestureState.x0 gibt es erst nach dem Zuschlag
      onStartShouldSetPanResponderCapture: (e) => {
        startX.current = e.nativeEvent.pageX;
        return false;
      },
      // Capture: sonst nimmt die senkrechte ScrollView die Geste zuerst
      onMoveShouldSetPanResponderCapture: (e, g) => {
        const { state: s, index } = live.current;
        // Unterseite offen (z. B. /aufgabe/x): nicht wischen
        const nested = s.routes[index]?.state as NavigationState | undefined;
        if (nested && nested.index > 0) return false;
        if (startX.current < EDGE) return false;
        if (Math.abs(g.dx) < MIN || Math.abs(g.dy) > Math.abs(g.dx) * TAN30) return false;
        if (ownedByChild(e, g.dx)) return false;
        // Nachbarn schon jetzt zeigen
        setVisited((v) => {
          const n = new Set(v);
          for (const r of [s.routes[index - 1], s.routes[index + 1]]) if (r) n.add(r.key);
          return n.size === v.size ? v : n;
        });
        return true;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const { index, width: w, count } = live.current;
        if (!w) return;
        let p = index - g.dx / w;
        // Gummiband am ersten/letzten Tab
        if (p < 0) p = p / 3;
        if (p > count - 1) p = count - 1 + (p - (count - 1)) / 3;
        pos.setValue(p);
      },
      onPanResponderRelease: (_, g) => {
        const { index, width: w, count } = live.current;
        const far = Math.abs(g.dx) > w * 0.25 || Math.abs(g.vx) > 0.5;
        const next = far ? Math.max(0, Math.min(count - 1, index - Math.sign(g.dx))) : index;
        if (next !== index) go(next);
        else
          Animated.spring(pos, {
            toValue: index,
            useNativeDriver: false,
            damping: 30,
            stiffness: 320,
          }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(pos, { toValue: live.current.index, useNativeDriver: false }).start(),
    }),
  ).current;

  const translateX = Animated.multiply(pos, -(width || 1));

  return (
    <NavigationContent>
      <PagerPos.Provider value={pos}>
        <View
          style={{ flex: 1, overflow: 'hidden' }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          {...(Platform.OS === 'web' ? ({ dataSet: { pager: '' } } as object) : {})}
          {...pan.panHandlers}
        >
          <Animated.View style={{ flex: 1, flexDirection: 'row', transform: [{ translateX }] }}>
            {state.routes.map((r, i) => (
              <View
                key={r.key}
                aria-hidden={i !== state.index}
                style={{ width: width || '100%', height: '100%' }}
              >
                {visited.has(r.key) || i === state.index ? descriptors[r.key]!.render() : null}
              </View>
            ))}
          </Animated.View>
        </View>
        {tabBar({
          state: state as never,
          descriptors: descriptors as never,
          navigation: navigation as never,
        })}
      </PagerPos.Provider>
    </NavigationContent>
  );
}

const Navigator = createNavigatorFactory(PagerNavigator as never)().Navigator;

/** Wie `Tabs` aus expo-router, nur als wischbarer Pager. */
export const PagerTabs = withLayoutContext(
  Navigator as never,
) as unknown as typeof import('expo-router').Tabs;
