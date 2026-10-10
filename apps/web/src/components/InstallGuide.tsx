// Anleitung „Zum Home-Bildschirm“: bebilderte Mini-Schritte im App-Stil mit tippendem Finger
// (CSS-Animation data-anim="tap", bei „weniger Bewegung“ statisch). Plattform aus lib/install.ts.
import { accents, Body, Button, CatTile, font, type, usePalette } from '@fokus/ui';
import { useState, type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useInstall } from '../lib/install';

/** Tipp-Kreis über einem Element. */
function Tap({ style }: { style?: ViewStyle }) {
  const p = usePalette();
  return (
    <View
      // @ts-expect-error dataSet gibt es nur in react-native-web
      dataSet={{ anim: 'tap' }}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 34,
          height: 34,
          borderRadius: 17,
          borderWidth: 2,
          borderColor: p.ink,
          backgroundColor: p.pill,
          opacity: 0.6,
        },
        style,
      ]}
    />
  );
}

/** Mini-Bildschirm mit Schrittnummer und Text darunter. */
function Step({ n, text, children }: { n: number; text: string; children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, minWidth: 96, gap: 8 }}>
      <View
        aria-hidden
        style={{
          height: 150,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: p.surface2,
          backgroundColor: p.surface,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        }}
      >
        {children}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={[type.small, { color: p.ink3, fontFamily: font.semibold }]}>{n}</Text>
        <Text style={[type.small, { color: p.ink2, flex: 1 }]}>{text}</Text>
      </View>
    </View>
  );
}

const ShareIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Path
      d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);
const PlusSquare = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Rect x={4} y={4} width={16} height={16} rx={3} stroke={color} strokeWidth={1.8} fill="none" />
    <Path d="M12 8v8M8 12h8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);
const Dots = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    {[6, 12, 18].map((y) => (
      <Circle key={y} cx={12} cy={y} r={1.8} fill={color} />
    ))}
  </Svg>
);

function IosSteps() {
  const p = usePalette();
  const bar: ViewStyle = {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: p.surface2,
  };
  const row = (label: string, on = false, icon?: ReactNode) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        height: 26,
        borderRadius: 6,
        backgroundColor: on ? p.pill : 'transparent',
      }}
    >
      {icon}
      <Text numberOfLines={1} style={[type.small, { fontSize: 10, color: on ? p.ink : p.ink3 }]}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Step n={1} text="Unten auf „Teilen“ tippen">
        <View style={bar}>
          <Text style={{ color: p.ink3 }}>‹</Text>
          <Text style={{ color: p.ink3 }}>›</Text>
          <View>
            <ShareIcon color={p.ink} />
            <Tap style={{ left: -8, top: -8 }} />
          </View>
          <Text style={{ color: p.ink3 }}>▢</Text>
        </View>
      </Step>
      <Step n={2} text="„Zum Home-Bildschirm“ wählen">
        <View style={{ padding: 8, gap: 4, backgroundColor: p.surface2 }}>
          {row('Kopieren')}
          <View>
            {row('Zum Home-Bildschirm', true, <PlusSquare color={p.ink} />)}
            <Tap style={{ right: 6, top: -4 }} />
          </View>
          {row('Lesezeichen')}
        </View>
      </Step>
      <Step n={3} text="Oben rechts „Hinzufügen“">
        <View style={{ flex: 1, padding: 8, gap: 10, backgroundColor: p.surface2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
            <Text style={[type.small, { fontSize: 9, color: p.ink3 }]}>Abbrechen</Text>
            <View>
              <Text style={[type.small, { fontSize: 9, color: p.ink, fontFamily: font.bold }]}>
                Hinzufügen
              </Text>
              <Tap style={{ right: 2, top: -12 }} />
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: p.ink,
              }}
            >
              <Text style={{ color: p.bg, fontFamily: font.bold }}>K</Text>
            </View>
            <Text style={[type.small, { fontSize: 10, color: p.ink }]}>FOKUS</Text>
          </View>
        </View>
      </Step>
    </View>
  );
}

function AndroidSteps() {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Step n={1} text="Oben rechts Menü ⋮">
        <View style={{ flex: 1, backgroundColor: p.surface2 }}>
          <View
            style={{
              height: 30,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 8,
            }}
          >
            <View style={{ flex: 1, height: 16, borderRadius: 8, backgroundColor: p.surface }} />
            <View style={{ marginLeft: 8 }}>
              <Dots color={p.ink} />
              <Tap style={{ left: -9, top: -9 }} />
            </View>
          </View>
        </View>
      </Step>
      <Step n={2} text="„App installieren“ tippen">
        <View style={{ padding: 8, gap: 4, backgroundColor: p.surface2 }}>
          {['Neuer Tab', 'App installieren', 'Verlauf'].map((l, i) => (
            <View
              key={l}
              style={{
                height: 26,
                justifyContent: 'center',
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: i === 1 ? p.pill : 'transparent',
              }}
            >
              <Text style={[type.small, { fontSize: 10, color: i === 1 ? p.ink : p.ink3 }]}>
                {l}
              </Text>
              {i === 1 ? <Tap style={{ right: 4, top: -4 }} /> : null}
            </View>
          ))}
        </View>
      </Step>
    </View>
  );
}

/** Ganze Anleitung für die erkannte Plattform. */
export function InstallGuide() {
  const p = usePalette();
  const { platform, standalone, canPrompt, prompt } = useInstall();
  const [done, setDone] = useState(false);

  if (standalone || done)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CatTile color={accents.green.from} symbol="haken" size={36} radius={10} />
        <Body>FOKUS ist auf deinem Home-Bildschirm.</Body>
      </View>
    );

  if (platform === 'ios' || platform === 'ios-other')
    return (
      <View style={{ gap: 14 }}>
        <IosSteps />
        <Text style={[type.small, { color: platform === 'ios-other' ? p.warning : p.ink3 }]}>
          {platform === 'ios-other'
            ? 'Geht nur in Safari: öffne diese Seite in Safari und mach es dort.'
            : 'Geht nur in Safari. Danach startet FOKUS wie eine App, ohne Adressleiste.'}
        </Text>
      </View>
    );

  if (platform === 'android')
    return canPrompt ? (
      <Button label="App installieren" onPress={() => void prompt().then(setDone)} />
    ) : (
      <View style={{ gap: 14 }}>
        <AndroidSteps />
        <Text style={[type.small, { color: p.ink3 }]}>
          In Chrome. Danach startet FOKUS wie eine App.
        </Text>
      </View>
    );

  return canPrompt ? (
    <Button label="App installieren" onPress={() => void prompt().then(setDone)} />
  ) : (
    <Body muted>
      Am Computer: in der Adressleiste rechts auf „Installieren“ klicken (Chrome, Edge). Am Handy
      geht es über Teilen bzw. das Menü.
    </Body>
  );
}
