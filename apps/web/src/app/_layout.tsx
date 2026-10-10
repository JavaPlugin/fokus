import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from '@expo-google-fonts/geist';
import { usePalette } from '@fokus/ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UpdateBanner } from '../components/UpdateBanner';
import { AppProvider } from '../lib/app';
import { DayProvider } from '../lib/day';
import { PrivacyProvider } from '../lib/privacy';
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
  // Schriftdateien werden mit der App ausgeliefert, nichts kommt von Google.
  // Web: Schriften kommen per CSS aus /fonts (+html.tsx), nativ aus dem Paket
  useFonts(
    Platform.OS === 'web'
      ? {}
      : { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold },
  );
  const p = usePalette();
  // Auch ohne geladene Schrift rendern (bis dahin Systemschrift): so steht jede Seite schon im
  // statischen HTML (Titel, Beschreibung, erster Inhalt ohne Warten auf JavaScript).
  return (
    <SafeAreaProvider>
      <AppProvider>
        <DayProvider>
          <PrivacyProvider>
            <UndoProvider>
              <StatusBar style="auto" />
              <View style={{ flex: 1 }}>
                <Stack
                  screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}
                />
                <AuthGate />
              </View>
              <UpdateBanner />
            </UndoProvider>
          </PrivacyProvider>
        </DayProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
