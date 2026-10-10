// Symbole für Kacheln (Kategorien, Posten, Splits): 24×24, Strich 1,75, runde Enden, Farbe per Prop.
// Keine Icon-Schrift, keine Emojis: überall gleich gezeichnet.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export const SYMBOL_KEYS = [
  'essen',
  'einkauf',
  'tanken',
  'auto',
  'zug',
  'wohnen',
  'vertrag',
  'handy',
  'freizeit',
  'kino',
  'sport',
  'reise',
  'berg',
  'gesundheit',
  'bildung',
  'geschenk',
  'haustier',
  'sparen',
  'konto',
  'gehalt',
  'haushalt',
  'sonstiges',
] as const;
export type SymbolKey = (typeof SYMBOL_KEYS)[number];
/** Weitere Symbole nur für die Oberfläche (System, Konten), nicht wählbar. */
export type UiSymbol =
  | 'datenbank'
  | 'wolke'
  | 'personen'
  | 'schloss'
  | 'mail'
  | 'uhr'
  | 'pfeil'
  | 'bank'
  | 'stift'
  | 'datei'
  | 'haken'
  | 'glocke'
  | 'schluessel'
  | 'pause';

const NAMES: Record<SymbolKey, string> = {
  essen: 'Essen',
  einkauf: 'Einkauf',
  tanken: 'Tanken',
  auto: 'Auto',
  zug: 'Bahn',
  wohnen: 'Wohnen',
  vertrag: 'Verträge',
  handy: 'Handy',
  freizeit: 'Freizeit',
  kino: 'Kino',
  sport: 'Sport',
  reise: 'Reise',
  berg: 'Berge',
  gesundheit: 'Gesundheit',
  bildung: 'Bildung',
  geschenk: 'Geschenk',
  haustier: 'Haustier',
  sparen: 'Sparen',
  konto: 'Konto',
  gehalt: 'Gehalt',
  haushalt: 'Haushalt',
  sonstiges: 'Sonstiges',
};
export const symbolName = (k: SymbolKey) => NAMES[k];
export const isSymbol = (k: string | null | undefined): k is SymbolKey =>
  !!k && (SYMBOL_KEYS as readonly string[]).includes(k);

/** Standard-Symbol nach Name (Kategorie, Posten, Gruppe). */
const BY_NAME: [RegExp, SymbolKey][] = [
  [/essen|restaurant|lebensmittel|döner|pizza|bäcker|café|kaffee/i, 'essen'],
  [/einkauf|supermarkt|lidl|rewe|aldi|drogerie|dm\b|rossmann/i, 'einkauf'],
  [/tank|sprit|benzin|aral|shell/i, 'tanken'],
  [/auto|kfz|werkstatt|parken/i, 'auto'],
  [/bahn|zug|ticket|öpnv|mvg|deutschland/i, 'zug'],
  [/miete|wohn|haus|strom|gas|nebenkosten/i, 'wohnen'],
  [/vertrag|versicherung|abo|gebühr/i, 'vertrag'],
  [/handy|telefon|internet|mobilfunk/i, 'handy'],
  [/kino|film|netflix|streaming|spotify/i, 'kino'],
  [/sport|fitness|gym|verein/i, 'sport'],
  [/freizeit|ausgehen|hobby|bar\b|party/i, 'freizeit'],
  [/urlaub|reise|flug|hotel/i, 'reise'],
  [/berg|ski|wander/i, 'berg'],
  [/gesund|arzt|apotheke|zahn/i, 'gesundheit'],
  [/bildung|kurs|buch|schule|führerschein/i, 'bildung'],
  [/geschenk|geburtstag/i, 'geschenk'],
  [/hund|katze|tier/i, 'haustier'],
  [/spar|depot|rücklage|bauspar|etf/i, 'sparen'],
  [/gehalt|lohn|einkommen/i, 'gehalt'],
  [/konto|bank/i, 'konto'],
  [/wg|haushalt|putz/i, 'haushalt'],
];
export function symbolFor(name: string, chosen?: string | null): SymbolKey {
  if (isSymbol(chosen)) return chosen;
  return BY_NAME.find(([re]) => re.test(name))?.[1] ?? 'sonstiges';
}

