// Fokus-Modus (Artboard „Fokus-Modus“): großer Timer-Ring, Guthaben-Hinweis, Pause und Erledigt.
// Läuft der Timer nicht (mehr), geht es zurück zu Heute. Pause = Fokus beenden (die bisherige Zeit
// zählt) und eine Pause-Uhr; danach weiter mit einem neuen Durchgang.
import { earnedFor, MIN_MS } from '@fokus/core';
import {
  Body,
  Button,
  Ring,
  SymbolIcon,
  font,
  kindColors,
  kindScreens,
  type,
  usePalette,
  useScheme,
} from '@fokus/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '../components/BackButton';
import { PageHead } from '../components/PageHead';
import { api } from '../lib/api';
import { useDay, type Running } from '../lib/day';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

type Phase =
  | { kind: 'focus'; run: Running }
  | { kind: 'pause'; until: number; taskId: string | null; earned: number }
  | { kind: 'done'; earned: number; minutes: number };

export default function FokusModus() {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const day = useDay();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [title, setTitle] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Laufenden Durchgang holen; gibt es keinen, zurück zu Heute
  useEffect(() => {
    void api<Running | null>('/api/focus/current')
      .then((r) => (r ? setPhase({ kind: 'focus', run: r }) : goBack('/')))
      .catch((e: Error) => setError(e.message));
    void day.reload();
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const run = phase?.kind === 'focus' ? phase.run : null;
  const task = day.data?.tasks.find((t) => t.id === (run?.taskId ?? ''));
  const block = day.data?.blocks.find((b) => b.id === run?.blockId);
  useEffect(() => setTitle(task?.title ?? block?.title ?? ''), [task?.title, block?.title]);

  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, padding: 24, paddingTop: insets.top + 24 }}>
        <Body muted>{error}</Body>
        <Button label="Zurück" variant="secondary" onPress={() => goBack('/')} />
      </View>
    );
  if (!phase)
    return (
      <View
        style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={p.ink3} />
      </View>
    );

  const perHour = day.data?.settings.creditPerHour ?? 15;
  const pauseMin = day.data?.settings.pauseMinutes ?? 10;
  const screen = phase.kind === 'pause' ? kindScreens.pause : kindScreens.focus;
  const bg: ViewStyle =
    dark && Platform.OS === 'web'
      ? ({ backgroundImage: screen.screen } as unknown as ViewStyle)
      : {};

  // Ring und Zeit
  let total = 0;
  let left = 0;
  if (phase.kind === 'focus') {
    total = phase.run.plannedMinutes * MIN_MS;
    left = total - (now - new Date(phase.run.startedAt).getTime());
  } else if (phase.kind === 'pause') {
    total = pauseMin * MIN_MS;
    left = phase.until - now;
  }
  const over = left <= 0;

  async function finish(taskDone: boolean) {
    if (phase?.kind !== 'focus') return;
    setBusy(true);
    setError('');
    try {
      const r = await day.finishFocus(phase.run.id, { taskDone });
      if (taskDone) setPhase({ kind: 'done', earned: r.earned, minutes: r.focusedMinutes });
      else
        setPhase({
          kind: 'pause',
          until: Date.now() + pauseMin * MIN_MS,
          taskId: phase.run.taskId,
          earned: r.earned,
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    if (phase?.kind !== 'pause') return;
    setBusy(true);
    try {
      const r = await day.startFocus(phase.taskId ? { taskId: phase.taskId } : {});
      setPhase({ kind: 'focus', run: r });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const close = () => goBack('/');
  const total_ = phase.kind === 'done' ? 0 : total;

  return (
    <View style={[{ flex: 1, backgroundColor: p.bg }, bg]}>
      <PageHead title="Fokus-Modus" />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 24,
          width: '100%',
          maxWidth: 480,
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 44,
          }}
        >
          <Pressable accessibilityRole="button" onPress={close} hitSlop={10}>
            <Text style={[type.body, { color: p.ink2, fontSize: 16 }]}>Schließen</Text>
          </Pressable>
          <View
            style={{
              backgroundColor: dark ? screen.chip : p.surface2,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={[type.small, { color: dark ? screen.text : p.ink2 }]}>
              {phase.kind === 'pause'
                ? 'Pause'
                : phase.kind === 'done'
                  ? 'Geschafft'
                  : 'Fokus läuft'}
            </Text>
          </View>
        </View>

        {phase.kind === 'done' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <SymbolIcon name="haken" color={kindColors.pause} size={48} />
            <Text style={[type.title, { color: p.ink, textAlign: 'center' }]}>Erledigt</Text>
            <Text style={[type.body, { color: p.ink2, textAlign: 'center' }]}>
              {phase.minutes} Min. fokussiert
              {phase.earned ? ` · +${phase.earned} Min Scroll-Guthaben` : ''}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[type.body, { color: p.ink2, marginTop: 48 }]}>
              {phase.kind === 'pause' ? 'Pause' : 'Fokus-Block'}
            </Text>
            <Text
              // @ts-expect-error dataSet gibt es nur in react-native-web
              dataSet={{ private: '' }}
              style={[
                type.section,
                { color: p.ink, textAlign: 'center', marginTop: 6, fontSize: 22 },
              ]}
            >
              {phase.kind === 'pause' ? `+${phase.earned} Min Guthaben verdient` : title || 'Fokus'}
            </Text>
            <View style={{ marginTop: 44 }}>
              <Ring
                progress={total_ ? 1 - Math.max(0, left) / total_ : 1}
                kind={phase.kind === 'pause' ? 'pause' : 'focus'}
                label={`Noch ${Math.max(0, Math.ceil(left / 60_000))} von ${Math.round(total_ / 60_000)} Minuten`}
              >
                <Text
                  style={{
                    color: p.ink,
                    fontSize: 68,
                    lineHeight: 68,
                    fontFamily: font.bold,
                    letterSpacing: -3,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {mmss(left)}
                </Text>
                <Text style={[type.small, { color: p.ink2, marginTop: 8, fontSize: 14 }]}>
                  {over ? 'Zeit ist um' : `von ${Math.round(total_ / 60_000)} Min`}
                </Text>
              </Ring>
            </View>
            {phase.kind === 'focus' ? (
              <View
                style={{
                  marginTop: 36,
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'center',
                  backgroundColor: dark ? 'rgba(255,255,255,0.06)' : p.surface,
                  borderRadius: 18,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                }}
              >
                <SymbolIcon name="uhr" color={kindColors.social} size={18} />
                <Text style={[type.body, { color: p.ink, fontSize: 14 }]}>
                  Nach diesem Block:{' '}
                  <Text style={{ fontFamily: font.semibold }}>
                    +{earnedFor(phase.run.plannedMinutes, perHour)} Min
                  </Text>{' '}
                  Scroll-Guthaben
                </Text>
              </View>
            ) : null}
          </>
        )}

        <View style={{ marginTop: 'auto', width: '100%', gap: 12 }}>
          {phase.kind === 'focus' ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Pause"
                  variant="secondary"
                  loading={busy}
                  onPress={() => finish(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Erledigt" loading={busy} onPress={() => finish(true)} />
              </View>
            </View>
          ) : phase.kind === 'pause' ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Beenden" variant="secondary" onPress={close} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Weiter fokussieren" loading={busy} onPress={again} />
              </View>
            </View>
          ) : (
            <Button label="Zu Heute" onPress={close} />
          )}
          {error ? <Body muted>{error}</Body> : null}
        </View>
      </View>
    </View>
  );
}
