// Farbwelt (Artboard „Farbwelt (Referenz)“): Flächen und Text bleiben schwarz/weiß/grau. Farbe nur
// in Kacheln, Punkten, Balken und getönten Karten. Alle Farbwerte stehen hier, nie in Komponenten.

/** Flächen (dunkel) von außen nach innen. */
export const surfaces = {
  page: '#000000',
  raised: '#0A0A0B',
  card: '#111113',
  control: '#1C1C1F',
} as const;

/** Schrift und Symbole auf farbigen Kacheln und getönten Karten. */
export const onAccent = '#FFFFFF';
/** Schrift auf hellen Knöpfen (z. B. weißer Senden-Pfeil). */
export const onLight = '#000000';

/** Akzent-Verläufe (135°) für Symbol-Kacheln. Graphit mit Rand für Neutrales. */
export const accents = {
  green: { from: '#30D158', to: '#1FA347' },
  orange: { from: '#FF9F43', to: '#E07B1F' },
  blue: { from: '#5AC8FA', to: '#2F8FD6' },
  violet: { from: '#BF5AF2', to: '#8E3BC4' },
  pink: { from: '#FF6B9A', to: '#D9437A' },
  red: { from: '#FF6B6B', to: '#E0454D' },
  yellow: { from: '#FFD60A', to: '#E0B000' },
  gray: { from: '#3A3A3C', to: '#1C1C1F', border: '#48484A' },
} as const;
export type Accent = keyof typeof accents;

/** Kategorie-Farben (Punkt, Balken). Schlüssel werden pro ID gespeichert. */
export const catColors = {
  orange: accents.orange.from,
  blue: accents.blue.from,
  violet: accents.violet.from,
  pink: accents.pink.from,
  yellow: accents.yellow.from,
  green: accents.green.from,
  red: accents.red.from,
  gray: '#8E8E93',
} as const;
export type CatColor = keyof typeof catColors;
export const CAT_COLOR_KEYS = Object.keys(catColors) as CatColor[];

/** Bedeutung der Farben in FOKUS: Fokus = Blau, Pause = Grün, Social = Violett, Warnung = Orange. */
export const kindColors = {
  focus: accents.blue.from,
  pause: accents.green.from,
  social: accents.violet.from,
  warning: accents.orange.from,
} as const;
export type Kind = keyof typeof kindColors;

/** Hero-Karte: dunkler radialer Verlauf mit grünem Leuchten oben rechts. */
export const hero = {
  base: '#0B0B0C',
  gradient:
    'radial-gradient(60% 60% at 90% 0%, rgba(48,209,88,0.16) 0%, rgba(48,209,88,0) 70%), radial-gradient(120% 120% at 0% 0%, #2A3F35 0%, #121A16 45%, #0B0B0C 100%)',
  border: 'rgba(255,255,255,0.06)',
} as const;

/** Standard nach Name (Konzept), sonst reihum nach Position. */
const BY_NAME: [RegExp, CatColor][] = [
  [/essen|lebensmittel|einkauf/i, 'orange'],
  [/tank|auto|sprit|mobil/i, 'blue'],
  [/andere/i, 'violet'],
  [/freizeit|kino|ausgehen|hobby/i, 'pink'],
  [/wohn|miete|haus/i, 'yellow'],
  [/sonstig/i, 'gray'],
];
const ROTATION: CatColor[] = ['orange', 'blue', 'violet', 'pink', 'yellow', 'green', 'red'];

/** Farbschlüssel einer Kategorie: gewählt, sonst nach Name, sonst reihum. */
export function catColorKey(
  id: string | null | undefined,
  name: string,
  index: number,
  chosen: Record<string, string> = {},
): CatColor {
  const c = id ? chosen[id] : undefined;
  if (c && c in catColors) return c as CatColor;
  if (!id) return 'gray';
  return BY_NAME.find(([re]) => re.test(name))?.[1] ?? ROTATION[index % ROTATION.length]!;
}
export const catColor = (...a: Parameters<typeof catColorKey>) => catColors[catColorKey(...a)];

/**
 * Tönungen: dunkle Verläufe für getönte Karten (Sparziele, Splits, Rückblick-Karte), Text hell und
 * getönt (Kontrast ≥ 4,5 : 1). amber = Orange, rose = Pink der Farbwelt.
 */
