// „Neue Version · Neu laden“: Der neue Service Worker wartet, bis man tippt. Dann übernimmt er
// und die App lädt an derselben Adresse neu. Nie mitten in der Nutzung still austauschen.
import { font, type, usePalette } from '@fokus/ui';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function UpdateBanner() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    )
      return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null;
    const watch = (r: ServiceWorkerRegistration) => {
      reg = r;
      // Wartet schon einer (z. B. App war im Hintergrund)? Nur melden, wenn es eine alte Version gibt.
      if (r.waiting && sw.controller) setWaiting(r.waiting);
      r.addEventListener('updatefound', () => {
        const next = r.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && sw.controller) setWaiting(next);
        });
      });
    };
    void sw.ready.then(watch);
    // Erst nach dem Tipp neu laden (controllerchange kommt nach SKIP_WAITING)
    const onChange = () => {
      if (!reloading.current) return;
      window.location.reload();
    };
    sw.addEventListener('controllerchange', onChange);
    // Beim Zurückkehren in die App nach Updates schauen
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reg?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sw.removeEventListener('controllerchange', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!waiting) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + 92,
        alignItems: 'center',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Neue Version verfügbar. Neu laden"
        onPress={() => {
          reloading.current = true;
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }}
        style={{
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          paddingHorizontal: 16,
          minHeight: 40,
          borderRadius: 20,
          backgroundColor: p.surface2,
        }}
      >
        <Text style={[type.small, { color: p.ink2 }]}>Neue Version</Text>
        <Text style={[type.small, { color: p.ink, fontFamily: font.semibold }]}>· Neu laden</Text>
      </Pressable>
    </View>
  );
}
