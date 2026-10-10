// Einführung: beim ersten Anmelden und aus dem Profil dieselbe Seite mit denselben Schritten.
// ?wieder=1: aus dem Profil (Fortschritt bleibt unverändert). ?schritt=install: nur der Schritt
// „Zum Home-Bildschirm“ (Profil-Kachel).
import {
  Body,
  Button,
  Chip,
  Chips,
  Field,
  HeroCard,
  Notice,
  kindColors,
  type,
  usePalette,
  useReducedMotion,
} from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { PageHead } from '../components/PageHead';
import { InstallGuide } from '../components/InstallGuide';
import { RedirectGuide } from '../components/RedirectGuide';
import { goBack } from '../components/BackButton';

const STEPS = 3;

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
  const redirectOnly = schritt === 'umleiten';
  const [step, setStep] = useState(0);
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
    if (installOnly || redirectOnly) return close();
    const next = target;
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
    <HoursStep key="h" onNext={() => go(2)} />,
    <FirstTask key="t" onDone={finish} />,
  ];
  // Aus dem Profil: nur der gewünschte Schritt
  const only = installOnly ? (
    <InstallStep onNext={close} />
  ) : redirectOnly ? (
    <RedirectStep onNext={close} />
  ) : null;

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
        <Animated.View style={{ flex: 1, opacity: fade, gap: 16 }}>
          {only ?? screens[step]}
        </Animated.View>
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

function RedirectStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
      <View style={{ gap: 20, paddingTop: 12 }}>
        <Heading
          title="Umleiten statt sperren"
          text="Öffnest du Instagram oder TikTok außerhalb eines Social-Slots, zeigt FOKUS dir eine kleine Aufgabe. Richte das einmal in den Kurzbefehlen ein (iPhone)."
        />
        <RedirectGuide />
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
          text="Je 1 Std. Fokus bekommst du 15 Min. Scroll-Guthaben für Social Media. FOKUS plant deine Aufgaben in deine Arbeitszeit. Gesperrt wird nichts."
        />
        <Button label="Los geht’s" onPress={onNext} />
      </View>
    </View>
  );
}

const DAYS_ON = [1, 2, 3, 4, 5];

/** Schritt 2: Arbeitszeiten für Mo–Fr (Feinheiten später unter Profil → Arbeitszeiten). */
function HoursStep({ onNext }: { onNext: () => void }) {
  const p = usePalette();
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const week = Array.from({ length: 7 }, (_, i) => (DAYS_ON.includes(i) ? { from, to } : null));
      await api('/api/plan/settings', { method: 'PUT', body: { week } });
      onNext();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chips = (values: string[], value: string, set: (v: string) => void) => (
    <Chips>
      {values.map((v) => (
        <Chip key={v} label={`${v} Uhr`} selected={value === v} onPress={() => set(v)} />
      ))}
    </Chips>
  );
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
      <View style={{ gap: 20, paddingTop: 12 }}>
        <Heading
          title="Wann arbeitest du?"
          text="Automatische Aufgaben plant FOKUS nur in diese Zeit, Montag bis Freitag. Aufgaben mit fester Zeit gehen immer. Einzelne Tage änderst du später im Profil."
        />
        <View style={{ gap: 10 }}>
          <Text style={[type.small, { color: p.ink2 }]}>Beginn</Text>
          {chips(['07:00', '08:00', '09:00', '10:00'], from, setFrom)}
          <Text style={[type.small, { color: p.ink2, marginTop: 6 }]}>Ende</Text>
          {chips(['15:00', '16:00', '17:00', '18:00', '19:00'], to, setTo)}
        </View>
        {error ? <Notice tone="negative">{error}</Notice> : null}
      </View>
      <Button label="Weiter" loading={busy} disabled={from >= to} onPress={save} />
    </View>
  );
}

/** Schritt 3: die erste Aufgabe (oder überspringen). */
function FirstTask({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function make() {
    setBusy(true);
    setError('');
    try {
      await api('/api/tasks', { body: { title: title.trim(), minutes, schedule: 'auto' } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
      <View style={{ gap: 20, paddingTop: 12 }}>
        <Heading
          title="Deine erste Aufgabe"
          text="FOKUS sucht einen freien Platz in deiner Arbeitszeit. Wenn du sie fokussiert erledigst, bekommst du Scroll-Guthaben."
        />
        <Field
          label="Was?"
          value={title}
          onChangeText={setTitle}
          placeholder="z. B. Angebot schreiben"
        />
        <Chips>
          {[15, 30, 60, 120].map((m) => (
            <Chip
              key={m}
              label={m >= 60 ? `${m / 60} Std` : `${m} Min`}
              selected={minutes === m}
              onPress={() => setMinutes(m)}
            />
          ))}
        </Chips>
        {error ? <Notice tone="negative">{error}</Notice> : null}
      </View>
      <View style={{ gap: 10 }}>
        <Button label="Aufgabe anlegen" loading={busy} disabled={!title.trim()} onPress={make} />
        <Button label="Später" variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
}
