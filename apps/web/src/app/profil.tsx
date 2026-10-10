// Profil: Profilkarte, Suche, Kacheln mit Live-Stand, unten Konto.
import {
  accents,
  Body,
  Button,
  Card,
  Chip,
  Chips,
  Field,
  font,
  HeroCard,
  IconTile,
  ListRow,
  Notice,
  Sheet,
  SymbolIcon,
  TileGrid,
  Toggle,
  type,
  usePalette,
  useSchemeChoice,
  type SchemeChoice,
  type SymbolKey,
  type UiSymbol,
  useGlass,
  useLessMotion,
} from '@fokus/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { goBack } from '../components/BackButton';
import { rememberMe, useMe } from '../components/HeadButtons';
import { LegalLinks } from '../components/LegalLinks';
import { NotifySettings } from '../components/NotifySettings';
import { PlanSettings } from '../components/PlanSettings';
import { Screen } from '../components/Screen';
import { api, authClient } from '../lib/api';
import { endSession } from '../lib/session';
import { downloadExport } from '../lib/data';
import { monthName } from '../lib/format';
import { usePrivacy } from '../lib/privacy';
import { initials } from '../lib/format';
import { chooseGlass, chooseLessMotion, chooseScheme } from '../lib/theme';
import { navigateAfterSheets } from '../lib/nav';
import { useInstall } from '../lib/install';

type SheetKind = 'notify' | 'plan' | 'look' | 'data' | 'name' | null;
type Prefs = { channel: 'app' | 'email' | 'both' };

const CHANNEL = { app: 'In der App', email: 'Per E-Mail', both: 'App und E-Mail' } as const;
const SCHEME: Record<SchemeChoice, string> = { system: 'System', light: 'Hell', dark: 'Dunkel' };

