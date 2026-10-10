// Anleitung „Umleiten einrichten“: eine PWA sieht nicht, welche App geöffnet wird. Eine
// Automation der iPhone-Kurzbefehle öffnet beim Start der Social-App FOKUS unter /umleiten.
import { Body, Chip, Chips, CatTile, font, kindColors, type, usePalette } from '@fokus/ui';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { API_BASE } from '../lib/api';
import { CopyBox } from './DevExtras';
import { Step, Tap } from './InstallGuide';

const APPS = [
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['x', 'X'],
  ['reddit', 'Reddit'],
] as const;

/** Zeile in einem Mini-Bildschirm. */
function Line({ text, strong }: { text: string; strong?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ height: 22, justifyContent: 'center', paddingHorizontal: 10 }}>
      <Text
        numberOfLines={1}
        style={[
          type.small,
          {
            fontSize: 11,
            color: strong ? p.ink : p.ink3,
            fontFamily: strong ? font.semibold : font.regular,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function RedirectGuide() {
  const [app, setApp] = useState<(typeof APPS)[number][0]>('instagram');
  const label = APPS.find(([k]) => k === app)![1];
  const url = `${API_BASE}/umleiten?app=${app}`;
  return (
    <View style={{ gap: 16 }}>
      <Chips>
        {APPS.map(([k, l]) => (
          <Chip key={k} label={l} selected={app === k} onPress={() => setApp(k)} />
        ))}
      </Chips>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Step n={1} text="Kurzbefehle → Automation → Neue Automation → App">
          <Line text="Automation" strong />
          <Line text="Neue Automation" />
          <Line text="App" strong />
          <Tap style={{ right: 16, bottom: 14 }} />
        </Step>
        <Step n={2} text={`${label} wählen, „Ist geöffnet“ an`}>
          <View style={{ padding: 10 }}>
            <CatTile color={kindColors.social} symbol="uhr" size={30} radius={9} />
          </View>
          <Line text={label} strong />
          <Line text="Ist geöffnet ✓" />
        </Step>
        <Step n={3} text="Aktion „URL öffnen“, Adresse unten, „Sofort ausführen“">
          <Line text="URL öffnen" strong />
          <Line text={url.replace(/^https?:\/\//, '')} />
          <Line text="Sofort ausführen ✓" />
        </Step>
      </View>
      <CopyBox label="Adresse" value={url} />
      <Body muted>
        Danach öffnet {label} zuerst FOKUS: Du machst eine kleine Aufgabe, nimmst Guthaben oder
        öffnest trotzdem. In einem Social-Slot geht es direkt weiter.
      </Body>
    </View>
  );
}
