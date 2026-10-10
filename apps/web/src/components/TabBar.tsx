import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { font, glass, isWeb, layout, TabIcon, type, usePalette, type TabIconName } from '@fokus/ui';
import { useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../lib/app';
import { usePagerPos } from './PagerTabs';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICON: Record<string, TabIconName> = {
  index: 'heute',
  woche: 'woche',
  inbox: 'inbox',
  fokus: 'fokus',
};

/** Höhe der schwebenden Leiste plus Abstand: so viel Platz brauchen Seiten unten. */
export const TAB_BAR_SPACE = 64 + 12 + 16;

/** 4 Tabs plus zentraler Erfassen-Button, schwebend auf Glas, aktiver Tab mit heller Pille. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { setCaptureOpen, plusRef } = useApp();
  const pos = usePagerPos();
  const [w, setW] = useState(0);
  const n = state.routes.length;
  // Plätze in der Leiste: 2 Tabs, Plus, 2 Tabs (gleich breit). Pille folgt dem Pager.
  const slot = (w - 12) / (n + 1);
  const at = (i: number) => 6 + (i < 2 ? i : i + 1) * slot;
  const pillX = pos
    ? pos.interpolate({
        inputRange: state.routes.map((_, i) => i),
        outputRange: state.routes.map((_, i) => at(i)),
        extrapolate: 'clamp',
      })
    : at(state.index);
  const tabs = state.routes.map((route, i) => {
    const focused = state.index === i;
    const label = descriptors[route.key]?.options.title ?? route.name;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => {
          if (!focused) navigation.navigate(route.name);
        }}
        style={{
          flex: 1,
          minHeight: layout.touchMin + 4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TabIcon name={ICON[route.name] ?? 'heute'} color={focused ? p.ink : p.ink3} />
        <Text style={[type.tab, { color: focused ? p.ink : p.ink3, marginTop: 3 }]}>{label}</Text>
      </Pressable>
    );
  });

  const plus = (
    <View key="plus" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        ref={plusRef as never}
        accessibilityRole="button"
        accessibilityLabel="Notiz oder Aufgabe erfassen"
        onPress={() => setCaptureOpen(true)}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: p.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: p.bg, fontSize: 28, lineHeight: 30, fontFamily: font.regular }}>
          +
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 12),
        alignItems: 'center',
        gap: 8,
      }}
    >
      {pos ? <Dots pos={pos} n={n} /> : null}
      <View
        accessibilityRole="tablist"
        {...glass('bar')}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          maxWidth: 536,
          paddingHorizontal: 6,
          height: 64,
          borderRadius: 32,
          ...(isWeb ? {} : { backgroundColor: p.surface }),
        }}
      >
        {w ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 8,
              bottom: 8,
              width: slot,
              borderRadius: 24,
              backgroundColor: p.pill,
              transform: [{ translateX: pillX }],
            }}
          />
        ) : null}
        {[...tabs.slice(0, 2), plus, ...tabs.slice(2)]}
      </View>
    </View>
  );
}

/** Kleine Punkte über der Leiste: wo bin ich im Pager (aktiver Punkt breiter). */
function Dots({ pos, n }: { pos: Animated.Value; n: number }) {
  const p = usePalette();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: n }, (_, i) => {
        const near = pos.interpolate({
          inputRange: [i - 1, i, i + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: p.ink,
              width: near.interpolate({ inputRange: [0, 1], outputRange: [4, 14] }),
              opacity: near.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.9] }),
            }}
          />
        );
      })}
    </View>
  );
}
