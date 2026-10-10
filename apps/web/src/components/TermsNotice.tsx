// Neue Nutzungsbedingungen (Admin-Panel → Rechtstexte): einmal ein Hinweis mit Link und „Gelesen“
// für Konten, die vor der Änderung zugestimmt haben (API: /api/me/terms).
import { Body, Button, Sheet } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigateAfterSheets } from '../lib/nav';

export function TermsNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ version: number; changed: boolean }>('/api/me/terms')
      .then((t) => setOpen(t.changed))
      .catch(() => undefined);
  }, []);
  const seen = () => {
    setOpen(false);
    void api('/api/me/terms-seen', { method: 'PUT' }).catch(() => undefined);
  };
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Neue Nutzungsbedingungen">
      <Body>
        Die Nutzungsbedingungen haben sich geändert. Lies sie kurz durch; mit „Gelesen“ blendest du
        diesen Hinweis aus.
      </Body>
      <Button
        label="Nutzungsbedingungen lesen"
        variant="secondary"
        onPress={() => {
          setOpen(false);
          navigateAfterSheets('/nutzungsbedingungen', 'push');
        }}
      />
      <Button label="Gelesen" onPress={seen} />
    </Sheet>
  );
}
