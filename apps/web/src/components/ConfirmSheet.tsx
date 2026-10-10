// Bestätigung vor etwas Endgültigem, als Sheet (kein Browser-Dialog).
import { Body, Button, Notice, Sheet } from '@fokus/ui';
import { useState } from 'react';

export interface Confirm {
  title: string;
  text: string;
  label: string;
  run: () => Promise<void>;
}

export function ConfirmSheet({
  confirm,
  onClose,
}: {
  confirm: Confirm | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Confirm | null>(null);
  if (confirm !== shown) {
    setShown(confirm);
    setError('');
    setBusy(false);
  }

  async function go() {
    if (!confirm) return;
    setBusy(true);
    setError('');
    try {
      await confirm.run();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!confirm} onClose={onClose} title={confirm?.title}>
      <Body>{confirm?.text}</Body>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button label={confirm?.label ?? 'Löschen'} loading={busy} onPress={go} />
      <Button label="Abbrechen" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}
