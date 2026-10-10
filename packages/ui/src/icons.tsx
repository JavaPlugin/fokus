// Icons als SVG (keine Icon-Schrift): 24×24, Strich 1,75, runde Enden, Farbe per Prop.
import Svg, { Circle, Path } from 'react-native-svg';

export type TabIconName = 'heute' | 'woche' | 'inbox' | 'fokus';

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const s = {
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'heute' ? (
        <>
          <Path d="M3 11.5 12 4l9 7.5" {...s} />
          <Path d="M5.5 10v9.5h13V10" {...s} />
        </>
      ) : name === 'woche' ? (
        <>
          <Path d="M4 20V13M10 20V6M16 20v-9M21 20H3" {...s} />
        </>
      ) : name === 'inbox' ? (
        <>
          <Path d="M3 13h5l1.5 3h5L16 13h5" {...s} />
          <Path d="M5.5 5h13L21 13v6H3v-6z" {...s} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 7.5V12l3 2" {...s} />
        </>
      )}
    </Svg>
  );
}

/** Schloss (z. B. „Du · Immer dabei“). */
export function LockIcon({ color, size = 16 }: { color: string; size?: number }) {
  const s = { stroke: color, strokeWidth: 1.75, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 11h12v9H6z" {...s} strokeLinejoin="round" />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...s} />
    </Svg>
  );
}

/** Auge (Privatmodus): offen = Beträge sichtbar, durchgestrichen = verborgen. */
export function EyeIcon({
  hidden,
  color,
  size = 18,
}: {
  hidden: boolean;
  color: string;
  size?: number;
}) {
  const s = {
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...s} />
      <Circle cx={12} cy={12} r={3} {...s} />
      {hidden ? <Path d="M4 20 20 4" {...s} /> : null}
    </Svg>
  );
}
