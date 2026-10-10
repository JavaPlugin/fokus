import { Body, Button, Card, Field, ListRow, Notice, Title } from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../components/Screen';
import { api, authClient, type SetupStatus } from '../lib/api';

type Step = 'code' | 'adresse' | 'admin' | 'mail' | 'passkey';

// Der Setup-Code muss den Wechsel über den Mail-Link überleben (neuer Tab). Nur bis zum Abschluss.
const KEY = 'fk_setup_code';
const store = {
  get: () => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* privates Fenster */
    }
  },
};

export default function Setup() {
  const params = useLocalSearchParams<{ schritt?: string }>();
  const [step, setStep] = useState<Step>(params.schritt === 'passkey' ? 'passkey' : 'code');
  const [code, setCode] = useState('');
  const [askCode, setAskCode] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = store.get();
    setCode(saved);
    setAskCode(!saved);
    api<SetupStatus>('/api/setup/status')
      .then((s) => {
        if (s.setupCompleted) router.replace('/');
        setStatus(s);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const steps: Record<Step, React.ReactNode> = {
    code: (
      <>
        <Body muted>
          Willkommen. Gib den Setup-Code ein, den install.sh am Ende angezeigt hat. Er steht auch in
          /opt/fokus/.env.
        </Body>
        <Field
          label="Setup-Code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <Button
          label="Weiter"
          loading={busy}
          disabled={!code.trim()}
          onPress={() =>
            run(async () => {
              await api('/api/setup/verify', { body: { code: code.trim() } });
              store.set(code.trim());
              setStep('adresse');
            })
          }
        />
      </>
    ),
    adresse: (
      <>
        <Body muted>Passkeys sind fest an diese Adresse gebunden. Prüfe, ob sie stimmt.</Body>
        <Card>
          <ListRow title="Adresse" value={status?.publicUrl ?? '…'} />
          <ListRow
            title="Aufgerufen über diese Adresse"
            value={status?.hostMatches ? 'ja' : 'nein'}
          />
          <ListRow title="HTTPS" value={status?.https ? 'ja' : 'nein'} />
        </Card>
        {status && (!status.hostMatches || !status.https) ? (
          <Notice tone="warning">
            Öffne die App über {status.publicUrl}. Sonst funktionieren Passkeys später nicht. Die
            Adresse änderst du in /opt/fokus/.env (PUBLIC_URL).
          </Notice>
        ) : null}
        <Button label="Adresse stimmt" onPress={() => setStep('admin')} />
      </>
    ),
    admin: (
      <>
        <Body muted>
          Lege dein Admin-Konto an. Du bekommst einen Anmeldelink per Mail. Damit ist auch der
          Mailversand getestet.
        </Body>
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
        <Field
          label="E-Mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Button
          label="Link senden"
          loading={busy}
          disabled={!name.trim() || !email.trim()}
          onPress={() =>
            run(async () => {
              await api('/api/setup/admin', { body: { code, name, email } });
              setStep('mail');
            })
          }
        />
      </>
    ),
    mail: (
      <>
        <Body>Die Mail ist unterwegs an {email}.</Body>
        <Body muted>
          Tippe auf den Link in der Mail. Keine Mail nach zwei Minuten? Schau in den Spam-Ordner und
          prüfe die SMTP-Werte in /opt/fokus/.env.
        </Body>
        <Button label="Andere Adresse" variant="secondary" onPress={() => setStep('admin')} />
      </>
    ),
    passkey: (
      <>
        <Body muted>
          Du bist angemeldet. Richte jetzt einen Passkey ein, dann meldest du dich künftig mit Face
          ID an.
        </Body>
        {askCode ? (
          <Field label="Setup-Code" value={code} onChangeText={setCode} autoCapitalize="none" />
        ) : null}
        <Button
          label="Passkey einrichten"
          loading={busy}
          disabled={!code.trim()}
          onPress={() =>
            run(async () => {
              const r = await authClient.passkey.addPasskey({ name: 'FOKUS' });
              if (r?.error)
                throw new Error(r.error.message ?? 'Passkey konnte nicht angelegt werden.');
              await finish();
            })
          }
        />
        <Button
          label="Später"
          variant="secondary"
          disabled={busy || !code.trim()}
          onPress={() => run(finish)}
        />
      </>
    ),
  };

  async function finish() {
    await api('/api/setup/complete', { body: { code: code.trim() } });
    store.set(null);
    router.replace('/einfuehrung');
  }

  return (
    <Screen title="Einrichtung">
      <Title>Einrichten</Title>
      <View style={{ gap: 16 }}>
        {steps[step]}
        {error ? <Notice tone="negative">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
