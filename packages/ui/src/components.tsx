import { splitEUR, type Cents } from '@fokus/core';
import type { ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  type ViewStyle,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useScheme } from './scheme';
import { SymbolIcon, type SymbolKey, type UiSymbol } from './symbols';
import { accentOf, contrast, linear, onAccent, onColor, onLight } from './theme';
import { colors, font, layout, radius, type, type Palette } from './tokens';

export function usePalette(): Palette {
  return colors[useScheme()];
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** Vorlesbarer Betrag für VoiceOver: „minus zehn Euro“ statt „-10,00 €“. */
export function spokenEUR(cents: Cents): string {
  const abs = Math.abs(cents);
  const e = Math.floor(abs / 100);
  const c = abs % 100;
  return `${cents < 0 ? 'minus ' : ''}${e} Euro${c ? ` ${c} Cent` : ''}`;
}

/** Hauptzahl eines Screens. Euro groß in ink, Cent und „€“ in ink-3. */
export function Hero({
  label,
  cents,
  tone: t,
  signed,
}: {
  label: string;
  cents: Cents;
  /** positive: Zahl grün (Hero-Karten der Farbwelt). Negativ ist immer rot. */
  tone?: 'positive';
  /** „+“ vor positiven Beträgen (Salden). */
  signed?: boolean;
}) {
  const p = usePalette();
  const { sign, euros, cents: ct } = splitEUR(cents);
  const tone = cents < 0 ? p.negative : t && cents > 0 ? p[t] : p.ink;
  return (
    <View accessible accessibilityLabel={`${label}: ${spokenEUR(cents)}`} style={{ gap: 4 }}>
      <Text style={[type.small, { color: p.ink2 }]}>{label}</Text>
      <Text style={[type.hero, tabular, { color: tone }]}>
        {signed && cents > 0 ? '+' : sign}
        {euros}
        <Text style={{ color: tone === p.ink ? p.ink3 : tone, opacity: tone === p.ink ? 1 : 0.7 }}>
          ,{ct} €
        </Text>
      </Text>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <Text accessibilityRole="header" style={[type.title, { color: p.ink }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const p = usePalette();
  return (
    <Text style={[type.body, { color: muted ? p.ink2 : p.ink, lineHeight: 21 }]}>{children}</Text>
  );
}

/** Fläche ohne Rahmen. */
export function Card({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface, borderRadius: radius.card, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

export type Tone = 'positive' | 'warning' | 'negative';

export function ListRow({
  title,
  detail,
  value,
  onPress,
  tone,
  valueTone,
  leading,
  trailing,
  accessibilityLabel,
  children,
}: {
  title: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  /** Farbe des Titels: nur mit Bedeutung. */
  tone?: Tone;
  valueTone?: Tone;
  /** Links vor dem Titel, z. B. ein Datum. */
  leading?: ReactNode;
  /** Rechts statt value, z. B. ein kleiner Button. */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  /** Unter der Zeile, z. B. Fortschrittsbalken oder aufgeklappte Details. */
  children?: ReactNode;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        s.rowWrap,
        { backgroundColor: pressed ? p.surface2 : 'transparent' },
      ]}
    >
      <View style={s.row}>
        {leading}
        {/* Mindestbreite: ein breiter trailing-Knopf darf Titel und Text nie auf einen Buchstaben
            pro Zeile zusammendrücken */}
        <View style={{ flex: 1, minWidth: 96 }}>
          <Text style={[type.body, { color: tone ? p[tone] : p.ink, fontFamily: font.medium }]}>
            {title}
          </Text>
          {detail ? <Text style={[type.small, { color: p.ink3 }]}>{detail}</Text> : null}
        </View>
        {value ? (
          <Text style={[type.body, tabular, { color: valueTone ? p[valueTone] : p.ink2 }]}>
            {value}
          </Text>
        ) : null}
        {trailing ? <View style={{ flexShrink: 1, maxWidth: '60%' }}>{trailing}</View> : null}
      </View>
      {children}
    </Pressable>
  );
}

/** 4 px Balken, weiß auf surface-2. Über 100 % in negative. */
export function ProgressBar({
  value,
  tone,
  color,
}: {
  value: number;
  tone?: Tone;
  /** Kategoriefarbe; Bedeutungsfarbe (tone) hat Vorrang, z. B. überzogen. */
  color?: string;
}) {
  const p = usePalette();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height: 4, borderRadius: 2, backgroundColor: p.surface2, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: 4,
          backgroundColor: tone ? p[tone] : (color ?? p.ink),
        }}
      />
    </View>
  );
}

/** Farbpunkt einer Kategorie (8 px). */
export function CatDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
  );
}

