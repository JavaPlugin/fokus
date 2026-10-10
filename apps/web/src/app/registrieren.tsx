import { Body, Button, Field, Notice, Title } from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TermsCheck } from '../components/Legal';
import { useBotGuard } from '../components/Honeypot';
import { View } from 'react-native';
import { LegalLinks } from '../components/LegalLinks';
import { Screen } from '../components/Screen';
import { api } from '../lib/api';
import { safeNext } from '../lib/nav';
import { PageHead } from '../components/PageHead';

export default function Registrieren() {
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);
  const [name, setName] = useState('');
  const bot = useBotGuard();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/api/register', { body: { name, email, next, acceptTerms, ...bot.fields() } });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHead title="Konto anlegen" description="Kostenlos ein FOKUS-Konto anlegen." social />
      <Title>Konto anlegen</Title>
      <View style={{ gap: 16 }}>
        {done ? (
          <Body>Fast geschafft. Tippe auf den Link, den wir an {email} geschickt haben.</Body>
        ) : (
          <>
            <Body muted>Kein Passwort nötig: du meldest dich per Link oder Face ID an.</Body>
            <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
            {bot.field}
            <Field
              label="E-Mail"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <TermsCheck value={acceptTerms} onChange={setAcceptTerms} />
            <Button
              label="Konto anlegen"
              loading={busy}
              disabled={!name.trim() || !email.includes('@') || !acceptTerms}
              onPress={submit}
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
