// Schutz vor einfachen Bots bei der Registrierung: ein für Menschen unsichtbares Feld (bleibt
// leer) und der Zeitpunkt, an dem das Formular erschien. Die API prüft beides (signup.ts).
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

export function useBotGuard() {
  const startedAt = useRef(Date.now()).current;
  const [website, setWebsite] = useState('');
  const field = (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}
    >
      <TextInput
        value={website}
        onChangeText={setWebsite}
        autoComplete="off"
        // Nicht per Tab erreichbar
        {...({ tabIndex: -1, name: 'website' } as object)}
      />
    </View>
  );
  return { field, fields: () => ({ website, startedAt }) };
}
