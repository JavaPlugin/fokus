import { clock } from '@fokus/core';
import {
  Body,
  Button,
  KindCard,
  Section,
  Title,
  font,
  type,
  useKindText,
  usePalette,
} from '@fokus/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { TaskRow, rowSub } from '../../components/TaskRow';
import { useDay, type Item } from '../../lib/day';

/** Fokus: Timer starten (nächste Arbeit oder ein freier Block) oder zum laufenden Timer. */
export default function Fokus() {
  const p = usePalette();
  const focusText = useKindText('focus');
  const { data, startFocus } = useDay();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const head: ScreenHead = { title: 'Fokus', right: <HeadButtons /> };

  async function go(opts: { taskId?: string; minutes?: number }) {
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
  const open = (data?.items ?? []).filter((i) => i.kind === 'work' && !i.done && i.taskId);
  const minutes = data?.settings.focusMinutes ?? 50;
  const current = run
    ? data?.items.find((i) => i.taskId === run.taskId && i.day === run.day)
    : null;

  return (
    <Screen head={head}>
      <Title>Fokus</Title>
      <Body muted>
        Fokus-Zeit bringt Scroll-Guthaben: je 1 Std. {data?.settings.creditPerHour ?? 15} Min. für
        Social Media.
      </Body>
      {run ? (
        <KindCard>
          <Text style={[type.small, { color: focusText }]}>Läuft</Text>
          <Text style={[type.section, { color: p.ink, marginTop: 4, fontFamily: font.semibold }]}>
            {current?.title || 'Freier Fokus-Block'}
          </Text>
          <Text style={[type.small, { color: p.ink2, marginTop: 4, marginBottom: 14 }]}>
            seit {clock(run.startedAt)} Uhr · {run.plannedMinutes} Min.
          </Text>
          <Button label="Zum Timer" onPress={() => router.push('/fokus-modus')} />
        </KindCard>
      ) : (
        <>
          <Section title={open.length ? 'Was steht an?' : 'Frei fokussieren'}>
            {open.slice(0, 5).map((i: Item) => (
              <TaskRow
                key={i.key}
                title={i.title}
                sub={rowSub(clock(i.start), i.minutes, i.kind, i.how, i.recurring)}
                kind={i.kind}
                onPress={() => void go({ taskId: i.taskId!, minutes: i.minutes })}
              />
            ))}
            {open.length ? <Body muted>Aufgabe antippen = Timer starten.</Body> : null}
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
    </Screen>
  );
}
