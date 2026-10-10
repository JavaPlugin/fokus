// Ein Block im Tagesplan: starten, erledigen, überspringen, löschen. Social-Slots geben das
// Guthaben beim Starten aus.
import { clock } from '@fokus/core';
import { Body, Button, Notice, Sheet } from '@fokus/ui';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useDay, type Block } from '../lib/day';

const LABEL = { focus: 'Fokus-Block', pause: 'Pause', social: 'Social-Slot', event: 'Termin' };

export function BlockSheet({ block, onClose }: { block: Block | null; onClose: () => void }) {
  const day = useDay();
  const last = useRef<Block | null>(null);
  if (block) last.current = block;
  const b = block ?? last.current;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    tone: 'positive' | 'warning' | 'negative';
    text: string;
  } | null>(null);

  async function run(fn: () => Promise<unknown>, close = true) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (close) onClose();
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!b) return null;
  const planned = b.status === 'planned';
  const sub = `${clock(b.startsAt)} Uhr · ${b.minutes} Min.`;

  return (
    <Sheet
      open={!!block}
      onClose={() => {
        setMsg(null);
        onClose();
      }}
      title={b.title || LABEL[b.kind]}
    >
      <Body muted>
        {LABEL[b.kind]} · {sub}
      </Body>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {b.kind === 'focus' && planned ? (
        <Button
          label="Fokus starten"
          loading={busy}
          onPress={() =>
            run(async () => {
              await day.startFocus({ blockId: b.id });
              router.push('/fokus-modus');
            })
          }
        />
      ) : null}
      {b.kind === 'focus' && b.status === 'running' ? (
        <Button
          label="Zum Timer"
          onPress={() => {
            onClose();
            router.push('/fokus-modus');
          }}
        />
      ) : null}
      {b.kind === 'social' && planned ? (
        <Button
          label={`Social-Slot starten (${b.minutes} Min. vom Guthaben)`}
          loading={busy}
          onPress={() =>
            run(async () => {
              const r = await day.spend(b.minutes, 'social', b.id);
              await day.setBlockStatus(b.id, 'done');
              if (r.short > 0)
                setMsg({
                  tone: 'warning',
                  text: `Dein Guthaben reichte nur für ${r.granted} von ${b.minutes} Min.`,
                });
            }, false)
          }
        />
      ) : null}
      {planned && b.kind !== 'focus' && b.kind !== 'social' ? (
        <Button
          label="Erledigt"
          loading={busy}
          onPress={() => run(() => day.setBlockStatus(b.id, 'done'))}
        />
      ) : null}
      {planned && b.kind === 'focus' ? (
        <Button
          label="Erledigt ohne Timer"
          variant="secondary"
          loading={busy}
          onPress={() => run(() => day.setBlockStatus(b.id, 'done'))}
        />
      ) : null}
      {b.status === 'done' ? (
        <Button
          label="Wieder öffnen"
          variant="secondary"
          loading={busy}
          onPress={() => run(() => day.setBlockStatus(b.id, 'planned'))}
        />
      ) : null}
      {planned ? (
        <Button
          label="Überspringen"
          variant="secondary"
          loading={busy}
          onPress={() => run(() => day.setBlockStatus(b.id, 'skipped'))}
        />
      ) : null}
      {b.status !== 'running' ? (
        <Button
          label="Löschen"
          variant="danger"
          loading={busy}
          onPress={() => run(() => day.removeBlock(b.id))}
        />
      ) : null}
    </Sheet>
  );
}
