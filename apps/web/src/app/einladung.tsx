import { Body, Button, Field, Notice, Title } from '@fokus/ui';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TermsCheck } from '../components/Legal';
import { View } from 'react-native';
import { Screen } from '../components/Screen';
import { api } from '../lib/api';

export default function Einladung() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      await api('/api/invites/accept', { body: { token, name, email, acceptTerms } });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Einladung">
      <Title>Einladung</Title>
      <View style={{ gap: 16 }}>
        {!token ? (
          <Notice tone="negative">Der Link ist unvollständig. Bitte frag nach einem neuen.</Notice>
        ) : done ? (
          <Body>Fast geschafft. Tippe auf den Link, den wir an {email} geschickt haben.</Body>
        ) : (
          <>
            <Body muted>Du wurdest zu FOKUS eingeladen. Leg dein Konto an.</Body>
            <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
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
              onPress={accept}
            />
          </>
        )}
        {error ? <Notice tone="negative">{error}</Notice> : null}
      </View>
    </Screen>
  );
}
