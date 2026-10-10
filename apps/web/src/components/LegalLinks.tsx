import { type, usePalette } from '@fokus/ui';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

/** Fußzeile mit Impressum, Datenschutz und Nutzungsbedingungen (auf jeder öffentlichen Seite). */
export function LegalLinks() {
  const p = usePalette();
  const link = (label: string, href: '/impressum' | '/datenschutz' | '/nutzungsbedingungen') => (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} hitSlop={8}>
      <Text style={[type.small, { color: p.ink3 }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center' }}>
      {link('Impressum', '/impressum')}
      {link('Datenschutz', '/datenschutz')}
      {link('Nutzungsbedingungen', '/nutzungsbedingungen')}
    </View>
  );
}
