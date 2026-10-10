// Admin → Nutzer: Liste (Name, E-Mail, Rolle, registriert, zuletzt aktiv, Status) und je Nutzer
// ein Sheet mit Rolle, Sperren, Sitzungen, Passkeys, Anmeldelink und Löschen (Namen eintippen).
// Schutzregeln prüft der Server (apps/api/src/users.ts). Keine Inhalte, nur Zählwerte.
import { Body, Button, Card, Field, ListRow, Notice, Segmented, Sheet, Title } from '@fokus/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { goBack } from '../../components/BackButton';
import { Screen } from '../../components/Screen';
import { api, type Me } from '../../lib/api';

type U = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastSeen: string | null;
  passkeys: number;
};
/** Nur Zählwerte je Nutzer (Admins sehen keine Inhalte). */
type Usage = Record<string, { tasks: number; lastSeen: string | null }>;

const dmy = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '–';
const status = (u: U) =>
  u.banned ? 'gesperrt' : !u.emailVerified ? 'unbestätigt' : u.role === 'admin' ? 'Admin' : '';

export default function Nutzer() {
  const [users, setUsers] = useState<U[]>([]);
  const [usage, setUsage] = useState<Usage>({});
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/me'));
      setUsage(await api<Usage>('/api/admin/usage').catch(() => ({})));
      setUsers(await api<U[]>('/api/admin/users'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function createInvite() {
    setError('');
    try {
      const r = await api<{ url: string }>('/api/admin/invites', { body: {} });
      setInvite(r.url);
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copy() {
    if (!invite) return;
    await navigator.clipboard?.writeText(invite);
    setCopied(true);
  }

  const current = users.find((u) => u.id === open) ?? null;
  return (
    <Screen title="Nutzer">
      <Title>Nutzer</Title>
      <Body muted>Nur Konto, Status und Umfang. Inhalte anderer siehst du nicht.</Body>
      <Card>
        {users.map((u) => (
          <ListRow
            key={u.id}
            title={u.id === me?.id ? `${u.name} (du)` : u.name}
            detail={[u.email, `seit ${dmy(u.createdAt)}`, `zuletzt ${dmy(u.lastSeen)}`].join(' · ')}
            tone={u.banned ? 'negative' : !u.emailVerified ? 'warning' : undefined}
            value={`${status(u)} ›`.trim()}
            onPress={() => setOpen(u.id)}
          />
        ))}
      </Card>
      {invite ? (
        <Card>
          <ListRow
            title="Einladungslink"
            detail={invite}
            value={copied ? 'Kopiert' : 'Kopieren'}
            onPress={copy}
          />
        </Card>
      ) : null}
      <Body muted>Ein Einladungslink gilt 7 Tage und nur für eine Person.</Body>
      <Button label="Neue Einladung" onPress={createInvite} />
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button label="Zurück" variant="secondary" onPress={() => goBack('/admin')} />
      <UserSheet
        user={current}
        self={current?.id === me?.id}
        usage={current ? usage[current.id] : undefined}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </Screen>
  );
}

function UserSheet({
  user: u,
  self,
  usage,
  onClose,
  onChanged,
}: {
  user: U | null;
  self: boolean;
  usage?: Usage[string];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<'ban' | 'sessions' | 'passkeys' | null>(null);
  const [del, setDel] = useState(false);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  if ((u?.id ?? null) !== shownFor) {
    setShownFor(u?.id ?? null);
    setAsk(null);
    setDel(false);
    setTyped('');
    setMsg(null);
  }

  async function run(path: string, method: string, body: unknown, done: string) {
    setMsg(null);
    try {
      await api(path, { method, body });
      setAsk(null);
      setMsg({ tone: 'positive', text: done });
      await onChanged();
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }
  /** Erst tippen fragt nach, zweites Tippen führt aus. */
  const twice = (k: NonNullable<typeof ask>, fn: () => void) => () =>
    ask === k ? fn() : setAsk(k);

  async function remove() {
    if (!u) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE', body: { name: typed } });
      setDel(false);
      onClose();
      await onChanged();
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  const base = u ? `/api/admin/users/${u.id}` : '';
  return (
    <>
      <Sheet open={!!u && !del} onClose={onClose} title={u?.name}>
        {u ? (
          <>
            <Card>
              <ListRow title="E-Mail" value={u.email} />
              <ListRow title="Registriert" value={dmy(u.createdAt)} />
              <ListRow title="Zuletzt aktiv" value={dmy(u.lastSeen)} />
              <ListRow
                title="Status"
                value={u.banned ? 'Gesperrt' : u.emailVerified ? 'Aktiv' : 'Unbestätigt'}
              />
              <ListRow title="Umfang" value={`${usage?.tasks ?? 0} Aufgaben`} />
            </Card>
            {self ? (
              <Body muted>Das bist du. Rolle, Sperre und Löschen gehen hier nicht.</Body>
            ) : (
              <Segmented<'user' | 'admin'>
                value={u.role}
                options={[
                  { value: 'user', label: 'Nutzer' },
                  { value: 'admin', label: 'Admin' },
                ]}
                onChange={(role) =>
                  void run(
                    `${base}/role`,
                    'PUT',
                    { role },
                    role === 'admin' ? 'Jetzt Admin.' : 'Jetzt Nutzer.',
                  )
                }
              />
            )}
            <Card>
              {self ? null : (
                <ListRow
                  title={u.banned ? 'Entsperren' : 'Sperren'}
                  detail={
                    ask === 'ban'
                      ? 'Noch einmal tippen zum Bestätigen'
                      : u.banned
                        ? 'Kann sich wieder anmelden'
                        : 'Meldet sofort überall ab'
                  }
                  tone={u.banned ? undefined : 'negative'}
                  onPress={twice(
                    'ban',
                    () =>
                      void run(
                        `${base}/ban`,
                        'PUT',
                        { banned: !u.banned },
                        u.banned ? 'Entsperrt.' : 'Gesperrt.',
                      ),
                  )}
                />
              )}
              <ListRow
                title="Alle Sitzungen beenden"
                detail={
                  ask === 'sessions'
                    ? 'Noch einmal tippen zum Bestätigen'
                    : 'Auf allen Geräten abmelden'
                }
                onPress={twice(
                  'sessions',
                  () =>
                    void run(`${base}/sessions`, 'DELETE', undefined, 'Alle Sitzungen beendet.'),
                )}
              />
              <ListRow
                title="Passkeys zurücksetzen"
                detail={
                  ask === 'passkeys'
                    ? 'Noch einmal tippen zum Bestätigen'
                    : `${u.passkeys} ${u.passkeys === 1 ? 'Passkey' : 'Passkeys'} · Anmeldung dann per E-Mail-Link`
                }
                onPress={
                  u.passkeys
                    ? twice(
                        'passkeys',
                        () =>
                          void run(`${base}/passkeys`, 'DELETE', undefined, 'Passkeys entfernt.'),
                      )
                    : undefined
                }
              />
              {u.banned ? null : (
                <ListRow
                  title={u.emailVerified ? 'Anmeldelink senden' : 'Einladung erneut senden'}
                  detail={u.email}
                  onPress={() => void run(`${base}/link`, 'POST', undefined, 'Link gesendet.')}
                />
              )}
            </Card>
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
            {self ? null : (
              <Button label="Nutzer löschen" variant="secondary" onPress={() => setDel(true)} />
            )}
          </>
        ) : null}
      </Sheet>

      <Sheet open={!!u && del} onClose={() => setDel(false)} title="Nutzer löschen">
        {u ? (
          <>
            <Body>Alle Daten von {u.name} werden endgültig gelöscht.</Body>
            <Field
              label={`Zum Bestätigen „${u.name}“ eintippen`}
              value={typed}
              onChangeText={setTyped}
            />
            {msg?.tone === 'negative' ? <Notice tone="negative">{msg.text}</Notice> : null}
            <Button
              label="Endgültig löschen"
              variant="danger"
              disabled={typed.trim() !== u.name.trim()}
              onPress={() => void remove()}
            />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
