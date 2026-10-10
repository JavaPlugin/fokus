// Plus-Knopf: tippen = Neue Aufgabe (alle Felder), lang drücken = schnell notieren. Schnell legt
// eine Aufgabe „Später, 30 Min“ an; die Details ergänzt man später unter „Aufgaben“.
import { Body, Button, Field, Notice, Sheet } from '@fokus/ui';
import { useState } from 'react';
import { useApp } from '../lib/app';
import { useDay } from '../lib/day';
import { useUndo } from '../lib/undo';
import { TaskSheet } from './TaskSheet';

export function CaptureSheet() {
  const { captureOpen, setCaptureOpen, quickOpen, setQuickOpen } = useApp();
  const day = useDay();
  const undo = useUndo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setQuickOpen(false);
    setText('');
    setError('');
  };

  async function save() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      const made = await day.createTask({ title: t });
      close();
      undo.notify(`„${t}“ unter „Aufgaben“ gespeichert`, () => void day.deleteTask(made.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TaskSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <Sheet
        open={quickOpen}
        onClose={close}
        title="Schnell notieren"
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
          Wird eine Aufgabe „Später“ mit 30 Min. Zeit und Dauer ergänzt du unter „Aufgaben“.
        </Body>
        {error ? <Notice tone="negative">{error}</Notice> : null}
        <Button
          label="Speichern"
          loading={busy}
          disabled={!text.trim()}
          onPress={() => void save()}
        />
      </Sheet>
    </>
  );
}
