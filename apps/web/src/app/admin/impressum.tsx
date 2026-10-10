import { Body, Button, Field, Notice, Title } from '@fokus/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { api, type SystemStatus } from '../../lib/api';
import { goBack } from '../../components/BackButton';

/** Angaben für Impressum und Datenschutz. Öffentlich sichtbar, liegen nur in der Datenbank. */
export default function ImpressumAdmin() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SystemStatus>('/api/admin/system')
      .then((s) => {
        setName(s.legal.name);
        setAddress(s.legal.address);
        setEmail(s.legal.email);
      })
      .catch((e: Error) => setMsg({ tone: 'negative', text: e.message }));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: { legal: { name, address, email } },
      });
      setMsg({ tone: 'positive', text: 'Gespeichert.' });
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Impressum bearbeiten">
      <Title>Impressum</Title>
      <Body muted>
        Pflicht, sobald FOKUS öffentlich erreichbar ist: Name, ladungsfähige Anschrift und eine
        E-Mail-Adresse. Erscheint im Impressum und in der Datenschutzerklärung.
      </Body>
      <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
      <Field
        label="Anschrift"
        value={address}
        onChangeText={setAddress}
        multiline
        placeholder={'Straße Nr.\nPLZ Ort'}
        style={{ minHeight: 80 }}
      />
      <Field
        label="E-Mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button label="Speichern" loading={busy} onPress={save} />
      <Button label="Ansehen" variant="secondary" onPress={() => router.push('/impressum')} />
      <Button label="Zurück" variant="secondary" onPress={() => goBack('/admin')} />
    </Screen>
  );
}
