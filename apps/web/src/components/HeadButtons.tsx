// Runder Avatar rechts in der Kopfzeile → Profil.
import { font, type, usePalette } from '@fokus/ui';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, type Me } from '../lib/api';
import { initials } from '../lib/format';

let cached: Me | null = null;
const listeners = new Set<(m: Me) => void>();

/** Angemeldete Person (einmal geladen, danach aus dem Speicher). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    listeners.add(setMe);
    if (!cached)
      api<Me>('/api/me')
        .then((m) => setMe((cached = m)))
        .catch(() => undefined);
    return () => void listeners.delete(setMe);
  }, []);
  return me;
}

/** Nach einer Änderung (z. B. Name) überall neu zeigen. */
export function rememberMe(patch: Partial<Me>) {
  if (!cached) return;
  cached = { ...cached, ...patch };
  listeners.forEach((l) => l(cached!));
}

export function HeadButton({
  label,
  onPress,
  children,
  light,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  /** Weiß (Avatar) statt Glas-Pille. */
  light?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: light ? p.ink : p.pill,
      }}
    >
      {children}
    </Pressable>
  );
}

export function HeadButtons({ children }: { children?: ReactNode }) {
  const p = usePalette();
  const me = useMe();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {children}
      <HeadButton label="Profil" onPress={() => router.push('/profil')} light>
        <Text style={[type.small, { color: p.bg, fontFamily: font.semibold }]}>
          {me ? initials(me.name || me.email) : '·'}
        </Text>
      </HeadButton>
    </View>
  );
}
