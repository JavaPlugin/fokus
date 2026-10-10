// Bauteile von FOKUS: Fokus-Karte, Fortschrittsring, Zeile im Tagesplan.
// Farben nur aus theme.ts (Fokus = Blau, Pause = Grün, Social = Violett).
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { usePalette } from './components';
import { useScheme } from './scheme';
import { kindColors, kindScreens, ringTrack, type Kind } from './theme';
import { font, type } from './tokens';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Karte mit Verlauf in der Farbe der Art (hell: ruhige Fläche mit farbigem Rand). */
export function KindCard({
  kind = 'focus',
  children,
  style,
}: {
  kind?: 'focus' | 'pause';
  children: ReactNode;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const k = kindScreens[kind];
  return (
    <View
      style={[
        {
          borderRadius: 24,
          paddingVertical: 18,
          paddingHorizontal: 20,
          backgroundColor: dark ? k.base : p.surface,
          borderWidth: 1,
          borderColor: dark ? 'rgba(255,255,255,0.06)' : p.surface2,
        },
        dark && Platform.OS === 'web'
          ? ({ backgroundImage: k.card } as unknown as ViewStyle)
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Text in der Farbe der Art (dunkel: helle Tönung, hell: normaler Nebentext). */
export function useKindText(kind: 'focus' | 'pause') {
  const p = usePalette();
  return useScheme() === 'dark' ? kindScreens[kind].text : p.ink2;
}

/** Fortschrittsring: `progress` 0…1 füllt sich im Uhrzeigersinn, Inhalt in der Mitte. */
export function Ring({
  progress,
  size = 280,
  stroke = 10,
  kind = 'focus',
  label,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  kind?: Kind;
  label: string;
  children?: ReactNode;
}) {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, progress));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={dark ? ringTrack : p.surface2}
          strokeWidth={stroke}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={kindColors[kind]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </View>
    </View>
  );
}

/** Zeile im Tagesplan: Uhrzeit, farbiger Streifen, Titel und Zeile darunter. */
export function BlockRow({
  time,
  title,
  sub,
  kind,
  state = 'next',
  onPress,
}: {
  time: string;
  title: string;
  sub: string;
  kind: Kind;
  /** done: gedimmt und durchgestrichen, now: hervorgehoben */
  state?: 'done' | 'now' | 'next';
  onPress?: () => void;
}) {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'stretch',
        opacity: state === 'done' ? 0.45 : 1,
      }}
    >
      <Text
        style={[
          type.small,
          tabular,
          { width: 44, paddingTop: 14, color: state === 'now' ? p.ink : p.ink2 },
        ]}
      >
        {time}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${time} ${title}, ${sub}`}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: state === 'now' ? p.surface2 : p.surface,
          borderWidth: 1,
          borderColor: state === 'now' ? kindScreens.focus.border : 'transparent',
        }}
      >
        <View
          style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: kindColors[kind] }}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            // @ts-expect-error dataSet gibt es nur in react-native-web
            dataSet={{ private: '' }}
            style={[
              type.body,
              {
                color: p.ink,
                fontFamily: font.medium,
                textDecorationLine: state === 'done' ? 'line-through' : 'none',
              },
            ]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              type.small,
              { fontSize: 12, color: state === 'now' && dark ? kindScreens.focus.text : p.ink3 },
            ]}
          >
            {sub}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
