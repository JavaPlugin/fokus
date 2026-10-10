// Design-Tokens aus dem Konzept (Abschnitt 3). Dark ist Standard, Light die Ableitung.
// Farbe trägt Bedeutung: positive = Geld kommt zu dir, warning = handeln, negative = überzogen.

export const colors = {
  dark: {
    bg: '#000000',
    surface: '#111113',
    surface2: '#1C1C1F',
    ink: '#F5F5F7',
    ink2: '#A1A1A6',
    ink3: '#8E8E93',
    /** Sehr leise Zwischenzeilen (z. B. Gruppen in der Planung). */
    ink4: '#636366',
    positive: '#30D158',
    warning: '#FFB340',
    negative: '#FF453A',
    /** Aktiver Tab auf Glas (helle Pille). */
    pill: 'rgba(255,255,255,0.14)',
  },
  light: {
    bg: '#FFFFFF',
    surface: '#F5F5F7',
    surface2: '#EBEBF0',
    ink: '#000000',
    ink2: '#3C3C43',
    ink3: '#6E6E73',
    ink4: '#636366',
    positive: '#248A3D',
    warning: '#B25000',
    negative: '#D70015',
    pill: 'rgba(0,0,0,0.07)',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { [K in keyof (typeof colors)['dark']]: string };

/** Eine Schriftfamilie: Geist. Beträge mit tabular-nums, kein Mono. */
export const font = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
} as const;

export const type = {
  hero: { fontSize: 64, fontFamily: font.semibold, letterSpacing: -2 },
  title: { fontSize: 34, fontFamily: font.bold, letterSpacing: -0.8 },
  section: { fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.3 },
  body: { fontSize: 15, fontFamily: font.regular },
  small: { fontSize: 13, fontFamily: font.regular },
  tab: { fontSize: 10, fontFamily: font.medium },
} as const;

export const radius = { card: 18, chip: 17, button: 27, sheet: 28 } as const;

/** 4er-Raster. Seitenrand 20, Abschnitte 28, Zeilen mindestens 52 hoch. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32 } as const;
export const layout = { gutter: 20, section: 28, rowMin: 52, touchMin: 44 } as const;

export const motion = { sheetSpring: { damping: 26, stiffness: 300 }, sheetDuration: 350 } as const;
