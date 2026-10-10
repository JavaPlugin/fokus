// Profil → Benachrichtigungen: Kanal, Arten, Test senden.
// Die Push-Erlaubnis fragt der Browser erst, wenn „App“ oder „Beides“ gewählt wird.
import {
  Body,
  Button,
  Notice,
  Section,
  Segmented,
  Toggle,
  font,
  type,
  usePalette,
} from '@fokus/ui';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { api, type Me } from '../lib/api';
import { enablePush, pushState, type PushState } from '../lib/push';

type Channel = 'app' | 'email' | 'both';
type Prefs = {
  channel: Channel;
  focus: boolean;
  social: boolean;
  recap: boolean;
};

const iosNotInstalled = () =>
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /iPhone|iPad/.test(navigator.userAgent) &&
  !window.matchMedia?.('(display-mode: standalone)').matches;

export function NotifySettings() {
  const p = usePalette();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [push, setPush] = useState<PushState>('unsupported');
  const [admin, setAdmin] = useState(false);
  const [msg, setMsg] = useState<{
    tone: 'positive' | 'warning' | 'negative';
    text: string;
  } | null>(null);

  useEffect(() => {
    api<{ prefs: Prefs }>('/api/notify')
      .then((r) => setPrefs(r.prefs))
      .catch(() => undefined);
    void pushState().then(setPush);
    api<Me>('/api/me')
      .then((m) => setAdmin(m.role === 'admin'))
      .catch(() => undefined);
  }, []);

  async function store(next: Prefs) {
    setPrefs(next);
    setMsg(null);
    try {
      await api('/api/notify', { method: 'PUT', body: next });
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  async function channel(c: Channel) {
    if (!prefs) return;
    await store({ ...prefs, channel: c });
    // Erlaubnis erst jetzt anfragen, nicht vorher
    if (c !== 'email' && push !== 'on') {
      if (iosNotInstalled())
        return setMsg({
          tone: 'warning',
          text: 'Erst zum Home-Bildschirm hinzufügen, dann gehen App-Mitteilungen.',
        });
      const s = await enablePush().catch(() => 'unsupported' as const);
      setPush(s);
      if (s === 'denied')
        setMsg({ tone: 'warning', text: 'Mitteilungen sind im Browser blockiert.' });
      if (s === 'unsupported')
        setMsg({ tone: 'warning', text: 'Dieser Browser kann keine App-Mitteilungen.' });
    }
  }

  async function test() {
    setMsg(null);
    try {
      await api('/api/notify/test', { method: 'POST', body: {} });
      setMsg({
        tone: 'positive',
        text:
          prefs?.channel === 'app'
            ? 'Test gesendet. Die Mitteilung sollte gleich erscheinen.'
            : 'Test gesendet. Schau in dein Postfach.',
      });
    } catch (e) {
      setMsg({ tone: 'negative', text: (e as Error).message });
    }
  }

  if (!prefs) return null;
  const t = (k: keyof Omit<Prefs, 'channel'>, label: string) => (
    <Toggle label={label} value={prefs[k]} onChange={(v) => void store({ ...prefs, [k]: v })} />
  );
  return (
    <Section title="Benachrichtigungen">
      <View style={{ backgroundColor: p.surface, borderRadius: 18, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={[type.body, { color: p.ink, fontFamily: font.medium }]}>
            Wie möchtest du benachrichtigt werden?
          </Text>
          <Segmented<Channel>
            value={prefs.channel}
            onChange={(c) => void channel(c)}
            options={[
              { value: 'app', label: 'App' },
              { value: 'email', label: 'E-Mail' },
              { value: 'both', label: 'Beides' },
            ]}
          />
        </View>
        {t('focus', 'Vor einem Fokus-Block')}
        {t('social', 'Vor einem Social-Slot')}
        {t('recap', 'Tagesrückblick am Abend')}
      </View>
      <Body muted>
        App-Mitteilungen gehen auf dem iPhone nur, wenn FOKUS auf dem Home-Bildschirm liegt.
      </Body>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {admin ? <Button label="Test senden" variant="secondary" onPress={test} /> : null}
    </Section>
  );
}
