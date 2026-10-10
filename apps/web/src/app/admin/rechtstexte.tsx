// Admin → Rechtstexte: Impressum, Datenschutz, Nutzungsbedingungen als Markdown bearbeiten,
// Vorschau wie auf der Seite, Stand-Datum, die letzten 10 Versionen ansehen und zurückholen.
// API: apps/api/src/legal.ts. Neue Nutzungsbedingungen zeigen bestehenden Konten einen Hinweis.
import { fillLegal, LEGAL_KEYS, type LegalKey } from '@fokus/core';
import {
  Body,
  Button,
  Card,
  Field,
  ListRow,
  Notice,
  Segmented,
  Title,
  type,
  usePalette,
} from '@fokus/ui';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { BackButton } from '../../components/BackButton';
import { standText, type LegalDoc } from '../../components/LegalPage';
import { Markdown } from '../../components/Markdown';
import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';
import { usePublic } from '../../lib/public';

const LABEL: Record<LegalKey, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  nutzungsbedingungen: 'Bedingungen',
};
type Version = LegalDoc & { createdAt: string; by: string | null };

export default function Rechtstexte() {
  const p = usePalette();
  const legal = usePublic()?.legal;
  const [key, setKey] = useState<LegalKey>('impressum');
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [body, setBody] = useState('');
  const [stand, setStand] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [versions, setVersions] = useState<Version[]>([]);
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);

  async function load(k: LegalKey) {
    setMsg(null);
    try {
      const d = await api<LegalDoc>(`/api/admin/legal/${k}`);
      setDoc(d);
      setBody(d.body);
      setStand(d.stand ?? '');
      setVersions(await api<Version[]>(`/api/admin/legal/${k}/versions`));
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }
  useEffect(() => {
    void load(key);
  }, [key]);

  const standOk = !stand || /^\d{4}-\d{2}-\d{2}$/.test(stand);
  async function save() {
    try {
      await api(`/api/admin/legal/${key}`, {
        method: 'PUT',
        body: { body, stand: stand || null },
      });
      await load(key);
      setMsg({
        tone: 'positive',
        text:
          key === 'nutzungsbedingungen'
            ? 'Gespeichert. Bestehende Konten sehen beim nächsten Öffnen einen Hinweis.'
            : 'Gespeichert.',
      });
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  const dirty = !!doc && (body !== doc.body || stand !== (doc.stand ?? ''));
  return (
    <Screen title="Rechtstexte">
      <BackButton parent="/admin" label="Admin" />
      <Title>Rechtstexte</Title>
      <Segmented<LegalKey>
        value={key}
        options={LEGAL_KEYS.map((k) => ({ value: k, label: LABEL[k] }))}
        onChange={setKey}
      />
      <Body muted>
        Markdown: ## Überschrift, **fett**, - Liste, [Text](https://…). [[…]] markiert offene
        Stellen (gelb). {'{{betreiber}}'}, {'{{anschrift}}'} und {'{{email}}'} kommen aus Impressum.
      </Body>
      <Segmented<'edit' | 'preview'>
        value={view}
        options={[
          { value: 'edit', label: 'Bearbeiten' },
          { value: 'preview', label: 'Vorschau' },
        ]}
        onChange={setView}
      />
      {view === 'edit' ? (
        <TextInput
          accessibilityLabel="Text"
          multiline
          value={body}
          onChangeText={setBody}
          style={[
            type.body,
            {
              minHeight: 360,
              padding: 14,
              borderRadius: 12,
              backgroundColor: p.surface2,
              color: p.ink,
              fontFamily: 'monospace',
              fontSize: 14,
              textAlignVertical: 'top',
            },
          ]}
        />
      ) : (
        <Card>
          <View style={{ padding: 16 }}>
            <Markdown source={fillLegal(body, legal)} />
          </View>
        </Card>
      )}
      <Field
        label="Stand (JJJJ-MM-TT)"
        value={stand}
        onChangeText={setStand}
        placeholder="2026-10-08"
      />
      {!standOk ? <Notice tone="warning">Datum als JJJJ-MM-TT eingeben.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button
        label={doc?.version ? 'Neue Version speichern' : 'Speichern'}
        disabled={!dirty || !body.trim() || !standOk}
        onPress={() => void save()}
      />
      {versions.length ? (
        <Card>
          {versions.map((v) => (
            <ListRow
              key={v.version}
              title={`Version ${v.version}${v.version === doc?.version ? ' · aktuell' : ''}`}
              detail={[
                new Date(v.createdAt).toLocaleString('de-DE', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                v.by,
                v.stand ? `Stand ${standText(v.stand)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              value={v.version === doc?.version ? undefined : 'Laden'}
              onPress={
                v.version === doc?.version
                  ? undefined
                  : () => {
                      setBody(v.body);
                      setStand(v.stand ?? '');
                      setView('edit');
                      setMsg({
                        tone: 'positive',
                        text: `Version ${v.version} geladen. Speichern macht sie wieder aktuell.`,
                      });
                    }
              }
            />
          ))}
        </Card>
      ) : (
        <Body muted>Noch keine gespeicherte Version: es gilt der Standardtext.</Body>
      )}
    </Screen>
  );
}
