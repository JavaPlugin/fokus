// Glasflächen (Kopfzeile, Tab-Leiste, Hintergrund von Sheets). Im Web per CSS-Attribut
// (Regeln in apps/web/src/app/+html.tsx: backdrop-filter, Fallback ohne Blur), nativ später expo-blur.
import { Platform } from 'react-native';

export type GlassKind = 'bar' | 'head' | 'scrim' | 'overlay';

/** Props für eine Glasfläche: `<View {...glass('bar')} />`. Nativ leer (Hintergrund selbst setzen). */
export const glass = (kind: GlassKind): object =>
  Platform.OS === 'web' ? { dataSet: { glass: kind } } : {};

/** Nur nativ: deckender Ersatz, im Web kommt die Farbe aus dem CSS. */
export const isWeb = Platform.OS === 'web';
