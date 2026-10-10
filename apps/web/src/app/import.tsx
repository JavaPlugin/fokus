// Importieren: FOKUS-Datei (Export). Erst Vorschau, dann „Zusammenführen“ oder „Ersetzen“.
// Vor dem Ersetzen lädt die App eine Sicherung herunter.
import { Body, Button, Card, ListRow, Notice, Sheet, Title } from '@fokus/ui';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { Screen } from '../components/Screen';
import { api } from '../lib/api';
import { downloadExport } from '../lib/data';
import { goBack } from '../components/BackButton';

const ACCEPT = '.json,application/json';

type Counts = Record<string, number>;

const LABEL: Record<string, string> = { settings: 'Einstellungen' };

export default function Import() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Web: eigenes <input type="file">, im Tipp selbst geöffnet (sonst blockiert Safari die
  // Dateiwahl, besonders in der installierten App). Nativ: Dokumentenauswahl.
  function pick() {
    setError('');
    setCounts(null);
    setDone(null);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT;
      input.style.display = 'none';
      input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (file) void file.arrayBuffer().then((buf) => read(file.name, buf));
      };
      document.body.appendChild(input);
      input.click();
      return;
    }
    void DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: false,
    }).then(async (res) => {
      if (res.canceled) return;
      const asset = res.assets[0]!;
      await read(asset.name, await (await fetch(asset.uri)).arrayBuffer());
    });
  }

  async function read(name: string, buf: ArrayBuffer) {
    const t = new TextDecoder('utf-8').decode(buf);
    setFileName(name);
    setBusy(true);
    try {
      const p = await api<{ counts: Counts }>('/api/import/preview', { body: { text: t } });
      setText(t);
      setCounts(p.counts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(mode: 'merge' | 'replace') {
    if (mode === 'replace' && !confirm) return setConfirm(true);
    setBusy(true);
    setError('');
    try {
      if (mode === 'replace') downloadExport();
      await api('/api/import', { body: { text, mode } });
      setDone(mode === 'replace' ? 'Ersetzt.' : 'Zusammengeführt.');
      setCounts(null);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Importieren">
      <Title>Importieren</Title>
      <Body muted>Eine FOKUS-Datei (Export). Du siehst vorher, was hineinkommt.</Body>
      {done ? <Notice tone="positive">{done}</Notice> : null}
      <Button label="Datei wählen" loading={busy} onPress={pick} />
      <Sheet open={!!counts} onClose={() => setCounts(null)} title="Vorschau">
        {counts ? (
          <>
            <Card>
              <ListRow title="Datei" detail={fileName} />
              {Object.entries(counts).map(([k, n]) => (
                <ListRow key={k} title={LABEL[k] ?? k} value={String(n)} />
              ))}
            </Card>
            <Body muted>
              Zusammenführen ergänzt nur, was noch fehlt. Ersetzen löscht vorher deine jetzigen
              Daten.
            </Body>
            <Button label="Zusammenführen" loading={busy} onPress={() => run('merge')} />
            <Button
              label={confirm ? 'Wirklich ersetzen' : 'Ersetzen'}
              variant="secondary"
              loading={busy}
              onPress={() => run('replace')}
            />
            {confirm ? (
              <Notice tone="warning">
                Deine jetzigen Daten werden ersetzt. Vorher lädt FOKUS automatisch eine Sicherung
                herunter.
              </Notice>
            ) : null}
          </>
        ) : null}
        {error && counts ? <Notice tone="negative">{error}</Notice> : null}
      </Sheet>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button
        label={done ? 'Fertig' : 'Zurück'}
        variant="secondary"
        onPress={() => (done ? router.replace('/') : goBack('/profil'))}
      />
    </Screen>
  );
}
