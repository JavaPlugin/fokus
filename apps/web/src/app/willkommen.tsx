// Startseite für alle, die nicht angemeldet sind (Artboard „Willkommen (nicht angemeldet)“).
// Bewegung nur per CSS (data-anim, Regeln in +html.tsx); bei „weniger Bewegung“ steht alles still.
import {
  accents,
  Button,
  CatTile,
  font,
  goalPalettes,
  HeroCard,
  onAccent,
  kindColors,
  SymbolIcon,
  type,
  usePalette,
  useScheme,
  type SymbolKey,
  type UiSymbol,
} from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { LegalLinks } from '../components/LegalLinks';
import { PageHead } from '../components/PageHead';
import { Screen } from '../components/Screen';
import { safeNext } from '../lib/nav';
import { usePublic } from '../lib/public';

const anim = (name: 'float' | 'float2' | 'grow' | 'in', delay = 0) => ({
  dataSet: { anim: name },
  style: { animationDelay: `${delay}ms` } as unknown as ViewStyle,
});

export default function Willkommen() {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);
  const pub = usePublic();
  const open = pub?.registrationMode === 'open';
  useEffect(() => {
    // Schon angemeldet: direkt in die App
    if (pub?.signedIn) router.replace(next);
  }, [pub?.signedIn, next]);

  const start = () =>
    router.push({ pathname: open || !pub ? '/registrieren' : '/login', params: { next } });
  const login = () => router.push({ pathname: '/login', params: { next } });

  const pill = (symbol: SymbolKey | UiSymbol, color: string, text: string) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 14,
        borderRadius: 20,
        backgroundColor: p.surface,
        borderWidth: 1,
        borderColor: p.surface2,
      }}
    >
      <CatTile color={color} symbol={symbol} size={22} radius={7} />
      <Text style={[type.small, { color: p.ink, fontFamily: font.semibold }]}>{text}</Text>
    </View>
  );

  const eyebrow = (text: string, color: string) => (
    <Text
      style={[
        type.small,
        {
          color: dark ? color : p.ink2,
          fontFamily: font.semibold,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
      ]}
    >
      {text}
    </Text>
  );

  const section = (label: ReactNode, title: string, text: string, visual: ReactNode, delay = 0) => (
    <View {...anim('in', delay)} style={[anim('in', delay).style, { gap: 12 }]}>
      {label}
      <Text accessibilityRole="header" style={[type.title, { color: p.ink, fontSize: 28 }]}>
        {title}
      </Text>
      <Text style={[type.body, { color: p.ink2, lineHeight: 22 }]}>{text}</Text>
      {visual}
    </View>
  );

  const card = (children: ReactNode, tint?: keyof typeof goalPalettes) => (
    <View
      style={[
        { borderRadius: 22, padding: 20, gap: 16, backgroundColor: p.surface },
        tint && dark
          ? ({
              backgroundImage: `linear-gradient(160deg, ${goalPalettes[tint].from} 0%, ${goalPalettes[tint].to} 100%)`,
            } as unknown as ViewStyle)
          : null,
      ]}
    >
      {children}
    </View>
  );

  return (
    <Screen>
      <PageHead
        title="Produktive Zeit verdient Scroll-Zeit"
        description="FOKUS plant deinen Tag mit Arbeit, Pausen und bewussten Social-Slots. Statt einer Sperre bekommst du eine kleine Aufgabe als Alternative. Ohne Werbung, ohne Tracking."
        social
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: p.ink,
            }}
          >
            <Text style={{ color: p.bg, fontFamily: font.bold, fontSize: 16 }}>F</Text>
          </View>
          <Text style={[type.section, { color: p.ink, fontFamily: font.bold }]}>FOKUS</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={login}
          style={{
            paddingHorizontal: 16,
            minHeight: 38,
            justifyContent: 'center',
            borderRadius: 19,
            backgroundColor: p.surface2,
          }}
        >
          <Text style={[type.small, { color: p.ink, fontFamily: font.semibold }]}>Anmelden</Text>
        </Pressable>
      </View>

      {/* Hero: schwebende Karte mit wachsendem Farbbalken und schwebenden Pillen */}
      <View aria-hidden style={{ gap: 14, paddingVertical: 8 }}>
        <View {...anim('float2')} style={{ alignItems: 'flex-start' }}>
          {pill('uhr', kindColors.focus, 'Fokus · noch 32 Min.')}
        </View>
        <View {...anim('float')} style={{ paddingHorizontal: 24 }}>
          <HeroCard>
            <Text style={[type.small, { color: p.ink2 }]}>Scroll-Guthaben</Text>
            <Text style={[type.hero, { color: p.ink, fontVariant: ['tabular-nums'] }]}>
              45<Text style={{ color: p.ink3 }}> Min.</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, height: 6 }}>
              {[
                [kindColors.focus, 0.4, 0],
                [kindColors.pause, 0.12, 150],
                [kindColors.focus, 0.28, 300],
                [kindColors.social, 0.14, 450],
              ].map(([color, w, d], i) => (
                <View
                  key={i}
                  {...anim('grow', Number(d))}
                  style={[
                    anim('grow', Number(d)).style,
                    {
                      width: `${Number(w) * 100}%`,
                      borderRadius: 3,
                      backgroundColor: String(color),
                    },
                  ]}
                />
              ))}
            </View>
          </HeroCard>
        </View>
        <View {...anim('float2')} style={{ alignItems: 'flex-end' }}>
          {pill('uhr', kindColors.social, 'Social-Slot um 18:00')}
        </View>
        <View {...anim('float')} style={{ alignItems: 'flex-start' }}>
          {pill('personen', accents.green.from, 'Lena fokussiert mit dir')}
        </View>
      </View>

      <View style={{ gap: 14 }}>
        <Text
          accessibilityRole="header"
          aria-level={1}
          style={[type.title, { color: p.ink, fontSize: 36, lineHeight: 40 }]}
        >
          Scrollen darfst du. Du planst es nur.
        </Text>
        <Text style={[type.body, { color: p.ink2, fontSize: 17, lineHeight: 24 }]}>
          Fokus-Zeit verdient Scroll-Guthaben. Wer zur falschen Zeit scrollen will, bekommt eine
          kleine Aufgabe statt einer Sperre.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button
          label={open || !pub ? 'Kostenlos starten' : 'Ich habe schon ein Konto'}
          onPress={start}
        />
        {open || !pub ? (
          <Button label="Ich habe schon ein Konto" variant="secondary" onPress={login} />
        ) : (
          <Text style={[type.small, { color: p.ink3, textAlign: 'center' }]}>
            Neue Konten gibt es zurzeit nur mit Einladung.
          </Text>
        )}
      </View>

      {section(
        eyebrow('Tagesplan', goalPalettes.blue.text),
        'FOKUS verteilt deine Aufgaben.',
        'Aufgaben rein, freie Zeitblöcke raus. Schweres in deinen Hochphasen, Kleines in die Lücken.',
        card(
          <>
            {[
              ['09:00', 'Steuererklärung', kindColors.focus],
              ['09:50', 'Pause', kindColors.pause],
              ['10:00', 'Angebot schreiben', kindColors.focus],
              ['18:00', 'Social-Slot', kindColors.social],
            ].map(([t, label, color]) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={[type.small, { color: p.ink3, fontVariant: ['tabular-nums'] }]}>
                  {t}
                </Text>
                <View
                  style={{
                    width: 4,
                    alignSelf: 'stretch',
                    borderRadius: 2,
                    backgroundColor: color,
                  }}
                />
                <Text style={[type.body, { color: p.ink, flex: 1 }]}>{label}</Text>
              </View>
            ))}
          </>,
        ),
      )}

      {section(
        eyebrow('Umleiten', goalPalettes.violet.text),
        'Eine Aufgabe statt einer Sperre.',
        'Öffnest du Instagram außerhalb eines Slots, zeigt FOKUS eine 2-Minuten-Aufgabe. Du entscheidest.',
        card(
          <>
            <Text style={[type.section, { color: dark ? onAccent : p.ink }]}>
              Erst kurz: Glas Wasser holen
            </Text>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}
            >
              {pill('haken', kindColors.focus, 'Aufgabe machen')}
              {pill('uhr', kindColors.social, '10 Min. vom Guthaben')}
            </View>
          </>,
          'violet',
        ),
      )}

      {section(
        eyebrow('Deine Daten', goalPalettes.green.text),
        'Deine Daten gehören dir.',
        'Kein Verkauf, keine Auswertung, keine Werbung. Export und Löschen jederzeit mit einem Tipp.',
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(
            [
              ['schloss', accents.green.from, 'Privat', 'kein Tracking'],
              ['schluessel', accents.blue.from, 'Sicher', 'Daten verschlüsselt'],
              ['haken', accents.violet.from, 'Werbefrei', 'ohne Tracker'],
            ] as const
          ).map(([s, c, t, d]) => (
            <View
              key={t}
              style={{
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: p.surface,
              }}
            >
              <CatTile color={c} symbol={s} size={32} radius={9} />
              <View>
                <Text style={[type.body, { color: p.ink, fontFamily: font.semibold }]}>{t}</Text>
                <Text style={[type.small, { color: p.ink3 }]}>{d}</Text>
              </View>
            </View>
          ))}
        </View>,
      )}

      <View style={{ gap: 12 }}>
        <Button
          label={open || !pub ? 'Kostenlos starten' : 'Ich habe schon ein Konto'}
          onPress={start}
        />
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <SymbolIcon name="haken" color={p.ink3} size={16} />
        <Text style={[type.small, { color: p.ink3, textAlign: 'center' }]}>
          Ohne Werbung, ohne Tracking. Deine Daten werden nicht verkauft.
        </Text>
      </View>
      <LegalLinks />
    </Screen>
  );
}
