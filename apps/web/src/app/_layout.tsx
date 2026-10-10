import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from '@expo-google-fonts/geist';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useScheme } from '@fokus/ui';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UpdateBanner } from '../components/UpdateBanner';
import { AppProvider } from '../lib/app';
import { DayProvider } from '../lib/day';
import { UndoProvider } from '../lib/undo';
import { loadDisplay, loadScheme } from '../lib/theme';
import { initInstall } from '../lib/install';
import { initSession } from '../lib/session';
import { AuthGate } from '../components/AuthGate';

loadScheme();
loadDisplay();
initInstall();
initSession();

export default function RootLayout() {
  const dark = useScheme() === 'dark';
  // Hintergrund kommt vom <body> (CSS nach Hell/Dunkel in +html.tsx). Ein Wert aus dem Palette-Hook
  // würde beim Hydrieren der statischen Seite (immer hell gerendert) stehen bleiben.
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: 'transparent', card: 'transparent' },
  };
  // Schriftdateien werden mit der App ausgeliefert, nichts kommt von Google.
  // Web: Schriften kommen per CSS aus /fonts (+html.tsx), nativ aus dem Paket
  useFonts(
    Platform.OS === 'web'
      ? {}
      : { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold },
  );
  // Auch ohne geladene Schrift rendern (bis dahin Systemschrift): so steht jede Seite schon im
  // statischen HTML (Titel, Beschreibung, erster Inhalt ohne Warten auf JavaScript).
  return (
    <SafeAreaProvider>
      <AppProvider>
        <DayProvider>
          <UndoProvider>
            <StatusBar style="auto" />
            <View style={{ flex: 1 }}>
              <ThemeProvider value={theme}>
                <Stack screenOptions={{ headerShown: false }} />
              </ThemeProvider>
              <AuthGate />
            </View>
            <UpdateBanner />
          </UndoProvider>
        </DayProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
