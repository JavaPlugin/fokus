import { Body, Button, Card, ListRow, Notice, Title, type, usePalette } from '@fokus/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { API_BASE, api, type Job, type UpdateStatus } from '../../lib/api';
import { when } from '../../lib/format';
import { goBack } from '../../components/BackButton';

const KIND: Record<Job['kind'], string> = {
  install: 'Update',
  rollback: 'Zurück',
  restore: 'Wiederherstellung',
  backup: 'Sicherung',
};
const STATUS: Record<Job['status'], { label: string; tone?: 'warning' | 'negative' }> = {
  running: { label: 'läuft' },
  ok: { label: 'ok' },
  'rolled-back': { label: 'zurückgerollt', tone: 'warning' },
  failed: { label: 'fehlgeschlagen', tone: 'negative' },
};

export default function Protokoll() {
  const p = usePalette();
  const [st, setSt] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api<UpdateStatus>('/api/admin/updates')
        .then(setSt)
        .catch((e: Error) => setError(e.message));
    }, []),
  );

  async function show(j: Job) {
    if (open === j.id) return setOpen(null);
    setOpen(j.id);
    const res = await fetch(`${API_BASE}/api/admin/updates/jobs/${j.id}/log`, {
      credentials: 'include',
    });
    setLog(res.ok ? await res.text() : 'Protokoll nicht verfügbar.');
  }

  async function rollback() {
    if (!confirm) return setConfirm(true);
    try {
      await api('/api/admin/updates/rollback', { method: 'POST' });
      router.replace('/admin');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Screen title="Protokoll">
      <Title>Update-Protokoll</Title>
      <Card>
        {st?.jobs.length ? (
          st.jobs.map((j) => (
            <ListRow
              key={j.id}
              title={`${KIND[j.kind]} ${j.from === j.to ? j.to : `${j.from} → ${j.to}`}`}
              detail={`${when(j.startedAt)}${j.error ? ` · ${j.error}` : ''}`}
              value={STATUS[j.status].label}
              valueTone={STATUS[j.status].tone}
              onPress={() => show(j)}
            >
              {open === j.id ? (
                <ScrollView horizontal>
                  <Text style={[type.small, { color: p.ink2, fontFamily: undefined }]}>{log}</Text>
                </ScrollView>
              ) : null}
            </ListRow>
          ))
        ) : (
          <ListRow title={st ? 'Noch keine Vorgänge' : 'Lädt …'} />
        )}
      </Card>
      {st?.previous ? (
        <>
          <Body muted>
            Zurück auf {st.previous} spielt die Sicherung von vor dem letzten Update ein. Änderungen
            seit dem Update gehen verloren, der aktuelle Stand wird vorher gesichert.
          </Body>
          <Button
            label={confirm ? `Wirklich zurück auf ${st.previous}` : `Zurück auf ${st.previous}`}
            variant="secondary"
            onPress={rollback}
          />
        </>
      ) : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button label="Zurück" variant="secondary" onPress={() => goBack('/admin')} />
    </Screen>
  );
}
