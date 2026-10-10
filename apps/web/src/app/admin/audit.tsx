// System → Audit-Log: wer hat wann welche Admin-Aktion ausgeführt (die letzten 200).
import { Body, Card, ListRow, Notice, Title } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { Screen } from '../../components/Screen';
import { api } from '../../lib/api';
import { when } from '../../lib/format';

type Row = {
  id: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/** „PUT /api/admin/settings“ → „Einstellungen geändert“ (bekannte Aktionen lesbar). */
const LABEL: [RegExp, string][] = [
  [/^PUT \/api\/admin\/settings$/, 'Einstellungen geändert'],
  [/^POST \/api\/admin\/invites$/, 'Einladung erstellt'],
  [/^POST \/api\/admin\/updates\/install$/, 'Update gestartet'],
  [/^POST \/api\/admin\/updates\/rollback$/, 'Rollback gestartet'],
  [/^POST \/api\/admin\/backups$/, 'Backup erstellt'],
  [/^POST \/api\/admin\/backups\/.+\/restore$/, 'Backup wiederhergestellt'],
  [/^PUT \/api\/admin\/email-templates\//, 'E-Mail-Vorlage gesichert'],
  [/^DELETE \/api\/admin\/email-templates\//, 'E-Mail-Vorlage zurückgesetzt'],
  [/^POST \/api\/auth\/admin\/ban-user$/, 'Nutzer gesperrt'],
  [/^POST \/api\/auth\/admin\/unban-user$/, 'Nutzer entsperrt'],
  [/^POST \/api\/auth\/admin\/set-role$/, 'Rolle geändert'],
];
const label = (a: string) => LABEL.find(([re]) => re.test(a))?.[1] ?? a;

export default function Audit() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Row[]>('/api/admin/audit')
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <Screen title="Audit-Log">
      <BackButton parent="/admin" label="System" />
      <Title>Audit-Log</Title>
      <Body muted>Jede Änderung im Admin-Bereich mit Person und Zeit. Ohne Geheimnisse.</Body>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Card>
        {(rows ?? []).map((r) => (
          <ListRow
            key={r.id}
            title={label(r.action)}
            detail={[
              r.actorEmail ?? 'automatisch',
              when(r.createdAt),
              r.detail ? JSON.stringify(r.detail) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        {rows && !rows.length ? <ListRow title="Noch keine Einträge" /> : null}
      </Card>
    </Screen>
  );
}