export default function Profil() {
  const p = usePalette();
  const me = useMe();
  const privacy = usePrivacy();
  const glassOn = useGlass();
  const lessMotion = useLessMotion();
  const scheme = useSchemeChoice();
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [notify, setNotify] = useState<{ prefs: Prefs } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState('');
  const installed = useInstall().standalone;

  useFocusEffect(
    useCallback(() => {
      api<{ prefs: Prefs }>('/api/notify')
        .then(setNotify)
        .catch(() => undefined);
    }, []),
  );

  const admin = me?.role === 'admin';

  type Tile = {
    id: string;
    symbol: SymbolKey | UiSymbol;
    color: string;
    title: string;
    detail: string;
    /** Unterpunkte für die Suche */
    keys: string;
    onPress: () => void;
    wide?: boolean;
  };
  const daily: Tile[] = [
    {
      id: 'notify',
      symbol: 'glocke',
      color: accents.red.from,
      title: 'Benachrichtigungen',
      detail: notify ? CHANNEL[notify.prefs.channel] : 'Erinnerungen, Rückblick, Push',
      keys: 'mitteilung push e-mail erinnerung rückblick',
      onPress: () => setSheet('notify'),
      wide: true,
    },
    {
      id: 'plan',
      symbol: 'uhr',
      color: accents.blue.from,
      title: 'Planung',
      detail: 'Fokus-Länge, Guthaben, Arbeitstag',
      keys: 'fokus pause guthaben limit arbeitstag minuten scrollen basis',
      onPress: () => setSheet('plan'),
    },
    {
      id: 'look',
      symbol: 'freizeit',
      color: accents.violet.from,
      title: 'Darstellung',
      detail: [
        SCHEME[scheme],
        glassOn ? 'Glas' : null,
        privacy.hidden || privacy.auto ? 'Privatmodus' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      keys: 'hell dunkel design glas bewegung animation verbergen privat',
      onPress: () => setSheet('look'),
    },
  ];
  const extras: Tile[] = [
    {
      id: 'shortcuts',
      symbol: 'pfeil',
      color: accents.gray.from,
      title: 'Kurzbefehle',
      detail: 'Siri, API, Smart Home',
      keys: 'api schlüssel webhooks entwickler home assistant',
      onPress: () => router.push('/entwickler'),
    },
    {
      id: 'data',
      symbol: 'datei',
      color: accents.gray.from,
      title: 'Daten',
      detail: 'Exportieren, Importieren',
      keys: 'export import sichern konto löschen',
      onPress: () => setSheet('data'),
    },
    {
      id: 'intro',
      symbol: 'bildung',
      color: accents.gray.from,
      title: 'Einführung',
      detail: 'So funktioniert FOKUS',
      keys: 'hilfe start einrichten umleiten',
      onPress: () => router.push({ pathname: '/einfuehrung', params: { wieder: '1' } }),
    },
    {
      id: 'redirect',
      symbol: 'uhr' as const,
      color: accents.violet.from,
      title: 'Umleiten einrichten',
      detail: 'Kurzbefehl für Instagram, TikTok & Co.',
      keys: 'umleiten kurzbefehle automation instagram tiktok social sperre',
      onPress: () =>
        router.push({ pathname: '/einfuehrung', params: { wieder: '1', schritt: 'umleiten' } }),
    },
    ...(!installed
      ? [
          {
            id: 'install',
            symbol: 'handy' as const,
            color: accents.green.from,
            title: 'Zum Home-Bildschirm',
            detail: 'Wie eine App starten',
            keys: 'installieren app iphone android',
            onPress: () =>
              router.push({
                pathname: '/einfuehrung',
                params: { wieder: '1', schritt: 'install' },
              }),
          },
        ]
      : []),
    ...(admin
      ? [
          {
            id: 'system',
            symbol: 'datenbank' as const,
            color: accents.gray.from,
            title: 'System',
            detail: 'Updates, Nutzer, Backups',
            keys: 'admin update nutzer backup vorlagen impressum rechtstexte datenschutz audit',
            onPress: () => router.push('/admin'),
          },
        ]
      : []),
  ];
  const match = (t: Tile) =>
    !q.trim() || `${t.title} ${t.detail} ${t.keys}`.toLowerCase().includes(q.trim().toLowerCase());
  const grid = (label: string, tiles: Tile[]) => {
    const shown = tiles.filter(match);
    if (!shown.length) return null;
    return (
      <View style={{ gap: 10 }}>
        <Text style={[type.small, { color: p.ink2, textTransform: 'uppercase' }]}>{label}</Text>
        <TileGrid>
          {shown.map((t) => (
            <IconTile
              key={t.id}
              symbol={t.symbol}
              color={t.color}
              title={t.title}
              detail={t.detail}
              onPress={t.onPress}
              wide={t.wide}
            />
          ))}
        </TileGrid>
      </View>
    );
  };

  // Sitzung beenden und alles Lokale löschen (lib/session.ts)
  const signOut = () => endSession();

  async function deleteAccount() {
    if (!confirmDelete) return setConfirmDelete(true);
    try {
      await api('/api/me', { method: 'DELETE' });
      await endSession({ server: false });
    } catch (e) {
      setConfirmDelete(false);
      setMsg((e as Error).message);
    }
  }

  const since = me?.createdAt ? monthName(me.createdAt.slice(0, 7)) : null;

  return (
    <Screen title="Profil">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={[type.section, { color: p.ink }]}>
          Profil
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profil schließen"
          onPress={() => goBack('/')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: p.surface2,
          }}
        >
          <Text style={[type.body, { color: p.ink }]}>✕</Text>
        </Pressable>
      </View>

      <HeroCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: p.ink,
            }}
          >
            <Text style={{ color: p.bg, fontSize: 22, fontFamily: font.bold }}>
              {me ? initials(me.name || me.email) : '·'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.section, { color: p.ink, fontFamily: font.bold }]}>
              {me?.name || me?.email || '…'}
            </Text>
            <Text style={[type.small, { color: p.ink2 }]}>
              {[since ? `Dabei seit ${since}` : '', admin ? 'Admin' : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Namen ändern"
            onPress={() => setSheet('name')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: p.pill,
            }}
          >
            <SymbolIcon name="stift" color={p.ink} size={16} />
          </Pressable>
        </View>
      </HeroCard>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 48,
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: p.surface,
        }}
      >
        <Text style={{ color: p.ink3 }}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Einstellung suchen"
          placeholderTextColor={p.ink3}
          accessibilityLabel="Einstellung suchen"
          style={[type.body, { flex: 1, color: p.ink, minHeight: 44 }]}
        />
      </View>

      {grid('Alltag', daily)}
      {grid('Extras', extras)}

      <Card>
        <ListRow
          title="Sicherheit"
          detail="Geräte, überall abmelden, Passkeys"
          value="›"
          onPress={() => router.push('/sicherheit')}
        />
        <ListRow title="Abmelden" onPress={signOut} />
        <ListRow
          title={confirmDelete ? 'Wirklich alles löschen' : 'Konto löschen'}
          detail={
            confirmDelete ? 'Dein Konto und alle Daten werden endgültig gelöscht.' : undefined
          }
          tone="negative"
          onPress={deleteAccount}
        />
      </Card>
      {msg ? <Notice tone="negative">{msg}</Notice> : null}
      <Text style={[type.small, { color: p.ink3, textAlign: 'center' }]}>
        FOKUS {me?.version?.replace(/^v/, '') ?? ''}
      </Text>
      <LegalLinks />

      <Sheet open={sheet === 'notify'} onClose={() => setSheet(null)} title="Benachrichtigungen">
        <NotifySettings />
      </Sheet>
      <Sheet open={sheet === 'plan'} onClose={() => setSheet(null)} title="Planung">
        {sheet === 'plan' ? <PlanSettings /> : null}
      </Sheet>
      <Sheet open={sheet === 'look'} onClose={() => setSheet(null)} title="Darstellung">
        <Chips>
          {(Object.keys(SCHEME) as SchemeChoice[]).map((k) => (
            <Chip
              key={k}
              label={SCHEME[k]}
              selected={scheme === k}
              onPress={() => chooseScheme(k)}
            />
          ))}
        </Chips>
        <Card>
          <Toggle label="Glas-Effekt" value={glassOn} onChange={chooseGlass} />
          <Toggle label="Weniger Bewegung" value={lessMotion} onChange={chooseLessMotion} />
        </Card>
        <Card>
          <Toggle label="Titel verbergen" value={privacy.hidden} onChange={privacy.toggle} />
          <Toggle
            label="Beim Öffnen automatisch verbergen"
            value={privacy.auto}
            onChange={privacy.setAuto}
          />
        </Card>
      </Sheet>
      <Sheet open={sheet === 'data'} onClose={() => setSheet(null)} title="Daten">
        <Card>
          <ListRow
            title="Exportieren"
            detail="Alles als Datei sichern"
            value="›"
            onPress={() => downloadExport()}
          />
          <ListRow
            title="Importieren"
            detail="FOKUS-Datei"
            value="›"
            onPress={() => (setSheet(null), navigateAfterSheets('/import'))}
          />
        </Card>
        <Body muted>Konto löschen findest du unten im Profil.</Body>
      </Sheet>
      <NameSheet open={sheet === 'name'} name={me?.name ?? ''} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function NameSheet({ open, name, onClose }: { open: boolean; name: string; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  if (open !== shown) {
    setShown(open);
    setValue(name);
    setError('');
  }
  async function submit() {
    const n = value.trim();
    if (!n) return setError('Gib einen Namen ein.');
    const r = await authClient.updateUser({ name: n });
    if (r.error) return setError(r.error.message ?? 'Das hat nicht geklappt.');
    rememberMe({ name: n });
    onClose();
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Name"
      action={{ label: 'Sichern', onPress: () => void submit(), disabled: !value.trim() }}
    >
      <Field label="Name" value={value} onChangeText={setValue} />
      {error ? <Notice tone="negative">{error}</Notice> : null}
      <Button label="Sichern" onPress={() => void submit()} />
    </Sheet>
  );
}
