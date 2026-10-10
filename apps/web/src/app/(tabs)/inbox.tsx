import {
  Body,
  Button,
  Card,
  Chip,
  Chips,
  ListRow,
  Notice,
  Section,
  Sheet,
  Title,
  Toggle,
} from '@fokus/ui';
import { useState } from 'react';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { useApp } from '../../lib/app';
import { useDay, type Note } from '../../lib/day';

const SIZES = [
  { label: '2 Min.', minutes: 2, mini: true },
  { label: '15 Min.', minutes: 15 },
  { label: '25 Min.', minutes: 25 },
  { label: '50 Min.', minutes: 50 },
  { label: '90 Min.', minutes: 90 },
] as const;

/** Inbox: schnell notiert, später eingeplant. Darunter die offenen Aufgaben. */
export default function Inbox() {
  const { notes, data, planNote, removeNote, setTaskDone } = useDay();
  const { setCaptureOpen } = useApp();
  const head: ScreenHead = { title: 'Inbox', right: <HeadButtons /> };
  const [open, setOpen] = useState<Note | null>(null);
  const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[2]);
  const [heavy, setHeavy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function plan() {
    if (!open) return;
    setBusy(true);
    setError('');
    try {
      await planNote(open.id, {
        minutes: size.minutes,
        mini: 'mini' in size,
        heavy: heavy && !('mini' in size),
      });
      setOpen(null);
      setHeavy(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tasks = (data?.tasks ?? []).filter((t) => t.status === 'open');

  return (
    <Screen head={head}>
      <Title>Inbox</Title>
      {notes && !notes.length && !tasks.length ? (
        <Body muted>Nichts offen. Mit dem Plus unten notierst du etwas in einem Satz.</Body>
      ) : null}
      {notes?.length ? (
        <Section title="Notizen" aside={String(notes.length)}>
          <Card>
            {notes.map((n) => (
              <ListRow key={n.id} title={n.text} value="Einplanen ›" onPress={() => setOpen(n)} />
            ))}
          </Card>
        </Section>
      ) : null}
      {tasks.length ? (
        <Section title="Aufgaben" aside={String(tasks.length)}>
          <Card>
            {tasks.map((t) => (
              <ListRow
                key={t.id}
                title={t.title}
                detail={`${t.mini ? 'Mini' : t.heavy ? 'Schwer' : 'Normal'} · ${t.minutes} Min.`}
                value="Erledigt"
                onPress={() => void setTaskDone(t.id, true)}
              />
            ))}
          </Card>
        </Section>
      ) : null}
      <Button label="Neu erfassen" variant="secondary" onPress={() => setCaptureOpen(true)} />

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title="Einplanen"
        action={{ label: 'Anlegen', onPress: () => void plan(), disabled: busy }}
      >
        <Body>{open?.text}</Body>
        <Chips>
          {SIZES.map((s) => (
            <Chip
              key={s.label}
              label={s.label}
              selected={size.label === s.label}
              onPress={() => setSize(s)}
            />
          ))}
        </Chips>
        {!('mini' in size) ? (
          <Card>
            <Toggle
              label="Schwere Aufgabe (in deine Hochphase)"
              value={heavy}
              onChange={setHeavy}
            />
          </Card>
        ) : (
          <Body muted>Mini-Aufgaben bleiben für Lücken und „Umleiten“ frei.</Body>
        )}
        {error ? <Notice tone="negative">{error}</Notice> : null}
        <Button label="Aufgabe anlegen" loading={busy} onPress={() => void plan()} />
        <Button
          label="Notiz löschen"
          variant="danger"
          onPress={() => {
            if (open) void removeNote(open.id).then(() => setOpen(null));
          }}
        />
      </Sheet>
    </Screen>
  );
}