/**
 * Symbol-Kachel in Kategoriefarbe: Verlauf von der Farbe zu 20 % dunkler, Zeichen in Weiß oder
 * Schwarz (je nachdem, was mehr Kontrast hat).
 */
export function CatTile({
  color,
  label,
  symbol,
  size = 36,
  radius: r,
}: {
  color: string;
  /** Ein Zeichen (Initiale), wenn kein Symbol gesetzt ist. */
  label?: string;
  /** Symbol (weiß) statt Initiale. */
  symbol?: SymbolKey | UiSymbol;
  size?: number;
  radius?: number;
}) {
  const a = accentOf(color);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r ?? Math.max(12, Math.min(18, size / 3)),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: a.from,
          borderWidth: a.border ? 1 : 0,
          borderColor: a.border,
        },
        gradientStyle(a.from, a.to),
      ]}
    >
      {symbol ? (
        <SymbolIcon name={symbol} color={symbolInk(a.to)} size={Math.round(size * 0.5)} />
      ) : (
        <Text
          style={{
            color: onColor(a.from),
            fontFamily: font.semibold,
            fontSize: Math.round(size * 0.42),
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

/**
 * Symbolfarbe auf einer Kachel: Weiß (Artboard), nur auf sehr hellen Verläufen (Gelb) Schwarz.
 * Symbole sind Grafik, keine Schrift: Maßstab 1.4.11 statt 4,5 : 1.
 */
const symbolInk = (bg: string) => (contrast(onAccent, bg) >= 2.5 ? onAccent : onLight);

/** Verlauf als Hintergrund (Web: backgroundImage), nativ nur die erste Farbe. */
export function gradientStyle(from: string, to: string, angle = 135): ViewStyle {
  return Platform.OS === 'web'
    ? ({ backgroundImage: linear(from, to, angle) } as unknown as ViewStyle)
    : { backgroundColor: from };
}

/** Abschnitt mit Überschrift (20/600) und optionaler Nebeninfo rechts. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Text accessibilityRole="header" style={[type.section, { color: p.ink }]}>
          {title}
        </Text>
        {aside ? <Text style={[type.small, tabular, { color: p.ink3 }]}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  /** danger: rote Schrift auf grauem Grund (Löschen). */
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const p = usePalette();
  const primary = variant === 'primary';
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: primary ? p.ink : p.surface2,
          opacity: off ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? p.bg : p.ink} />
      ) : (
        <Text
          style={[
            type.body,
            {
              fontFamily: font.semibold,
              color: primary ? p.bg : variant === 'danger' ? p.negative : p.ink,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ref,
  ...props
}: TextInputProps & { label: string; ref?: Ref<TextInput> }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, { color: p.ink2 }]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={p.ink3}
        accessibilityLabel={label}
        {...props}
        style={[s.input, type.body, { backgroundColor: p.surface2, color: p.ink }]}
      />
    </View>
  );
}

/** Kurzer Hinweis in Bedeutungsfarbe, z. B. Fehler oder Warnung. */
export function Notice({
  tone,
  children,
}: {
  tone: 'positive' | 'warning' | 'negative';
  children: ReactNode;
}) {
  const p = usePalette();
  return (
    <Text accessibilityRole="alert" style={[type.small, { color: p[tone] }]}>
      {children}
    </Text>
  );
}

const s = StyleSheet.create({
  rowWrap: { minHeight: layout.rowMin, paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexGrow: 1 },
  button: {
    minHeight: 54,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  input: { minHeight: layout.rowMin, borderRadius: 14, paddingHorizontal: 16 },
});
