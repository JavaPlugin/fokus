import { Body, usePalette } from '@fokus/ui';
import { Redirect, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CaptureSheet } from '../../components/CaptureSheet';
import { CommandPalette } from '../../components/CommandPalette';
import { InTabs } from '../../components/Screen';
import { PageHead } from '../../components/PageHead';
import { PagerTabs as Tabs } from '../../components/PagerTabs';
import { TabBar } from '../../components/TabBar';
import { TermsNotice } from '../../components/TermsNotice';
import { api, bootState } from '../../lib/api';
import { useDay } from '../../lib/day';

type Boot = Awaited<ReturnType<typeof bootState>> | { kind: 'error'; message: string } | null;

/** Titel der Tabs (alle Tab-Seiten liegen nebeneinander, daher hier nach Adresse). */
function tabTitle(path: string) {
  if (path.startsWith('/woche')) return 'Woche';
  if (path.startsWith('/inbox')) return 'Inbox';
  if (path.startsWith('/fokus')) return 'Fokus';
  return 'Heute';
}

export default function TabsLayout() {
  const path = usePathname();
  return (
    <>
      <PageHead title={tabTitle(path)} />
      <TabsContent />
    </>
  );
}

function TabsContent() {
  const p = usePalette();
  const [boot, setBoot] = useState<Boot>(null);
  // Ziel merken: nach dem Login geht es dorthin zurück (z. B. Link aus einer E-Mail).
  // Adresse vom ersten Rendern: solange hier nur der Ladekreis steht, schreibt der Router die
  // Adresse um. Im Web daher die ursprüngliche aus window.location merken.
  const routerPath = usePathname();
  const [initial] = useState(() =>
    typeof window !== 'undefined' && window.location
      ? window.location.pathname + window.location.search
      : null,
  );
  const path = initial ?? routerPath;
  // Neue Nutzer: erst die Einführung (abgebrochene geht beim nächsten Start weiter)
  const [intro, setIntro] = useState(false);
  const { reload } = useDay();

  useEffect(() => {
    bootState()
      .then((b) => {
        setBoot(b);
        if (b.kind === 'ready') {
          void reload();
          void api<{ done: boolean }>('/api/onboarding')
            .then((o) => setIntro(!o.done))
            .catch(() => undefined);
        }
      })
      .catch((e: Error) => setBoot({ kind: 'error', message: e.message }));
  }, []);

  if (!boot) {
    return (
      <View
        style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={p.ink3} />
      </View>
    );
  }
  if (boot.kind === 'setup') return <Redirect href="/setup" />;
  if (boot.kind === 'login')
    return (
      <Redirect
        href={path && path !== '/' ? `/willkommen?next=${encodeURIComponent(path)}` : '/willkommen'}
      />
    );
  if (intro) return <Redirect href="/einfuehrung" />;
  if (boot.kind === 'error') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: p.bg,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Body muted>{boot.message}</Body>
      </View>
    );
  }

  return (
    <>
      <InTabs.Provider value>
        <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
          <Tabs.Screen name="index" options={{ title: 'Heute' }} />
          <Tabs.Screen name="woche" options={{ title: 'Woche' }} />
          <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
          <Tabs.Screen name="fokus" options={{ title: 'Fokus' }} />
        </Tabs>
      </InTabs.Provider>
      <CaptureSheet />
      <CommandPalette />
      <TermsNotice />
    </>
  );
}
