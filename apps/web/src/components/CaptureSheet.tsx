// Plus-Knopf: Notiz für die Inbox in einem Satz. Speichern kommt mit Phase 2 (Screens).
import { Body, Button, Sheet } from '@fokus/ui';
import { useApp } from '../lib/app';

export function CaptureSheet() {
  const { captureOpen, setCaptureOpen } = useApp();
  const close = () => setCaptureOpen(false);
  return (
    <Sheet open={captureOpen} onClose={close} title="Neu">
      <Body muted>Notizen und Aufgaben erfassen kommt in der nächsten Phase.</Body>
      <Button label="Schließen" variant="secondary" onPress={close} />
    </Sheet>
  );
}
