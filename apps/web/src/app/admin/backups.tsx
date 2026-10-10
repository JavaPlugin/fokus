import { Body, Button, Card, ListRow, Notice, Title } from '@fokus/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Screen } from '../../components/Screen';
import { API_BASE, api, progress, type Backup, type SystemStatus } from '../../lib/api';
import { bytes, when } from '../../lib/format';
import { goBack } from '../../components/BackButton';

const KIND: Record<string, string> = {
  nightly: 'Nächtlich',
  manuell: 'Manuell',
  'vor update': 'Vor Update',
  'vor rollback': 'Vor Rollback',
  'vor wiederherstellung': 'Vor Wiederherstellung',
};

export default function Backups() {
  const [list, setList] = useState<Backup[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offsite, setOffsite] = useState<NonNullable<SystemStatus['updater']>['offsite'] | null>(
    null,
  );
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{
    tone: 'positive' | 'negative' | 'warning';
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      void api<SystemStatus>('/api/admin/system')
        .then((s) => setOffsite(s.updater?.offsite ?? null))
        .catch(() => undefined);
      setList(await api<Backup[]>('/api/admin/backups'));
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function backupNow() {
    try {
      await api('/api/admin/backups', { method: 'POST' });
      setMsg({ tone: 'positive', text: 'Sicherung läuft. Sie erscheint gleich in der Liste.' });
      setTimeout(() => void load(), 4000);
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  async function restore(name: string) {
    if (!confirm) return setConfirm(true);
    try {
      await api(`/api/admin/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' });
      // Die Wartungsseite zeigt den Fortschritt und lädt danach neu.
      // Erst neu laden, wenn das Einspielen fertig ist (Fortschritt kommt auch während der Wartung).
      const wait = async (): Promise<void> => {
        const s = await progress();
        if (s && s.kind === 'restore' && s.state !== 'running') return window.location.reload();
        setTimeout(() => void wait(), 2000);
      };
      setTimeout(() => void wait(), 2000);
      setMsg({
        tone: 'warning',
        text: 'Wird eingespielt. Die App ist gleich kurz nicht erreichbar.',
      });
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  const sel = list?.find((b) => b.name === selected);

  return (
    <Screen title="Backups">
      <Title>Backups</Title>
      <Body muted>
        Jede Nacht um 3 Uhr, vor jedem Update und auf Knopfdruck. Aufbewahrt 30 Tage.
      </Body>
      <Card>
        <ListRow
          title="Außer Haus (verschlüsselt)"
          detail={
            !offsite?.enabled
              ? 'Nicht eingerichtet: siehe docs/betrieb.md'
              : offsite.lastError
                ? `Fehler: ${offsite.lastError}`
                : offsite.lastUpload
                  ? `zuletzt ${when(offsite.lastUpload)}`
                  : 'Wartet auf die erste Sicherung'
          }
          value={offsite?.enabled ? (offsite.lastError ? 'Fehler' : 'An') : 'Aus'}
          valueTone={offsite?.lastError ? 'negative' : offsite?.enabled ? 'positive' : 'warning'}
        />
      </Card>
      <Button label="Jetzt sichern" onPress={backupNow} />
      {sel ? (
        <Card>
          <ListRow
            title={KIND[sel.kind] ?? sel.kind}
            detail={`${when(sel.createdAt)} · ${bytes(sel.size)}`}
          />
          <ListRow
            title="Herunterladen"
            onPress={() =>
              window.open(`${API_BASE}/api/admin/backups/${encodeURIComponent(sel.name)}`, '_blank')
            }
          />
          <ListRow
            title={confirm ? 'Wirklich wiederherstellen' : 'Wiederherstellen'}
            detail={
              confirm
                ? 'Alles seit dieser Sicherung geht verloren. Vorher wird der aktuelle Stand gesichert.'
                : undefined
            }
            tone="negative"
            onPress={() => restore(sel.name)}
          />
          <ListRow title="Abbrechen" onPress={() => (setSelected(null), setConfirm(false))} />
        </Card>
      ) : null}
      <Card>
        {list?.length ? (
          list.map((b) => (
            <ListRow
              key={b.name}
              title={when(b.createdAt)}
              detail={KIND[b.kind] ?? b.kind}
              value={bytes(b.size)}
              onPress={() => (setSelected(b.name), setConfirm(false))}
            />
          ))
        ) : (
          <ListRow title={list ? 'Noch keine Backups' : 'Lädt …'} />
        )}
      </Card>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button label="Zurück" variant="secondary" onPress={() => goBack('/admin')} />
    </Screen>
  );
}
