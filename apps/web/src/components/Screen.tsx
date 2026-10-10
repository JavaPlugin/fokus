import { font, glass, isWeb, layout, type, usePalette } from '@fokus/ui';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHead } from './PageHead';

/** Innerhalb der Tabs: unten Platz für die schwebende Tab-Leiste. */
export const InTabs = createContext(false);
const TAB_BAR_SPACE = 64 + 12 + 16;

/** Ab dieser Scrollhöhe erscheint die Glas-Kopfzeile (die große Überschrift ist dann weg). */
const HEAD_AT = 44;

export interface ScreenHead {
  title: string;
  /** „45 Min. Guthaben · Heute“ */
  subtitle?: string;
  /** Rechts in der Kopfzeile, z. B. Auge und Avatar. Bleibt immer sichtbar. */
  right?: ReactNode;
}

/**
 * Seitenrahmen: sichere Bereiche, Seitenrand 20, Abschnitte 28, max. Breite auf großen Displays.
 * Mit `head`: Glas-Kopfzeile oben, die beim Scrollen mit Titel und Untertitel einblendet;
 * der Inhalt scrollt sichtbar darunter.
 */
export function Screen({
  children,
  scroll = true,
  head,
  title,
}: {
  children: ReactNode;
  scroll?: boolean;
  head?: ScreenHead;
  /** Titel im Browser („Titel · FOKUS“). Tab-Seiten setzen ihn im Tab-Layout. */
  title?: string;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const inTabs = useContext(InTabs);
  const y = useRef(new Animated.Value(0)).current;
  const [solid, setSolid] = useState(false);
  const barH = insets.top + 56;

  const inner = (
    <View
      style={{
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: layout.gutter,
        paddingTop: head ? barH : insets.top + 16,
        paddingBottom: insets.bottom + 32 + (inTabs ? TAB_BAR_SPACE : 0),
        gap: layout.section,
      }}
    >
      {children}
    </View>
  );

  const fade = y.interpolate({
    inputRange: [HEAD_AT - 12, HEAD_AT + 12],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {title ? <PageHead title={title} /> : null}
      {scroll ? (
        <Animated.ScrollView
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={
            head
              ? Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
                  useNativeDriver: false,
                  listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
                    const s = e.nativeEvent.contentOffset.y > HEAD_AT;
                    if (s !== solid) setSolid(s);
                  },
                })
              : undefined
          }
        >
          {inner}
        </Animated.ScrollView>
      ) : (
        <ScrollView scrollEnabled={false}>{inner}</ScrollView>
      )}
      {head ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: barH }}
        >
          {/* Glasfläche nur, wenn etwas darunter scrollt */}
          <Animated.View
            pointerEvents="none"
            {...(solid ? glass('head') : {})}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: fade,
              ...(isWeb ? {} : { backgroundColor: p.bg }),
            }}
          />
          <View
            pointerEvents="box-none"
            style={{
              flex: 1,
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              paddingTop: insets.top,
              paddingHorizontal: layout.gutter,
              gap: 12,
            }}
          >
            <Animated.View accessibilityRole="header" style={{ flex: 1, opacity: fade }}>
              <Text numberOfLines={1} style={[type.body, { color: p.ink, fontFamily: font.bold }]}>
                {head.title}
              </Text>
              {head.subtitle ? (
                <Text
                  numberOfLines={1}
                  style={[type.small, { color: p.ink2, fontVariant: ['tabular-nums'] }]}
                >
                  {head.subtitle}
                </Text>
              ) : null}
            </Animated.View>
            {head.right}
          </View>
        </View>
      ) : null}
    </View>
  );
}
