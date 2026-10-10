// Social-Slot einplanen: Social Media als eigener Termin. Startzeit in vollen Stunden ab jetzt oder
// „in 30 Min.“, Dauer 10 bis 45 Minuten. Der Slot gibt beim Starten Guthaben aus.
import { clock } from '@fokus/core';
import { Body, Button, Chip, Chips, Notice, Sheet } from '@fokus/ui';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useDay } from '../lib/day';

const DURATIONS = [10, 20, 30, 45];

export function SocialSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload, data } = useDay();
  const [minutes, setMinutes] = useState(20);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Vorschläge: in 30 Min. und die nächsten vollen Stunden
  const options = useMemo(() => {
    if (!open) return [];
    const now = Date.now();
    const list = [now + 30 * 60_000];
    const hour = 3600_000;
    for (let t = Math.ceil((now + 45 * 60_000) / hour) * hour, i = 0; i < 6; t += hour, i++)
      list.push(t);
    return list;
  }, [open]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('/api/blocks', {
        body: {
          kind: 'social',
          startsAt: new Date(options[at]!).toISOString(),
          minutes,
          title: 'Social-Slot',
        },
      });
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const balance = data?.credit.balance ?? 0;
  return (
    <Sheet open={open} onClose={onClose} title="Social-Slot">
      <Body muted>Wann darfst du scrollen?</Body>
      <Chips>
        {options.map((t, i) => (
          <Chip
            key={t}
            label={i === 0 ? 'In 30 Min.' : `${clock(t)} Uhr`}
            selected={at === i}
            onPress={() => setAt(i)}
          />
        ))}
      </Chips>
      <Body muted>Wie lange?</Body>
      <Chips>
        {DURATIONS.map((d) => (
          <Chip
            key={d}
            label={`${d} Min.`}
            selected={minutes === d}
            onPress={() => setMinutes(d)}
          />
        ))}
      </Chips>
      {minutes > balance ? (
        <Notice tone="warning">
          Dein Guthaben ({balance} Min.) reicht dafür noch nicht. Bis dahin verdienst du vielleicht
          mehr.
        </Notice>
      ) : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button label="Einplanen" loading={busy} onPress={() => void save()} />
    </Sheet>
  );
}