export function SymbolIcon({
  name,
  color,
  size = 20,
}: {
  name: SymbolKey | UiSymbol;
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
  const shapes: Record<SymbolKey | UiSymbol, React.ReactNode> = {
    essen: (
      <>
        <Path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" {...s} />
        <Path d="M16 21V3c2.2 1 3.5 3.6 3.5 7v3H16" {...s} />
      </>
    ),
    einkauf: (
      <>
        <Path d="M5 8h14l-1.2 12H6.2L5 8Z" {...s} />
        <Path d="M9 8V6a3 3 0 0 1 6 0v2" {...s} />
      </>
    ),
    tanken: (
      <>
        <Path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10" {...s} />
        <Path d="M14 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3" {...s} />
      </>
    ),
    auto: (
      <>
        <Path d="M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2h3v-2M17 16v2h3v-2" {...s} />
        <Circle cx={8} cy={13} r={0.6} {...s} />
        <Circle cx={16} cy={13} r={0.6} {...s} />
      </>
    ),
    zug: (
      <>
        <Rect x={6} y={3} width={12} height={14} rx={3} {...s} />
        <Path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4" {...s} />
        <Circle cx={9.5} cy={13.5} r={0.6} {...s} />
        <Circle cx={14.5} cy={13.5} r={0.6} {...s} />
      </>
    ),
    wohnen: (
      <>
        <Path d="M3 11.5 12 4l9 7.5" {...s} />
        <Path d="M5.5 10v9.5h13V10M10 19.5v-5h4v5" {...s} />
      </>
    ),
    vertrag: (
      <>
        <Path d="M7 3h7l4 4v14H7V3Z" {...s} />
        <Path d="M14 3v4h4M10 12h5M10 16h5" {...s} />
      </>
    ),
    handy: (
      <>
        <Rect x={7} y={2.5} width={10} height={19} rx={2.5} {...s} />
        <Path d="M11 18.5h2" {...s} />
      </>
    ),
    freizeit: (
      <Path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"
        {...s}
      />
    ),
    kino: (
      <>
        <Rect x={3} y={6} width={18} height={13} rx={2} {...s} />
        <Path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4" {...s} />
      </>
    ),
    sport: <Path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" {...s} />,
    reise: (
      <Path
        d="M10.5 21l2-6.5L18 9a1.8 1.8 0 0 0-2.5-2.5L10 12 3.5 14l1.5 1.5 4.5-.5-.5 4.5 1.5 1.5Z"
        {...s}
      />
    ),
    berg: (
      <>
        <Path d="M3 19l6.5-11 4 6.5L16 11l5 8H3Z" {...s} />
        <Path d="M7.6 11.2l1.9 1.3 1.8-1.4" {...s} />
      </>
    ),
    gesundheit: (
      <Path
        d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"
        {...s}
      />
    ),
    bildung: (
      <>
        <Path d="M4 5.5A2 2 0 0 1 6 4h5v15H6a2 2 0 0 0-2 1.5v-15Z" {...s} />
        <Path d="M20 5.5A2 2 0 0 0 18 4h-5v15h5a2 2 0 0 1 2 1.5v-15Z" {...s} />
      </>
    ),
    geschenk: (
      <>
        <Rect x={4} y={9} width={16} height={11} rx={1.5} {...s} />
        <Path
          d="M3 9h18M12 9v11M12 9c-1.5-4-6-4-5-1.5S12 9 12 9Zm0 0c1.5-4 6-4 5-1.5S12 9 12 9Z"
          {...s}
        />
      </>
    ),
    haustier: (
      <>
        <Path
          d="M12 13c-3 0-5.5 3-5.5 5.2 0 1.6 1.6 2 3 1.4 1.2-.5 3.8-.5 5 0 1.4.6 3-.2 3-1.4C17.5 16 15 13 12 13Z"
          {...s}
        />
        <Circle cx={6} cy={10} r={1.6} {...s} />
        <Circle cx={18} cy={10} r={1.6} {...s} />
        <Circle cx={9.3} cy={6.2} r={1.6} {...s} />
        <Circle cx={14.7} cy={6.2} r={1.6} {...s} />
      </>
    ),
    sparen: (
      <>
        <Path
          d="M4 11a8 6 0 0 1 14.5-3.5L21 7v4l-2 1c-.4 2-1.8 3.6-3.5 4.4V19h-3v-2h-3v2H6.5v-3C5 15 4 13 4 11Z"
          {...s}
        />
        <Circle cx={15.5} cy={10} r={0.6} {...s} />
      </>
    ),
    konto: (
      <>
        <Rect x={3} y={5.5} width={18} height={13} rx={2.5} {...s} />
        <Path d="M3 10h18M7 15h4" {...s} />
      </>
    ),
    gehalt: (
      <>
        <Rect x={3} y={6.5} width={18} height={11} rx={2} {...s} />
        <Circle cx={12} cy={12} r={2.5} {...s} />
        <Path d="M6 9.5v5M18 9.5v5" {...s} />
      </>
    ),
    haushalt: (
      <>
        <Path d="M4 4h2l2.2 10.5h9.8L20 7H7" {...s} />
        <Circle cx={9.5} cy={19} r={1.3} {...s} />
        <Circle cx={16.5} cy={19} r={1.3} {...s} />
      </>
    ),
    sonstiges: <Path d="M12 4v16M5 8l14 8M19 8L5 16" {...s} />,
    datenbank: (
      <>
        <Path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z" {...s} />
        <Path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" {...s} />
      </>
    ),
    wolke: <Path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9H7Z" {...s} />,
    personen: (
      <>
        <Circle cx={9} cy={8} r={3.5} {...s} />
        <Path
          d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 2.9 3 6"
          {...s}
        />
      </>
    ),
    schloss: (
      <>
        <Rect x={5} y={10.5} width={14} height={10} rx={2} {...s} />
        <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...s} />
      </>
    ),
    mail: (
      <>
        <Rect x={3} y={5} width={18} height={14} rx={2} {...s} />
        <Path d="M3.5 6.5 12 13l8.5-6.5" {...s} />
      </>
    ),
    uhr: (
      <>
        <Circle cx={12} cy={12} r={8.5} {...s} />
        <Path d="M12 7.5V12l3 2" {...s} />
      </>
    ),
    pfeil: <Path d="M12 19V5M6 11l6-6 6 6" {...s} />,
    bank: <Path d="M3 9.5 12 4l9 5.5H3ZM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" {...s} />,
    stift: <Path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5 4 20ZM14 7l3 3" {...s} />,
    datei: (
      <>
        <Path d="M7 3h7l4 4v14H7V3Z" {...s} />
        <Path d="M14 3v4h4M10 12h5M10 16h5" {...s} />
      </>
    ),
    haken: <Path d="M5 12.5l4.5 4.5L19 7.5" {...s} />,
    pause: <Path d="M9 5.5v13M15 5.5v13" {...s} />,
    glocke: <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" {...s} />,
    schluessel: (
      <>
        <Circle cx={8} cy={15} r={4} {...s} />
        <Path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" {...s} />
      </>
    ),
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes[name]}
    </Svg>
  );
}
