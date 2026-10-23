// Anleitung „Umleiten einrichten“: Eine PWA sieht nicht, welche App geöffnet wird. Eine
// Automation der iPhone-Kurzbefehle fragt deshalb beim Öffnen der Social-App bei FOKUS nach
// (persönliche Adresse mit Schlüssel). Antwort „frei“ = nichts tun, sonst öffnet sie /umleiten.
// Wichtig: nie direkt „URL öffnen“ ohne Nachfrage, sonst kommt man nie in die App (Schleife).
import {
  Body,
  Button,
  Chip,
  Chips,
  CatTile,
  Notice,
  font,
  kindColors,
  type,
  usePalette,
} from '@fokus/ui';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { CopyBox } from './DevExtras';
import { Step, Tap } from './InstallGuide';

const APPS = [
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['x', 'X'],
  ['reddit', 'Reddit'],
] as const;

/** Die Adresse gibt es im Klartext nur beim Erstellen: auf diesem Gerät merken. */
const STORE = 'fk.gateUrl';
const read = () => {
  try {
    return globalThis.localStorage?.getItem(STORE) ?? null;
  } catch {
    return null;
  }
};
const write = (v: string) => {
  try {
    globalThis.localStorage?.setItem(STORE, v);
  } catch {
    // privates Fenster: dann eben nur jetzt sichtbar
  }
};

/** Zeile in einem Mini-Bildschirm. */
function Line({ text, strong }: { text: string; strong?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ height: 22, justifyContent: 'center', paddingHorizontal: 10 }}>
      <Text
        numberOfLines={1}
        style={[
          type.small,
          {
            fontSize: 11,
            color: strong ? p.ink : p.ink3,
            fontFamily: strong ? font.semibold : font.regular,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

type KeyState = { active: boolean; prefix: string | null; lastUsedAt: string | null };

export function RedirectGuide() {
  const [app, setApp] = useState<(typeof APPS)[number][0]>('instagram');
  const label = APPS.find(([k]) => k === app)![1];
  const [base, setBase] = useState<string | null>(read);
  const [state, setState] = useState<KeyState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [test, setTest] = useState('');

  useEffect(() => {
    api<KeyState>('/api/me/gate-key')
      .then(setState)
      .catch(() => undefined);
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    setTest('');
    try {
      const r = await api<{ gateUrl: string }>('/api/me/gate-key', { body: {} });
      write(r.gateUrl);
      setBase(r.gateUrl);
      setState({ active: true, prefix: null, lastUsedAt: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!base) return;
    setTest('');
    try {
      const r = await fetch(`${base}?app=${app}`, { cache: 'no-store' });
      const t = (await r.text()).trim();
      setTest(
        t === 'frei'
          ? `Funktioniert. Gerade frei: ${label} würde direkt aufgehen.`
          : t.includes('fehler=adresse')
            ? 'Die Adresse gilt nicht mehr. Erstelle eine neue.'
            : `Funktioniert. Gerade keine Social-Zeit: ${label} würde zu FOKUS umleiten.`,
      );
    } catch {
      setTest('Keine Verbindung. Prüfe dein Netz.');
    }
  }

  // Schlüssel gibt es, aber nicht auf diesem Gerät gemerkt: nur eine neue Adresse hilft
  const lost = !base && state?.active;
  const url = base ? `${base}?app=${app}` : null;

  return (
    <View style={{ gap: 16 }}>
      {!url ? (
        <View style={{ gap: 10 }}>
          <Body muted>
            {lost
              ? 'Du hast Umleiten schon auf einem anderen Gerät eingerichtet. Eine neue Adresse ersetzt die alte: Danach musst du sie in der Automation austauschen.'
              : 'Zuerst bekommst du eine persönliche Adresse. Damit fragt der Kurzbefehl bei FOKUS nach, ob du gerade darfst.'}
          </Body>
          <Button
            label={lost ? 'Neue Adresse erstellen' : 'Persönliche Adresse erstellen'}
            loading={busy}
            onPress={() => void create()}
          />
        </View>
      ) : null}
      {error ? <Notice tone="negative">{error}</Notice> : null}

      <Chips>
        {APPS.map(([k, l]) => (
          <Chip key={k} label={l} selected={app === k} onPress={() => setApp(k)} />
        ))}
      </Chips>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Step
          n={1}
          text={`Kurzbefehle → Automation → + → App → ${label}, „Ist geöffnet“, „Sofort ausführen“`}
        >
          <View style={{ padding: 10 }}>
            <CatTile color={kindColors.social} symbol="uhr" size={30} radius={9} />
          </View>
          <Line text={label} strong />
          <Line text="Ist geöffnet ✓" />
          <Line text="Sofort ausführen ✓" />
        </Step>
        <Step n={2} text="Aktion „Inhalt von URL abrufen“ mit deiner Adresse">
          <Line text="Inhalt von URL abrufen" strong />
          <Line text={url ? url.replace(/^https?:\/\//, '') : 'deine Adresse'} />
          <Tap style={{ right: 16, bottom: 14 }} />
        </Step>
        <Step n={3} text="Aktion „Wenn“: Inhalt von URL „enthält“ umleiten">
          <Line text="Wenn" strong />
          <Line text="Inhalt von URL" />
          <Line text="enthält „umleiten“" />
        </Step>
        <Step n={4} text="Darin „URLs öffnen“ mit „Inhalt von URL“">
          <Line text="URLs öffnen" strong />
          <Line text="Inhalt von URL" />
          <Line text="Ende Wenn" />
        </Step>
      </View>
      {url ? <CopyBox label="Adresse" value={url} /> : null}
      {url ? (
        <Button label="Adresse testen" variant="secondary" onPress={() => void check()} />
      ) : null}
      {test ? <Body muted>{test}</Body> : null}
      {state?.active ? (
        <Body muted>
          {state.lastUsedAt
            ? `Zuletzt hat der Kurzbefehl ${new Date(state.lastUsedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} nachgefragt.`
            : 'Der Kurzbefehl hat noch nie nachgefragt. Öffne einmal die App, um ihn zu prüfen.'}
        </Body>
      ) : null}
      {url ? (
        <Button
          label="Neue Adresse (alte wird ungültig)"
          variant="secondary"
          loading={busy}
          onPress={() => void create()}
        />
      ) : null}
      <Body muted>
        So klappt es ohne Schleife: Ist gerade Social-Zeit (Slot gestartet oder Guthaben genommen),
        bleibt {label} offen. Sonst öffnet FOKUS. Hast du früher eine Automation mit „URL öffnen“
        angelegt, lösch sie. Sie öffnet FOKUS immer, auch wenn du schon bezahlt hast.
      </Body>
    </View>
  );
}
