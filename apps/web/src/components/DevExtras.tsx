// Entwickler-Seite, Teil 2: Webhooks (eigene URLs, signiert).
import {
  Body,
  Button,
  Card,
  Field,
  ListRow,
  Notice,
  Section,
  Toggle,
  type,
  usePalette,
} from '@fokus/ui';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { ago } from '../lib/format';
import type { Confirm } from './ConfirmSheet';

/** Text zum Kopieren, mit kurzer Bestätigung. */
export function CopyBox({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  const [done, setDone] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} kopieren`}
      onPress={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      style={{ backgroundColor: p.surface2, borderRadius: 12, padding: 12, gap: 4 }}
    >
      <Text style={[type.small, { color: p.ink2 }]}>
        {label} · {done ? 'kopiert' : 'tippen zum Kopieren'}
      </Text>
      <Text selectable style={[type.small, { color: p.ink, fontFamily: 'monospace' }]}>
        {value}
      </Text>
    </Pressable>
  );
}

type Delivery = {
  id: string;
  event: string;
  status: 'pending' | 'ok' | 'failed';
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
};
type Hook = { id: string; url: string; events: string[]; deliveries: Delivery[] };

const EVENT_LABEL: Record<string, string> = {
  'focus.started': 'Fokus-Block gestartet',
  'focus.ended': 'Fokus-Block beendet',
};

export function WebhookSettings({ ask }: { ask: (c: Confirm) => void }) {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['focus.started', 'focus.ended']);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Hook[]>('/api/me/webhooks')
      .then(setHooks)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function add() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ secret: string; webhooks: Hook[] }>('/api/me/webhooks', {
        method: 'POST',
        body: { url, events },
      });
      setHooks(r.webhooks);
      setSecret(r.secret);
      setUrl('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = (d: Delivery) =>
    d.status === 'ok'
      ? `${d.event} ✓`
      : d.status === 'failed'
        ? `${d.event} ✗ ${d.lastError ?? ''}`
        : `${d.event} · Versuch ${d.attempts + 1} ausstehend`;

  return (
    <Section title="Webhooks">
      <Body muted>
        FOKUS schickt Ereignisse als JSON an deine Adresse. Header „X-FOKUS-Signature“ = sha256-HMAC
        des Bodys mit deinem Geheimnis. Fehlschläge werden nach 1 min, 10 min und 1 h wiederholt.
      </Body>
      {hooks.length ? (
        <Card>
          {hooks.map((h) => (
            <View key={h.id}>
              <ListRow
                title={h.url}
                detail={[
                  h.events.map((e) => EVENT_LABEL[e] ?? e).join(', '),
                  h.deliveries[0]
                    ? `${status(h.deliveries[0])} · ${ago(h.deliveries[0].createdAt)}`
                    : 'noch nichts gesendet',
                ].join('\n')}
                value="Test"
                onPress={() =>
                  void api<Hook[]>(`/api/me/webhooks/${h.id}/test`, { method: 'POST' })
                    .then(setHooks)
                    .catch((e: Error) => setError(e.message))
                }
              />
              <ListRow
                title="Löschen"
                valueTone="negative"
                onPress={() =>
                  ask({
                    title: 'Webhook löschen?',
                    text: h.url,
                    label: 'Löschen',
                    run: async () =>
                      setHooks(await api<Hook[]>(`/api/me/webhooks/${h.id}`, { method: 'DELETE' })),
                  })
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
      <Field
        label="Adresse"
        value={url}
        onChangeText={setUrl}
        placeholder="https://…"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Card>
        {Object.entries(EVENT_LABEL).map(([e, label]) => (
          <Toggle
            key={e}
            label={label}
            value={events.includes(e)}
            onChange={() =>
              setEvents((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e]))
            }
          />
        ))}
      </Card>
      <Body muted>
        Nur HTTPS. Adressen im Heimnetz (http, 192.168.…) darf nur ein Admin eintragen.
      </Body>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button
        label="Webhook hinzufügen"
        variant="secondary"
        loading={busy}
        disabled={!url.trim() || !events.length}
        onPress={add}
      />
      {secret ? (
        <View style={{ gap: 8 }}>
          <Notice tone="warning">
            Geheimnis jetzt kopieren: es wird nicht noch einmal gezeigt.
          </Notice>
          <CopyBox label="Geheimnis" value={secret} />
        </View>
      ) : null}
    </Section>
  );
}
