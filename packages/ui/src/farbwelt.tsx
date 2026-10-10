// Bauteile der Farbwelt (Artboard „Farbwelt (Referenz)“): Hero-Karte, getönte Karte, Segmentbalken,
// Kachel-Raster und Symbolwahl. Farben nur aus theme.ts.
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useScheme } from './scheme';
import { CatTile, gradientStyle, usePalette } from './components';
import { SYMBOL_KEYS, SymbolIcon, symbolName, type SymbolKey, type UiSymbol } from './symbols';
import { goalPalettes, hero, type GoalPalette } from './theme';
import { font, radius, type } from './tokens';

/** Große Karte oben auf einer Seite: dunkler Verlauf mit grünem Leuchten (hell: Fläche). */
export function HeroCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  return (
    <View
      style={[
        { borderRadius: 24, padding: 20, gap: 14, backgroundColor: p.surface },
        dark
          ? {
              backgroundColor: hero.base,
              borderWidth: 1,
              borderColor: hero.border,
              ...(Platform.OS === 'web'
                ? ({ backgroundImage: hero.gradient } as unknown as ViewStyle)
                : null),
            }
          : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Kleine Fläche in der Hero-Karte (z. B. „Du bekommst“). */
export function HeroStat({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View
      style={{ flex: 1, borderRadius: 16, padding: 12, gap: 2, backgroundColor: p.pill }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[type.small, { color: p.ink2 }]}>{label}</Text>
      <Text style={[type.section, { color: p.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

/** Getönte Karte (dunkler Verlauf, Text hell/getönt). Höchstens zwei pro Bildschirmhöhe. */
export function TintCard({
  tint,
  onPress,
  accessibilityLabel,
  children,
  style,
}: {
  tint: GoalPalette;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = goalPalettes[tint];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        { borderRadius: 22, padding: 16, gap: 12, backgroundColor: t.to },
        gradientStyle(t.from, t.to),
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Segmentbalken: Teile nebeneinander, Breite nach Anteil (nur positive Werte). */
export function SegmentBar({
  parts,
  label,
  height = 8,
}: {
  parts: { key: string; value: number; color: string }[];
  label?: string;
  height?: number;
}) {
  const shown = parts.filter((x) => x.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <View
      accessible={!!label}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 4, height }}
    >
      {shown.map((x) => (
        <View
          key={x.key}
          style={{
            flex: x.value / total,
            minWidth: 3,
            borderRadius: height / 2,
            backgroundColor: x.color,
          }}
        />
      ))}
    </View>
  );
}

/** Legende unter einem Segmentbalken: Punkt, Name, Betrag. */
export function Legend({
  items,
}: {
  items: { key: string; label: string; value: string; color: string }[];
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
      {items.map((x) => (
        <View key={x.key} style={{ width: '33.3%', gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: x.color }} />
            <Text numberOfLines={1} style={[type.small, { color: p.ink2, flexShrink: 1 }]}>
              {x.label}
            </Text>
          </View>
          <Text
            style={[
              type.body,
              { color: p.ink, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
            ]}
          >
            {x.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Raster aus Kacheln (Breite setzt IconTile über columns). */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

/** Kachel mit Symbol, Titel und Stand (System, Profil, Konto hinzufügen). */
export function IconTile({
  symbol,
  color,
  title,
  detail,
  onPress,
  columns = 2,
  wide,
  badge,
}: {
  symbol: SymbolKey | UiSymbol;
  color: string;
  title: string;
  detail?: string;
  onPress?: () => void;
  columns?: 2 | 3;
  /** Breit: eine Zeile mit Pfeil (z. B. Benachrichtigungen). */
  wide?: boolean;
  /** Kleiner gelber Punkt an der Kachel (z. B. Update verfügbar). */
  badge?: boolean;
}) {
  const p = usePalette();
  const basis = wide ? '100%' : columns === 3 ? '31%' : '47.5%';
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, detail].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: basis,
        minHeight: wide ? 64 : 110,
        borderRadius: radius.card,
        padding: 16,
        gap: wide ? 12 : 4,
        flexDirection: wide ? 'row' : 'column',
        alignItems: wide ? 'center' : 'stretch',
        justifyContent: 'space-between',
        backgroundColor: pressed ? p.surface2 : p.surface,
      })}
    >
      <View style={{ alignSelf: wide ? 'center' : 'flex-start' }}>
        <CatTile color={color} symbol={symbol} size={36} radius={10} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: p.warning,
            }}
          />
        ) : null}
      </View>
      <View style={{ gap: 2, flex: wide ? 1 : undefined }}>
        <Text style={[type.body, { color: p.ink, fontFamily: font.semibold }]}>{title}</Text>
        {detail ? (
          <Text numberOfLines={2} style={[type.small, { color: p.ink3 }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {wide && onPress ? <Text style={[type.body, { color: p.ink3 }]}>›</Text> : null}
    </Pressable>
  );
}

/** Symbol wählen: Raster aus Kacheln in der aktuellen Farbe. */
export function SymbolPicker({
  value,
  color,
  onChange,
}: {
  value: SymbolKey;
  color: string;
  onChange: (k: SymbolKey) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[type.small, { color: p.ink2 }]}>Symbol</Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {SYMBOL_KEYS.map((k) => {
          const on = k === value;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityLabel={symbolName(k)}
              aria-checked={on}
              onPress={() => onChange(k)}
              style={{
                padding: 2,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: on ? p.ink : 'transparent',
              }}
            >
              <CatTile color={color} symbol={k} size={36} radius={10} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Kleine Pille „Pausiert“ mit Pause-Symbol (Posten, Budgets). */
export function PausedPill() {
  const p = usePalette();
  return (
    <View
      accessible
      accessibilityLabel="Pausiert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: p.surface2,
      }}
    >
      <SymbolIcon name="pause" color={p.ink2} size={12} />
      <Text style={[type.small, { color: p.ink2, fontSize: 11, fontFamily: font.semibold }]}>
        Pausiert
      </Text>
    </View>
  );
}

/** Ausgegraut (45 %) für pausierte Zeilen. */
export const PAUSED_OPACITY = 0.45;
