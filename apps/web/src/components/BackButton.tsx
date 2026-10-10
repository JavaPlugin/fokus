// Zurück, das immer funktioniert: Liegt im eigenen Stack eine Seite darunter, einen Schritt
// zurück. Sonst (Einstieg über einen Link aus E-Mail oder Mitteilung, frischer Tab) zur
// Elternseite. canGoBack() reicht nicht: der Tab-Navigator „kann“ immer zum ersten Tab zurück.
import { type, usePalette } from '@fokus/ui';
import { router, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

export function goBack(parent: Href) {
  if (router.canDismiss()) router.back();
  else router.replace(parent);
}

export function BackButton({ parent, label }: { parent: Href; label: string }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Zurück zu ${label}`}
      onPress={() => goBack(parent)}
      hitSlop={10}
      style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={[type.body, { color: p.ink2 }]}>‹ {label}</Text>
    </Pressable>
  );
}
