// Einführung: beim ersten Anmelden und aus dem Profil dieselbe Seite mit denselben Schritten.
// ?wieder=1: aus dem Profil (Fortschritt bleibt unverändert). ?schritt=install: nur der Schritt
// „Zum Home-Bildschirm“ (Profil-Kachel).
import {
  Body,
  Button,
  HeroCard,
  Notice,
  font,
  kindColors,
  type,
  usePalette,
  useReducedMotion,
} from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { enablePush, type PushState } from '../lib/push';
import { PageHead } from '../components/PageHead';
import { InstallGuide } from '../components/InstallGuide';
import { goBack } from '../components/BackButton';
import { isStandalone } from '../lib/install';

const STEPS = 3;
/** Schritt „Zum Home-Bildschirm“ (früh, gleich nach der Begrüßung). */
const INSTALL_STEP = 1;

export default function Einfuehrung() {
  return (
    <>
      <PageHead title="Einführung" />
      <EinfuehrungInhalt />
    </>
  );
}

function EinfuehrungInhalt() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { wieder, schritt } = useLocalSearchParams<{ wieder?: string; schritt?: string }>();
  const again = wieder === '1';
  const installOnly = schritt === 'install';
  const [step, setStep] = useState(installOnly ? INSTALL_STEP : 0);
  const [loaded, setLoaded] = useState(again);
  const fade = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  // Abgebrochene Einführung beim nächsten Start weiterführen
  useEffect(() => {
    if (again) return;
    api<{ step: number; done: boolean }>('/api/onboarding')
      .then((o) => setStep(Math.min(o.step, STEPS - 1)))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [again]);

  const progress = (s: number, done = false) =>
    again ? Promise.resolve() : api('/api/onboarding', { method: 'PUT', body: { step: s, done } });

  const close = () => goBack('/profil');
  async function finish() {
    if (again) return close();
    await progress(STEPS, true).catch(() => undefined);
    router.replace('/');
  }

  async function go(target: number) {
    if (installOnly) return close();
    // Schon installiert (Home-Bildschirm): Anleitung überspringen
    const next = target === INSTALL_STEP && isStandalone() ? target + 1 : target;
    if (next >= STEPS) return finish();
    await progress(next).catch(() => undefined);
    if (reduced) return setStep(next);
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  if (!loaded) return <View style={{ flex: 1, backgroundColor: p.bg }} />;

  const screens: ReactNode[] = [
    <Welcome key="w" onNext={() => go(1)} />,
    <InstallStep key="i" onNext={() => go(INSTALL_STEP + 1)} />,
    <Finish key="s" onDone={finish} />,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          gap: 16,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Schritt ${step + 1} von ${STEPS}`}
          style={{ flexDirection: 'row', gap: 4, flex: 1 }}
        >
          {Array.from({ length: STEPS }, (_, i) => (
            <View
              key={i}
              style={{
                height: 3,
                width: i === step ? 22 : 10,
                borderRadius: 2,
                backgroundColor: i <= step ? p.ink : p.surface2,
              }}
            />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={again ? close : finish} hitSlop={10}>
          <Text style={[type.small, { color: p.ink2 }]}>
            {again ? 'Schließen' : 'Überspringen'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 20,
          paddingBottom: insets.bottom + 24,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <Animated.View style={{ flex: 1, opacity: fade, gap: 16 }}>{screens[step]}</Animated.View>
      </ScrollView>
    </View>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[type.title, { color: p.ink, fontSize: 30 }]}>
        {title}
      </Text>
      <Body muted>{text}</Body>
    </View>
  );
}

function InstallStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
      <View style={{ gap: 20, paddingTop: 12 }}>
        <Heading
          title="Hol dir FOKUS auf den Home-Bildschirm"
          text="Dann startet es wie eine App: ohne Adressleiste, mit Mitteilungen, immer einen Tipp entfernt."
        />
        <InstallGuide />
      </View>
      <Button label="Weiter" onPress={onNext} />
    </View>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const p = usePalette();
  const segs: [number, string][] = [
    [40, kindColors.focus],
    [12, kindColors.pause],
    [28, kindColors.focus],
    [14, kindColors.social],
  ];
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
      <View style={{ alignItems: 'center', paddingTop: 40 }}>
        <View
          accessibilityLabel="Beispiel: Scroll-Guthaben 45 Minuten"
          style={{ width: 260, gap: 10 }}
        >
          <HeroCard>
            <Text style={[type.small, { color: p.ink2 }]}>Scroll-Guthaben</Text>
            <Text style={[type.title, { color: p.ink, fontVariant: ['tabular-nums'] }]}>
              45<Text style={{ color: p.ink3 }}> Min.</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
              {segs.map(([f, c], i) => (
                <View key={i} style={{ flex: f, backgroundColor: c, borderRadius: 3 }} />
              ))}
            </View>
            <Text style={[type.small, { color: p.ink3 }]}>Fokus · Pause · Fokus · Social</Text>
          </HeroCard>
        </View>
      </View>
      <View style={{ gap: 16 }}>
        <Heading
          title="Produktive Zeit verdient Scroll-Zeit"
          text="FOKUS plant Arbeit, Pausen und bewusste Social-Slots. Eine Stunde Fokus bringt dir 15 Minuten Guthaben. Gesperrt wird nichts."
        />
        <Button label="Los geht’s" onPress={onNext} />
      </View>
    </View>
  );
}

function Finish({ onDone }: { onDone: () => void }) {
  const p = usePalette();
  const [push, setPush] = useState<PushState | null>(null);
  const ios =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad/.test(navigator.userAgent);
  const installed =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)').matches;
  return (
    <>
      <Heading
        title="Fast fertig"
        text="Eine Sache noch. Danach siehst du auf „Heute“ deinen Tag."
      />
      <View style={{ gap: 12, backgroundColor: p.surface, borderRadius: 18, padding: 16 }}>
        <Text style={[type.body, { color: p.ink, fontFamily: font.semibold }]}>Mitteilungen</Text>
        <Body muted>Eine Erinnerung vor jedem Fokus-Block und Social-Slot.</Body>
        {ios && !installed ? (
          <Notice tone="warning">
            Auf dem iPhone geht das erst, wenn FOKUS auf dem Home-Bildschirm liegt.
          </Notice>
        ) : push === 'on' ? (
          <Notice tone="positive">Mitteilungen sind an.</Notice>
        ) : push === 'denied' || push === 'unsupported' ? (
          <Notice tone="warning">Dieser Browser erlaubt keine Mitteilungen.</Notice>
        ) : (
          <Button
            label="Mitteilungen erlauben"
            variant="secondary"
            onPress={() =>
              void enablePush()
                .then(setPush)
                .catch(() => setPush('unsupported'))
            }
          />
        )}
      </View>
      <Button label="Zu meinem Tag" onPress={onDone} />
    </>
  );
}
