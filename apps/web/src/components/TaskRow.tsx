// Zeile einer Aufgabe: Kreis (antippen = erledigt), Titel, Zeile darunter. Die Zeile antippen =
// bearbeiten. Termine aus dem Kalender haben keinen Kreis.
import { SymbolIcon, kindColors, font, type, usePalette, useScheme, kindScreens } from '@fokus/ui';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Kind } from '../lib/day';

const COLOR = {
  work: kindColors.focus,
  pause: kindColors.pause,
  social: kindColors.social,
  event: kindColors.warning,
} as const;

export function TaskRow({
  title,
  sub,
  kind,
  done,
  highlight,
  onToggle,
  onPress,
  trailing,
}: {
  title: string;
  sub: string;
  kind: Kind | 'event';
  done?: boolean;
  /** Läuft gerade */
  highlight?: boolean;
  /** Ohne: kein Kreis (Termine) */
  onToggle?: () => void;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const color = COLOR[kind];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: highlight ? p.surface2 : p.surface,
        borderWidth: 1,
        borderColor: highlight && dark ? kindScreens.focus.border : 'transparent',
      }}
    >
      {onToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!done }}
          accessibilityLabel={`${title} ${done ? 'wieder öffnen' : 'erledigt'}`}
          onPress={onToggle}
          hitSlop={10}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? color : 'transparent',
            borderWidth: done ? 0 : 2,
            borderColor: color,
          }}
        >
          {done ? <SymbolIcon name="haken" color={p.bg} size={14} /> : null}
        </Pressable>
      ) : (
        <View style={{ width: 24, alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        </View>
      )}
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${title}, ${sub}`}
        style={{ flex: 1, opacity: done ? 0.5 : 1 }}
      >
        <Text
          numberOfLines={2}
          style={[
            type.body,
            {
              color: p.ink,
              fontFamily: font.medium,
              textDecorationLine: done ? 'line-through' : 'none',
            },
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            type.small,
            { fontSize: 12, color: highlight && dark ? kindScreens.focus.text : p.ink3 },
          ]}
        >
          {sub}
        </Text>
      </Pressable>
      {trailing}
    </View>
  );
}

/** „14:00 · 50 Min · automatisch geplant“ */
export function rowSub(
  time: string,
  minutes: number,
  kind: Kind | 'event',
  how: 'auto' | 'fixed' | 'event',
  recurring: string,
): string {
  const dur = minutes % 60 === 0 && minutes >= 60 ? `${minutes / 60} Std` : `${minutes} Min`;
  const label =
    kind === 'pause'
      ? 'Pause'
      : kind === 'social'
        ? 'vom Guthaben'
        : how === 'event'
          ? 'Kalender'
          : recurring || (how === 'auto' ? 'automatisch geplant' : 'feste Zeit');
  return [time, dur, label].filter(Boolean).join(' · ');
}
