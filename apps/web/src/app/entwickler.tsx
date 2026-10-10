// Einstellungen → Entwickler: persönliche API-Schlüssel und Anleitungen für Kurzbefehle und
// Apple Pay (Automation „Transaktion“). Schlüssel nur einmal sichtbar.
import { Body, Button, Card, Field, ListRow, Notice, Section, Title, Toggle } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { ConfirmSheet, type Confirm } from '../components/ConfirmSheet';
import { CopyBox, WebhookSettings } from '../components/DevExtras';
import { Screen } from '../components/Screen';
import { API_BASE, api } from '../lib/api';
import { ago } from '../lib/format';

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

const SCOPE_LABEL: Record<string, string> = {
  'inbox:create': 'Notizen in die Inbox legen',
};

export default function Entwickler() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState('Kurzbefehl');
  const [scopes, setScopes] = useState<string[]>(['inbox:create']);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const url = `${API_BASE}/api/v1/inbox`;

  useEffect(() => {
    api<Key[]>('/api/me/keys')
      .then(setKeys)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ key: string; keys: Key[] }>('/api/me/keys', {
        method: 'POST',
        body: { name, scopes },
      });
      setFresh(r.key);
      setKeys(r.keys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (s: string) =>
    setScopes((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  return (
    <Screen title="Kurzbefehle">
      <BackButton parent="/profil" label="Profil" />
      <Title>Entwickler</Title>
      <Body muted>
        Mit einem persönlichen Schlüssel legen Kurzbefehle und Siri Notizen direkt in deine Inbox.
        Der Schlüssel ist nur einmal sichtbar.
      </Body>

      <Section title="Schlüssel" aside={keys.length ? String(keys.length) : undefined}>
        {keys.length ? (
          <Card>
            {keys.map((k) => (
              <ListRow
                key={k.id}
                title={k.name}
                detail={`${k.prefix}… · ${k.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(', ')} · ${
                  k.lastUsedAt ? `zuletzt ${ago(k.lastUsedAt)}` : 'noch nicht benutzt'
                }`}
                value="Widerrufen"
                valueTone="negative"
                onPress={() =>
                  setConfirm({
                    title: `${k.name} widerrufen?`,
                    text: 'Kurzbefehle mit diesem Schlüssel funktionieren danach nicht mehr.',
                    label: 'Widerrufen',
                    run: async () =>
                      setKeys(await api<Key[]>(`/api/me/keys/${k.id}`, { method: 'DELETE' })),
                  })
                }
              />
            ))}
          </Card>
        ) : (
          <Body muted>Noch kein Schlüssel.</Body>
        )}
      </Section>

      <Section title="Neuer Schlüssel">
        <Field label="Name" value={name} onChangeText={setName} placeholder="z. B. iPhone" />
        <Card>
          {Object.entries(SCOPE_LABEL).map(([s, label]) => (
            <Toggle key={s} label={label} value={scopes.includes(s)} onChange={() => toggle(s)} />
          ))}
        </Card>
        {error ? <Notice tone="negative">{error}</Notice> : null}
        <Button
          label="Schlüssel erstellen"
          loading={busy}
          disabled={!name.trim() || !scopes.length}
          onPress={create}
        />
        {fresh ? (
          <View style={{ gap: 8 }}>
            <Notice tone="warning">
              Jetzt kopieren: der Schlüssel wird nicht noch einmal gezeigt.
            </Notice>
            <CopyBox label="Schlüssel" value={fresh} />
          </View>
        ) : null}
      </Section>

      <Section title="Kurzbefehl „Notiz“">
        <Body muted>Für Siri („Notiz an FOKUS“) und den Action-Button.</Body>
        <Body>
          1. Kurzbefehle-App → „+“ → Aktion „Nach Eingabe fragen“ (Text, Frage: „Was fällt dir
          ein?“).{'\n'}2. Aktion „Inhalte von URL abrufen“: URL unten, Methode POST, Header
          „Authorization“ = „Bearer “ + dein Schlüssel, Anfragetext JSON mit Feld „text“ =
          Angegebene Eingabe.{'\n'}3. Kurzbefehl „Notiz an FOKUS“ nennen. Die Notiz landet in der
          Inbox, FOKUS plant sie später ein.
        </Body>
        <CopyBox label="URL" value={url} />
      </Section>

      <Section title="Smart Home">
        <Body muted>
          Webhooks melden Beginn und Ende eines Fokus-Blocks, zum Beispiel an Home Assistant: Licht
          dimmen, Handy auf „Nicht stören“.
        </Body>
        <Body>
          Ereignisse: „focus.started“ und „focus.ended“. Der Inhalt enthält Titel, Dauer und bei
          Ende das verdiente Guthaben. Home Assistant: Automation mit „Webhook“-Auslöser (Adresse
          wie http://homeassistant.local:8123/api/webhook/…) und Aktionen für Licht oder Szene. Die
          Adresse im Heimnetz darf nur ein Admin eintragen.
        </Body>
      </Section>
      <WebhookSettings ask={setConfirm} />
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
