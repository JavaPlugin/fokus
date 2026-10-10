// Profil → Sicherheit: angemeldete Geräte (Sitzungen) mit „Überall abmelden“, Passkeys.
import { Body, Button, Card, ListRow, Notice, Title } from '@fokus/ui';
import { useCallback, useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { ConfirmSheet, type Confirm } from '../components/ConfirmSheet';
import { Screen } from '../components/Screen';
import { authClient } from '../lib/api';
import { endSession } from '../lib/session';
import { ago } from '../lib/format';

type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  updatedAt: string | Date;
};
type Passkey = { id: string; name?: string | null; createdAt: string | Date };

/** „Safari auf iPhone“ statt der langen Browser-Kennung. */
function device(ua?: string | null) {
  if (!ua) return 'Unbekanntes Gerät';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Gerät';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${browser} auf ${os}`;
}

export default function Sicherheit() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(async () => {
    const [s, me, pk] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
      authClient.passkey.listUserPasskeys(),
    ]);
    if (s.error) setError(s.error.message ?? 'Sitzungen konnten nicht geladen werden.');
    else setSessions(s.data as Session[]);
    setCurrent(me.data?.session.token ?? null);
    if (!pk.error) setPasskeys((pk.data ?? []) as Passkey[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const others = sessions.filter((s) => s.token !== current);

  return (
    <Screen title="Sicherheit">
      <BackButton parent="/profil" label="Profil" />
      <Title>Sicherheit</Title>
      <Body muted>
        Hier siehst du, wo du angemeldet bist. Unbekanntes Gerät? Melde dich überall ab.
      </Body>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Card>
        {sessions.map((s) => (
          <ListRow
            key={s.id}
            title={device(s.userAgent)}
            detail={`${s.token === current ? 'Dieses Gerät · ' : ''}aktiv ${ago(String(s.updatedAt))}`}
            value={s.token === current ? undefined : 'Abmelden'}
            valueTone={s.token === current ? undefined : 'negative'}
            onPress={
              s.token === current
                ? undefined
                : () =>
                    void authClient
                      .revokeSession({ token: s.token })
                      .then(load)
                      .catch((e: Error) => setError(e.message))
            }
          />
        ))}
      </Card>
      <Button
        label="Überall sonst abmelden"
        variant="secondary"
        disabled={!others.length}
        onPress={() =>
          setConfirm({
            title: 'Überall sonst abmelden?',
            text: `${others.length} ${others.length === 1 ? 'Gerät wird' : 'Geräte werden'} abgemeldet. Dieses Gerät bleibt angemeldet.`,
            label: 'Abmelden',
            run: async () => {
              const r = await authClient.revokeOtherSessions();
              if (r.error) throw new Error(r.error.message ?? 'Das hat nicht geklappt.');
              setMsg('Alle anderen Geräte sind abgemeldet.');
              await load();
            },
          })
        }
      />
      {msg ? <Notice tone="positive">{msg}</Notice> : null}

      <Title>Passkeys</Title>
      <Body muted>Anmelden mit Face ID, Touch ID oder Geräte-PIN, ohne Passwort.</Body>
      <Card>
        {passkeys.length ? (
          passkeys.map((k) => (
            <ListRow
              key={k.id}
              title={k.name || 'Passkey'}
              detail={`angelegt ${ago(String(k.createdAt))}`}
              value="Entfernen"
              valueTone="negative"
              onPress={() =>
                setConfirm({
                  title: 'Passkey entfernen?',
                  text: 'Auf diesem Gerät meldest du dich danach wieder per Link an.',
                  label: 'Entfernen',
                  run: async () => {
                    const r = await authClient.passkey.deletePasskey({ id: k.id });
                    if (r.error) throw new Error(r.error.message ?? 'Das hat nicht geklappt.');
                    await load();
                  },
                })
              }
            />
          ))
        ) : (
          <ListRow title="Noch kein Passkey" />
        )}
      </Card>
      <Button
        label="Passkey hinzufügen"
        variant="secondary"
        onPress={() =>
          void authClient.passkey
            .addPasskey()
            .then((r) => (r?.error ? setError(r.error.message ?? 'Abgebrochen.') : load()))
        }
      />
      <Button label="Abmelden" variant="secondary" onPress={() => void endSession()} />
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
