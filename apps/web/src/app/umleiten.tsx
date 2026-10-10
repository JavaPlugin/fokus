// Umleiten (Artboard „Umleiten“): statt einer Sperre eine kleine Aufgabe. Aufgerufen von einer
// Kurzbefehle-Automation („Wenn Instagram geöffnet wird → URL öffnen“): /umleiten?app=instagram.
import { clock } from '@fokus/core';
import {
  Body,
  Button,
  CatTile,
  Notice,
  SymbolIcon,
  font,
  goalPalettes,
  kindColors,
  type,
  usePalette,
  useScheme,
} from '@fokus/ui';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '../components/BackButton';
import { PageHead } from '../components/PageHead';
import { api } from '../lib/api';

type Info = {
  label: string;
  url: string | null;
  insideSlot: boolean;
  nextSocial: string | null;
  task: { id: string; title: string; minutes: number } | null;
  fallback: string;
  bonus: number;
  spend: number;
  credit: { balance: number };
};

type Result =
  | { kind: 'done'; bonus: number; balance: number }
  | { kind: 'spent'; granted: number; short: number; balance: number };

export default function Umleiten() {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Info>(`/api/redirect?app=${encodeURIComponent(String(app ?? ''))}`)
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [app]);

  const open = () => {
    if (info?.url) void Linking.openURL(info.url);
    else goBack('/');
  };

  async function act(fn: () => Promise<Result>) {
    setBusy(true);
    setError('');
    try {
      setResult(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!info)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <PageHead title="Umleiten" />
        {error ? <Body muted>{error}</Body> : <ActivityIndicator color={p.ink3} />}
      </View>
    );

  const next = info.nextSocial ? clock(info.nextSocial) : null;
  const tint = goalPalettes.green;
  const card: ViewStyle =
    dark && Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(135deg, ${tint.from}, ${tint.to})`,
        } as unknown as ViewStyle)
      : {};

  const header = (title: string, text: string, sub: string) => (
    <>
      <CatTile color={kindColors.social} symbol="uhr" size={56} radius={16} />
      <Text style={[type.body, { color: p.ink2, marginTop: 24 }]}>{sub}</Text>
      <Text
        accessibilityRole="header"
        style={[type.title, { color: p.ink, fontSize: 30, lineHeight: 34, marginTop: 6 }]}
      >
        {title}
      </Text>
      <Text style={[type.body, { color: p.ink2, marginTop: 10, lineHeight: 22 }]}>{text}</Text>
    </>
  );

  let body;
  if (result) {
    body = (
      <>
        {header(
          result.kind === 'done' ? 'Geschafft.' : 'Viel Spaß.',
          result.kind === 'done'
            ? result.bonus
              ? `+${result.bonus} Min Scroll-Guthaben. Jetzt hast du ${result.balance} Min.`
              : `Kein Bonus mehr für heute. Dein Guthaben: ${result.balance} Min.`
            : result.granted
              ? `${result.granted} Min vom Guthaben genommen. Übrig: ${result.balance} Min.${result.short ? ` (Mehr war nicht da.)` : ''}`
              : 'Dein Guthaben ist leer oder das Tageslimit erreicht.',
          info.label,
        )}
        <View style={{ marginTop: 'auto', gap: 10 }}>
          {result.kind === 'done' ? (
            <Button label="Weiter mit FOKUS" onPress={() => goBack('/')} />
          ) : (
            <Button
              label={`${info.label} öffnen`}
              disabled={result.kind === 'spent' && !result.granted}
              onPress={open}
            />
          )}
          {result.kind === 'done' ? (
            <Button label="Trotzdem öffnen" variant="secondary" onPress={open} />
          ) : (
            <Button label="Zurück zu FOKUS" variant="secondary" onPress={() => goBack('/')} />
          )}
        </View>
      </>
    );
  } else if (info.insideSlot) {
    body = (
      <>
        {header(
          'Du bist im Social-Slot.',
          'Jetzt darfst du. Danach geht es weiter im Plan.',
          info.label,
        )}
        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Button label={`${info.label} öffnen`} onPress={open} />
          <Button label="Zurück zu FOKUS" variant="secondary" onPress={() => goBack('/')} />
        </View>
      </>
    );
  } else {
    const title = info.task?.title ?? info.fallback;
    const minutes = info.task?.minutes ?? 2;
    body = (
      <>
        {header(
          'Kurz was Kleines zuerst?',
          `${next ? `Dein nächster Social-Slot ist um ${next}. ` : 'Heute ist kein Social-Slot geplant. '}Diese Aufgabe dauert nur ${minutes} Minuten.`,
          `${info.label} · kein Social-Slot gerade`,
        )}
        <View
          style={[
            {
              marginTop: 28,
              borderRadius: 24,
              padding: 20,
              backgroundColor: dark ? tint.to : p.surface,
              borderWidth: 1,
              borderColor: dark ? 'rgba(255,255,255,0.06)' : p.surface2,
            },
            card,
          ]}
        >
          <Text style={[type.small, { color: dark ? tint.text : p.ink2 }]}>
            {info.task ? 'Aus deinem Plan' : 'Vorschlag'} · {minutes} Min
          </Text>
          <Text
            // @ts-expect-error dataSet gibt es nur in react-native-web
            dataSet={{ private: '' }}
            style={[type.section, { color: p.ink, marginTop: 6, fontFamily: font.semibold }]}
          >
            {title}
          </Text>
          {info.bonus ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <SymbolIcon name="uhr" color={dark ? tint.text : p.ink2} size={16} />
              <Text style={[type.small, { color: dark ? tint.text : p.ink2 }]}>
                Bringt +{info.bonus} Min Guthaben
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={{
            marginTop: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            backgroundColor: p.surface,
            borderRadius: 18,
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}
        >
          <Text style={[type.body, { color: p.ink2, fontSize: 14 }]}>Guthaben jetzt</Text>
          <Text
            style={[
              type.body,
              {
                color: p.ink,
                fontFamily: font.semibold,
                fontSize: 14,
                fontVariant: ['tabular-nums'],
              },
            ]}
          >
            {info.credit.balance} Min
          </Text>
        </View>
        {error ? <Notice tone="negative">{error}</Notice> : null}
        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Button
            label="Aufgabe machen"
            loading={busy}
            onPress={() =>
              act(async () => {
                const r = await api<{ bonus: number; credit: { balance: number } }>(
                  '/api/redirect/done',
                  {
                    body: info.task ? { taskId: info.task.id } : {},
                  },
                );
                return { kind: 'done', bonus: r.bonus, balance: r.credit.balance };
              })
            }
          />
          <Button
            label={`${info.spend} Min vom Guthaben nehmen`}
            variant="secondary"
            loading={busy}
            onPress={() =>
              act(async () => {
                const r = await api<{
                  granted: number;
                  short: number;
                  credit: { balance: number };
                }>('/api/credit/spend', { body: { minutes: info.spend, reason: 'redirect' } });
                return {
                  kind: 'spent',
                  granted: r.granted,
                  short: r.short,
                  balance: r.credit.balance,
                };
              })
            }
          />
          <Pressable
            accessibilityRole="button"
            onPress={open}
            style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={[type.body, { color: p.ink3, fontSize: 14 }]}>Trotzdem öffnen</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <PageHead title="Umleiten" />
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          alignSelf: 'center',
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
      >
        {body}
      </View>
    </View>
  );
}
