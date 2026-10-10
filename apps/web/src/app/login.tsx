import { Body, Button, Field, Notice, Title } from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../components/Screen';
import { LegalLinks } from '../components/LegalLinks';
import { authClient } from '../lib/api';
import { safeNext } from '../lib/nav';
import { PageHead } from '../components/PageHead';

export default function Login() {
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'link' | 'passkey' | null>(null);

  async function sendLink() {
    setBusy('link');
    setError('');
    const callbackURL = `${window.location.origin}${next}`;
    const r = await authClient.signIn.magicLink({ email: email.trim(), callbackURL });
    setBusy(null);
    if (r.error) setError(r.error.message ?? 'Der Link konnte nicht gesendet werden.');
    else setSent(true);
  }

  async function passkey() {
    setBusy('passkey');
    setError('');
    const r = await authClient.signIn.passkey();
    setBusy(null);
    if (r?.error) setError('Anmeldung mit Passkey abgebrochen oder nicht möglich.');
    else router.replace(next);
  }

  return (
    <Screen>
      <PageHead title="Anmelden" description="Bei FOKUS anmelden, per Link oder Passkey." social />
      <Title>FOKUS</Title>
      <View style={{ gap: 16 }}>
        <Button label="Mit Face ID anmelden" loading={busy === 'passkey'} onPress={passkey} />
        <Body muted>Oder per Link an deine E-Mail-Adresse:</Body>
        {sent ? (
          <Body>
            Wenn es ein Konto für {email} gibt, ist der Link unterwegs. Er gilt 15 Minuten.
          </Body>
        ) : (
          <>
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
              variant="secondary"
              loading={busy === 'link'}
              disabled={!email.includes('@')}
              onPress={sendLink}
            />
          </>
        )}
        {error ? <Notice tone="negative">{error}</Notice> : null}
        <Button label="Zurück" variant="secondary" onPress={() => router.replace('/willkommen')} />
      </View>
      <LegalLinks />
    </Screen>
  );
}
