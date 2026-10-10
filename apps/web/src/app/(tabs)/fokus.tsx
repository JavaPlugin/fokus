import { clock, MIN_MS } from '@fokus/core';
import {
  Body,
  Button,
  Card,
  KindCard,
  ListRow,
  Section,
  Title,
  font,
  type,
  useKindText,
  usePalette,
} from '@fokus/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { useDay } from '../../lib/day';

/** Fokus: Timer starten (nächster Block oder eine Aufgabe) oder zum laufenden Timer. */
export default function Fokus() {
  const p = usePalette();
  const focusText = useKindText('focus');
  const { data, startFocus } = useDay();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const head: ScreenHead = { title: 'Fokus', right: <HeadButtons /> };

  async function go(opts: { blockId?: string; taskId?: string }) {
    setBusy(true);
    setError('');
    try {
      await startFocus(opts);
      router.push('/fokus-modus');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const run = data?.running;
  const planned = (data?.blocks ?? []).filter((b) => b.kind === 'focus' && b.status === 'planned');
  const next = planned[0];
  const tasks = (data?.tasks ?? []).filter((t) => !t.mini).slice(0, 5);
  const minutes = data?.settings.focusMinutes ?? 50;

  return (
    <Screen head={head}>
      <Title>Fokus</Title>
      {run ? (
        <KindCard>
          <Text style={[type.small, { color: focusText }]}>Läuft</Text>
          <Text style={[type.section, { color: p.ink, marginTop: 4, fontFamily: font.semibold }]}>
            {data?.blocks.find((b) => b.id === run.blockId)?.title || 'Fokus'}
          </Text>
          <Text style={[type.small, { color: p.ink2, marginTop: 4, marginBottom: 14 }]}>
            seit {clock(run.startedAt)} Uhr · {run.plannedMinutes} Min.
          </Text>
          <Button label="Zum Timer" onPress={() => router.push('/fokus-modus')} />
        </KindCard>
      ) : (
        <>
          {next ? (
            <KindCard>
              <Text style={[type.small, { color: focusText }]}>
                Nächster Block · {clock(next.startsAt)}
              </Text>
              <Text
                style={[type.section, { color: p.ink, marginTop: 4, fontFamily: font.semibold }]}
              >
                {next.title || 'Fokus'}
              </Text>
              <Text style={[type.small, { color: p.ink2, marginTop: 4, marginBottom: 14 }]}>
                {next.minutes} Min.
                {new Date(next.startsAt).getTime() > Date.now() + 30 * MIN_MS
                  ? ' · geplant für später'
                  : ''}
              </Text>
              <Button
                label="Jetzt starten"
                loading={busy}
                onPress={() => go({ blockId: next.id })}
              />
            </KindCard>
          ) : null}
          <Section title={next ? 'Oder etwas anderes' : 'Was steht an?'}>
            {tasks.length ? (
              <Card>
                {tasks.map((t) => (
                  <ListRow
                    key={t.id}
                    title={t.title}
                    detail={`${t.minutes} Min. geschätzt`}
                    value="Starten ›"
                    onPress={() => void go({ taskId: t.id })}
                  />
                ))}
              </Card>
            ) : (
              <Body muted>
                Keine offene Aufgabe. Du kannst trotzdem einen freien Block starten.
              </Body>
            )}
            <Button
              label={`Freien Block starten (${minutes} Min.)`}
              variant="secondary"
              loading={busy}
              onPress={() => go({})}
            />
          </Section>
        </>
      )}
      {error ? <Body muted>{error}</Body> : null}
      <View />
    </Screen>
  );
}
