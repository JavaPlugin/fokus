// Plus-Knopf: eine Notiz in einem Satz. Standard ist die Inbox; wer die Dauer gleich weiß, legt
// direkt eine Aufgabe an (FOKUS plant sie dann in einen freien Block).
import { Body, Button, Card, Chip, Chips, Field, Notice, Sheet, Toggle } from '@fokus/ui';
import { useState } from 'react';
import { useApp } from '../lib/app';
import { useDay } from '../lib/day';

const SIZES = [
  { label: '2 Min.', minutes: 2, mini: true },
  { label: '15 Min.', minutes: 15 },
  { label: '25 Min.', minutes: 25 },
  { label: '50 Min.', minutes: 50 },
  { label: '90 Min.', minutes: 90 },
] as const;

export function CaptureSheet() {
  const { captureOpen, setCaptureOpen } = useApp();
  const { addNote, addTask } = useDay();
  const [text, setText] = useState('');
  const [size, setSize] = useState<(typeof SIZES)[number] | null>(null);
  const [heavy, setHeavy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setCaptureOpen(false);
    setText('');
    setSize(null);
    setHeavy(false);
    setError('');
  };

  async function save() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      if (size)
        await addTask({
          title: t,
          minutes: size.minutes,
          mini: 'mini' in size,
          heavy: heavy && !('mini' in size),
        });
      else await addNote(t);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={captureOpen}
      onClose={close}
      title="Neu"
      action={{ label: 'Sichern', onPress: () => void save(), disabled: !text.trim() || busy }}
    >
      <Field
        label="Was ist zu tun?"
        value={text}
        onChangeText={setText}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      <Body muted>
        {size
          ? 'Wird eine Aufgabe, die FOKUS in deinen Tag einplant.'
          : 'Ohne Dauer kommt es in die Inbox. Dort planst du es später ein.'}
      </Body>
      <Chips>
        {SIZES.map((s) => (
          <Chip
            key={s.label}
            label={s.label}
            selected={size?.label === s.label}
            onPress={() => setSize(size?.label === s.label ? null : s)}
          />
        ))}
      </Chips>
      {size && !('mini' in size) ? (
        <Card>
          <Toggle label="Schwere Aufgabe (in deine Hochphase)" value={heavy} onChange={setHeavy} />
        </Card>
      ) : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button
        label={size ? 'Aufgabe anlegen' : 'In die Inbox'}
        loading={busy}
        disabled={!text.trim()}
        onPress={() => void save()}
      />
    </Sheet>
  );
}
