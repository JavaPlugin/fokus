// Bausteine für Rechtstexte und Registrierung: markierte Betreiber-Stellen, Zustimmung zu den
// Nutzungsbedingungen.
import { Body, type, usePalette } from '@fokus/ui';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePublic } from '../lib/public';
import { useMe } from './HeadButtons';

/** Stelle, die der Betreiber ausfüllen oder prüfen muss: deutlich markiert. */
export function Fill({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.warning, fontStyle: 'italic' }}>[Betreiber: {children}]</Text>;
}

/** Hinweis nur für Admins: in diesem Text gibt es noch markierte Stellen. */
export function OperatorNote() {
  // Erst fragen, wer angemeldet ist, wenn überhaupt jemand angemeldet ist (sonst 401)
  const pub = usePublic();
  return pub?.signedIn ? <AdminNote /> : null;
}

function AdminNote() {
  const p = usePalette();
  const me = useMe();
  if (me?.role !== 'admin') return null;
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: p.surface2 }}>
      <Text style={[type.small, { color: p.warning }]}>
        Nur für Admins sichtbar: gelb markierte Stellen vor dem öffentlichen Start ausfüllen bzw.
        rechtlich prüfen lassen. Texte unter Admin-Panel → Rechtstexte, Name, Anschrift und E-Mail
        unter Admin-Panel → Impressum.
      </Text>
    </View>
  );
}

/** „Ich akzeptiere die Nutzungsbedingungen“ (Pflicht beim Anlegen eines Kontos). */
export function TermsCheck({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: value ? p.ink : 'transparent',
          borderWidth: value ? 0 : 1.5,
          borderColor: p.ink3,
        }}
      >
        {value ? <Text style={{ color: p.bg, fontSize: 13, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Body muted>
        Ich akzeptiere die{' '}
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/nutzungsbedingungen')}
          style={{ color: p.ink, textDecorationLine: 'underline' }}
        >
          Nutzungsbedingungen
        </Text>{' '}
        und habe die{' '}
        <Text
          accessibilityRole="link"
          onPress={() => router.push('/datenschutz')}
          style={{ color: p.ink, textDecorationLine: 'underline' }}
        >
          Datenschutzerklärung
        </Text>{' '}
        gelesen.
      </Body>
    </Pressable>
  );
}
