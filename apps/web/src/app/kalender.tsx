// Kalender-Sync: ICS-Abo-Adressen (Google, Apple) hinzufügen. Termine blockieren Arbeitszeit.
import { Body, Button, Card, Field, ListRow, Notice, Section, Title } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { ConfirmSheet, type Confirm } from '../components/ConfirmSheet';
import { Screen } from '../components/Screen';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import { useDay } from '../lib/day';

type Feed = { id: string; name: string; lastSyncAt: string | null; lastError: string | null };

export default function Kalender() {
  const { reload } = useDay();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = () =>
    api<Feed[]>('/api/calendar')
      .then(setFeeds)
      .catch((e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  async function add() {
    setBusy(true);
    setError('');
    try {
      const f = await api<Feed>('/api/calendar', { body: { name, url } });
      setName('');
      setUrl('');
      if (f.lastError) setError(`Gespeichert, aber der Abruf klappt nicht: ${f.lastError}`);
      await load();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const r = await api<{ feeds: Feed[] }>('/api/calendar/sync?force=1', {
        method: 'POST',
        body: {},
      });
      setFeeds(r.feeds);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Kalender">
      <BackButton parent="/profil" label="Profil" />
      <Title>Kalender</Title>
      <Body muted>
        Termine aus deinem Google- oder Apple-Kalender blockieren Zeit im Tagesplan. FOKUS liest
        nur, schreibt nie in deinen Kalender.
      </Body>
      <Section title="Abos" aside={feeds.length ? String(feeds.length) : undefined}>
        {feeds.length ? (
          <Card>
            {feeds.map((f) => (
              <ListRow
                key={f.id}
                title={f.name}
                detail={f.lastError ? `Fehler: ${f.lastError}` : `Abgeglichen ${ago(f.lastSyncAt)}`}
                value="Entfernen"
                valueTone="negative"
                onPress={() =>
                  setConfirm({
                    title: `${f.name} entfernen?`,
                    text: 'Die Termine aus diesem Kalender verschwinden aus FOKUS.',
                    label: 'Entfernen',
                    run: async () => {
                      await api(`/api/calendar/${f.id}`, { method: 'DELETE' });
                      await load();
                      await reload();
                    },
                  })
                }
              />
            ))}
          </Card>
        ) : (
          <Body muted>Noch kein Kalender.</Body>
        )}
        {feeds.length ? (
          <Button label="Jetzt abgleichen" variant="secondary" loading={busy} onPress={syncNow} />
        ) : null}
      </Section>
      <Section title="Kalender hinzufügen">
        <Field label="Name" value={name} onChangeText={setName} placeholder="z. B. Privat" />
        <Field
          label="ICS-Adresse"
          value={url}
          onChangeText={setUrl}
          placeholder="https://… oder webcal://…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? (
          <Notice tone={error.startsWith('Gespeichert') ? 'warning' : 'negative'}>{error}</Notice>
        ) : null}
        <Button
          label="Hinzufügen"
          loading={busy}
          disabled={!name.trim() || !url.trim()}
          onPress={add}
        />
      </Section>
      <Section title="Wo finde ich die Adresse?">
        <Body>
          Google Kalender (am Computer): Einstellungen → Kalender wählen → „Geheime Adresse im
          iCal-Format“.{'\n'}Apple Kalender (Mac): Rechtsklick auf den Kalender → „Teilen“ →
          „Öffentlicher Kalender“, Link kopieren.{'\n'}Outlook: Kalender veröffentlichen → ICS-Link.
        </Body>
        <Body muted>
          Die Adresse ist wie ein Passwort. FOKUS zeigt sie dir nach dem Speichern nicht mehr an.
        </Body>
      </Section>
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
