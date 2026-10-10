// Einladung zum gemeinsamen Fokus-Block: Vorschau ohne Anmeldung, dann mitmachen.
import { Body, Button, Notice, Title, kindColors, CatTile } from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Screen } from '../components/Screen';
import { api, ApiError } from '../lib/api';
import { useDay } from '../lib/day';
import { usePublic } from '../lib/public';

type Preview = { ownerName: string; title: string; minutes: number; open: boolean };

export default function Partner() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const pub = usePublic();
  const { startFocus } = useDay();
  const [pv, setPv] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setError('Dieser Link ist unvollständig.');
    api<Preview>(`/api/rooms/preview?token=${encodeURIComponent(token)}`)
      .then(setPv)
      .catch(() => setError('Diese Einladung gibt es nicht mehr.'));
  }, [token]);

  const signedIn = !!pub?.signedIn;
  const next = `/partner?token=${encodeURIComponent(String(token ?? ''))}`;

  async function join() {
    setBusy(true);
    setError('');
    try {
      await api('/api/rooms/join', { body: { token } });
      await startFocus({ minutes: pv?.minutes });
      router.replace('/fokus-modus');
    } catch (e) {
      // Läuft schon ein eigener Block: trotzdem beitreten, der Timer läuft weiter
      if (e instanceof ApiError && e.status === 409) router.replace('/fokus-modus');
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Fokus-Partner">
      <CatTile color={kindColors.focus} symbol="personen" size={56} radius={16} />
      <Title>Gemeinsam fokussieren</Title>
      {pv ? (
        <>
          <Body>
            {pv.ownerName} lädt dich zu einem Fokus-Block ein
            {pv.title ? `: „${pv.title}“` : ''} ({pv.minutes} Min.). Ihr seht live, wer mitarbeitet.
            Aufgaben und Plan bleiben privat.
          </Body>
          {!pv.open ? <Notice tone="warning">Dieser Fokus-Block ist schon vorbei.</Notice> : null}
          {pv.open && signedIn ? <Button label="Mitmachen" loading={busy} onPress={join} /> : null}
          {pv.open && !signedIn ? (
            <>
              <Button
                label="Anmelden und mitmachen"
                onPress={() => router.push({ pathname: '/login', params: { next } })}
              />
              {pub?.registrationMode === 'open' ? (
                <Button
                  label="Konto anlegen"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/registrieren', params: { next } })}
                />
              ) : (
                <Body muted>Neue Konten gibt es zurzeit nur mit Einladung.</Body>
              )}
            </>
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}
    </Screen>
  );
}