export const goalPalettes = {
  green: { from: '#1F3A2B', to: '#0E1A14', text: '#8FE3B0' },
  violet: { from: '#2B2340', to: '#15111F', text: '#C7B8FF' },
  blue: { from: '#10283A', to: '#0A161E', text: '#7CC8FF' },
  amber: { from: '#3A2A10', to: '#1E160A', text: '#FFC46B' },
  rose: { from: '#3A1020', to: '#1E0A12', text: '#FF8FB0' },
  teal: { from: '#163937', to: '#0B1C1B', text: '#86E5DA' },
  slate: { from: '#2A2D33', to: '#141518', text: '#D1D5DB' },
  red: { from: '#3F1D1B', to: '#1F0E0D', text: '#FFADA6' },
} as const;
export type GoalPalette = keyof typeof goalPalettes;
export const GOAL_KEYS = Object.keys(goalPalettes) as GoalPalette[];

export function goalPaletteKey(id: string, index: number, chosen: Record<string, string> = {}) {
  const c = chosen[id];
  return (c && c in goalPalettes ? c : GOAL_KEYS[index % GOAL_KEYS.length]!) as GoalPalette;
}

/** Rückblick: eigener radialer Verlauf je Karte. */
export const recapGradients = {
  saved: '#1F5C3D',
  budgets: '#1D3F73',
  busiest: '#12524F',
  topCategory: '#43286E',
  compare: '#6B4512',
} as const;
export const recapAccent = '#7EE2A8';

/** Farbe um einen Anteil abdunkeln (für Kachel-Verläufe „20 % dunkler“). */
export function darken(hex: string, amount = 0.2): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Kontrast nach WCAG (1 … 21). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [16, 8, 0].map((s) => {
      const c = ((n >> s) & 255) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Verlauf als CSS (Web). Nativ später expo-linear-gradient. */
export const linear = (from: string, to: string, angle = 135) =>
  `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
export const radial = (color: string) =>
  `radial-gradient(130% 70% at 15% 0%, ${color} 0%, #000000 65%)`;

/**
 * Zeichenfarbe auf einer Farbfläche: Weiß oder Schwarz, je nachdem, was mehr Kontrast hat
 * (helle Kategorie-Farben wie Orange und Gelb erreichen mit Weiß keine 4,5 : 1).
 */
export const onColor = (bg: string) =>
  contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000';

/** Farbe mit Deckkraft (getönte Flächen, z. B. Datumskachel). */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** Akzent-Verlauf zu einer Kategorie- oder Akzentfarbe (Grau → Graphit mit Rand). */
export function accentOf(color: string): { from: string; to: string; border?: string } {
  if (color === catColors.gray) return accents.gray;
  return (
    Object.values(accents).find((a) => a.from === color) ?? { from: color, to: darken(color, 0.2) }
  );
}

/** Farbe für Avatare (Initialen) aus dem Namen: immer gleich für dieselbe Person. */
export function avatarAccent(name: string): Accent {
  const keys: Accent[] = ['blue', 'pink', 'violet', 'orange', 'green', 'red', 'yellow'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return keys[h % keys.length]!;
}

/** Getönte Karte zu einem Akzent (Splits, Konten): passende Tönung aus goalPalettes. */
export const tintOf: Record<Accent, GoalPalette> = {
  green: 'green',
  orange: 'amber',
  blue: 'blue',
  violet: 'violet',
  pink: 'rose',
  red: 'red',
  yellow: 'amber',
  gray: 'slate',
};

/** Standard-Akzent eines Symbols (Splits haben keine eigene Farbe). */
export function symbolAccent(symbol: string): Accent {
  const map: Record<string, Accent> = {
    essen: 'orange',
    einkauf: 'orange',
    haushalt: 'orange',
    tanken: 'blue',
    auto: 'blue',
    zug: 'blue',
    reise: 'blue',
    berg: 'green',
    sport: 'green',
    wohnen: 'yellow',
    freizeit: 'pink',
    kino: 'pink',
    geschenk: 'pink',
    gesundheit: 'red',
    sparen: 'violet',
    bildung: 'violet',
    vertrag: 'violet',
    handy: 'violet',
  };
  return map[symbol] ?? 'gray';
}

/** Grundfarbe der Rückblick-Karte (unter dem radialen Verlauf). */
export const recapBase = '#0B2318';
/** Halbtransparentes Weiß auf getönten Flächen (Nebentext). */
export const onAccentDim = 'rgba(255,255,255,0.72)';
