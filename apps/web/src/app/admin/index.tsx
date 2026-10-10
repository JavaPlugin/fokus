import {
  accents,
  alpha,
  Body,
  Button,
  Card,
  CatTile,
  catColors,
  font,
  goalPalettes,
  HeroCard,
  IconTile,
  ListRow,
  Notice,
  onAccent,
  ProgressBar,
  Section,
  TileGrid,
  TintCard,
  Title,
  type,
  usePalette,
} from '@fokus/ui';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { api, progress, type Release, type SystemStatus, type UpdateStatus } from '../../lib/api';
import { ago, bytes, changelog, when } from '../../lib/format';
import { BackButton } from '../../components/BackButton';

type Running = { kind: string; from: string; to: string; step: string; state: string };

/** System und Updates (nur Admins). Mockup „Admin-Panel“. */
export default function Admin() {
  const p = usePalette();
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [upd, setUpd] = useState<UpdateStatus | null>(null);
  const [updError, setUpdError] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setSys(await api<SystemStatus>('/api/admin/system'));
    } catch (e) {
      setError((e as Error).message);
    }
    try {
      const u = await api<UpdateStatus>('/api/admin/updates');
      setUpd(u);
      setUpdError('');
      if (u.job?.status === 'running') setRunning({ ...u.job, state: 'running' });
    } catch (e) {
      setUpdError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function check() {
    setBusy(true);
    try {
      setUpd(await api<UpdateStatus>('/api/admin/updates/check', { method: 'POST' }));
    } catch (e) {
      setUpdError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function install(r: Release) {
    if (confirm !== r.version) return setConfirm(r.version);
    setConfirm(null);
    setBusy(true);
    try {
      await api('/api/admin/updates/install', { body: { version: r.version } });
      setRunning({
        kind: 'install',
        from: upd!.current,
        to: r.version,
        step: 'Start',
        state: 'running',
      });
    } catch (e) {
      setUpdError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRegistration() {
    if (!sys) return;
    if (confirm !== 'registration') return setConfirm('registration');
    setConfirm(null);
    const next = sys.registrationMode === 'open' ? 'invite' : 'open';
    await api('/api/admin/settings', { method: 'PUT', body: { registrationMode: next } });
    setSys({ ...sys, registrationMode: next });
  }

  async function toggleTestReleases() {
    if (!sys) return;
    await api('/api/admin/settings', {
      method: 'PUT',
      body: { showTestReleases: !sys.showTestReleases },
    });
    await load();
  }

  if (running) return <Progress run={running} onDone={() => (setRunning(null), void load())} />;

  const latest = upd?.available[0];
  const healthy = !!sys?.updater && !updError;

  const label = (t: string) => (
    <Text style={[type.small, { color: p.ink2, textTransform: 'uppercase', marginTop: 4 }]}>
      {t}
    </Text>
  );
  const violet = goalPalettes.violet;

  return (
    <Screen title="System">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackButton parent="/profil" label="Profil" />
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 14,
            backgroundColor: alpha(catColors.yellow, 0.16),
          }}
        >
          <Text style={[type.small, { color: catColors.yellow, fontFamily: font.semibold }]}>
            Nur Admin
          </Text>
        </View>
      </View>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      {!sys ? (
        <ActivityIndicator color={p.ink3} />
      ) : (
        <>
          <HeroCard>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: healthy ? p.positive : p.warning,
                  }}
                />
                <Text style={[type.small, { color: healthy ? p.positive : p.warning }]}>
                  {healthy ? 'Alles läuft' : updError || 'Der Updater ist nicht erreichbar.'}
                </Text>
              </View>
              <Title>System</Title>
              <Text style={[type.small, { color: p.ink2 }]}>
                FOKUS {sys.version.replace(/^v/, '')} · zuletzt geprüft{' '}
                {ago(upd?.lastCheck ?? null)}
              </Text>
            </View>
          </HeroCard>

          {latest ? (
            <TintCard tint="violet">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CatTile color={accents.violet.from} symbol="pfeil" size={36} radius={10} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.section, { color: onAccent }]}>
                    {latest.prerelease ? 'Testversion' : 'Version'}{' '}
                    {latest.version.replace(/^v/, '')} ist da
                  </Text>
                </View>
              </View>
              {changelog(latest.notes).map((l, i) => (
                <Text key={i} style={[type.body, { color: onAccent }]}>
                  • {l}
                </Text>
              ))}
              {latest.prerelease ? (
                <Notice tone="warning">
                  Testversion: nur zum Ausprobieren des Update-Systems.
                </Notice>
              ) : null}
              <Button
                label={confirm === latest.version ? 'Wirklich installieren' : 'Jetzt installieren'}
                loading={busy}
                onPress={() => install(latest)}
              />
              <Text style={[type.small, { color: violet.text, textAlign: 'center' }]}>
                Vorher Backup{upd?.snapshots ? ' und VM-Snapshot' : ''}. Bei Problemen automatisch
                zurück auf {upd?.current.replace(/^v/, '')}.
              </Text>
            </TintCard>
          ) : upd ? (
            <Card>
              <ListRow
                title="Du bist auf dem neuesten Stand"
                detail="Nach Updates suchen"
                onPress={busy ? undefined : check}
              />
            </Card>
          ) : null}

          {label('Zustand')}
          <TileGrid>
            <IconTile
              symbol="datenbank"
              color={accents.green.from}
              title="Datenbank"
              detail={`Bereit · ${bytes(sys.dbBytes)}`}
            />
            <IconTile
              symbol="wolke"
              color={sys.updater?.lastBackup ? accents.blue.from : accents.yellow.from}
              title="Backups"
              detail={sys.updater?.lastBackup ? when(sys.updater.lastBackup) : 'noch keins'}
              onPress={() => router.push('/admin/backups')}
            />
          </TileGrid>
          {sys.updater ? (
            <Card>
              <ListRow
                title="Speicher frei"
                value={bytes(sys.updater.diskFreeBytes)}
                valueTone={sys.updater.diskFreeBytes < 2 * 1024 ** 3 ? 'warning' : undefined}
              >
                <ProgressBar value={1 - sys.updater.diskFreeBytes / sys.updater.diskTotalBytes} />
              </ListRow>
            </Card>
          ) : null}

          {label('Verwalten')}
          <TileGrid>
            <IconTile
              symbol="personen"
              color={accents.violet.from}
              title="Nutzer"
              detail={`${sys.users} · einladen, sperren`}
              onPress={() => router.push('/admin/nutzer')}
            />
            <IconTile
              symbol="schloss"
              color={accents.gray.from}
              title="Registrierung"
              detail={
                confirm === 'registration'
                  ? 'Noch einmal tippen zum Umschalten'
                  : sys.registrationMode === 'open'
                    ? 'Offen für alle'
                    : 'Nur per Einladung'
              }
              onPress={toggleRegistration}
            />
            <IconTile
              symbol="mail"
              color={accents.red.from}
              title="E-Mail-Vorlagen"
              detail="Texte, Vorschau"
              onPress={() => router.push('/admin/vorlagen')}
            />
            <IconTile
              symbol="uhr"
              color={accents.gray.from}
              title="Protokoll"
              detail="Updates, Fehler"
              onPress={() => router.push('/admin/protokoll')}
            />
            <IconTile
              symbol="vertrag"
              color={sys.legal.name ? accents.gray.from : accents.yellow.from}
              title="Impressum"
              detail={sys.legal.name ? 'Angaben' : 'fehlt'}
              onPress={() => router.push('/admin/impressum')}
            />
            <IconTile
              symbol="vertrag"
              color={accents.gray.from}
              title="Rechtstexte"
              detail="Datenschutz, Bedingungen"
              onPress={() => router.push('/admin/rechtstexte')}
            />
            <IconTile
              symbol="schluessel"
              color={accents.gray.from}
              title="Audit-Log"
              detail="Admin-Aktionen"
              onPress={() => router.push('/admin/audit')}
            />
          </TileGrid>

          <Section title="Erweitert">
            <Card>
              <ListRow
                title="Testversionen anzeigen"
                detail="Zum Prüfen des automatischen Rollbacks"
                value={sys.showTestReleases ? 'An' : 'Aus'}
                onPress={toggleTestReleases}
              />
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

const STEPS_DONE: Record<string, string> = {
  ok: 'Fertig',
  'rolled-back': 'Zurückgerollt',
  failed: 'Fehlgeschlagen',
};

/** Fortschritt live: fragt alle 2 s den Status ab, auch während die API neu startet. */
function Progress({ run, onDone }: { run: Running; onDone: () => void }) {
  const p = usePalette();
  const [cur, setCur] = useState(run);
  const [log, setLog] = useState<string[]>([run.step]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await progress();
      if (!alive) return;
      if (s && s.to === run.to) {
        setCur({ ...s });
        setLog((l) => (l.at(-1) === s.step ? l : [...l, s.step]));
        if (s.state !== 'running') return;
      }
      timer.current = setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [run.to]);

  const done = cur.state !== 'running';
  const tone =
    cur.state === 'ok' ? undefined : cur.state === 'rolled-back' ? 'warning' : 'negative';
  return (
    <Screen title="System">
      <Title>
        {run.kind === 'install' ? `Update auf ${run.to.replace(/^v/, '')}` : 'Vorgang läuft'}
      </Title>
      {!done ? <ProgressBar value={Math.min(0.95, log.length / 8)} /> : null}
      <Card>
        {log.map((s, i) => (
          <ListRow key={i} title={s} value={i < log.length - 1 || done ? '✓' : '…'} />
        ))}
      </Card>
      {done ? (
        <>
          <Notice tone={tone ?? 'positive'}>
            {cur.state === 'ok'
              ? 'Erledigt. Lade die App neu, falls etwas komisch aussieht.'
              : cur.state === 'rolled-back'
                ? `Die neue Version lief nicht sauber. FOKUS ist automatisch zurück auf ${run.from.replace(/^v/, '')}, deine Daten sind unverändert. Details im Update-Protokoll.`
                : 'Das hat nicht geklappt. Details im Update-Protokoll.'}
          </Notice>
          <Button
            label={STEPS_DONE[cur.state] ? 'Zurück zur Übersicht' : 'Schließen'}
            onPress={onDone}
          />
        </>
      ) : (
        <Body muted>
          Die App ist währenddessen kurz nicht erreichbar. Du kannst diese Seite offen lassen.
        </Body>
      )}
      {done ? null : <Text style={[type.small, { color: p.ink3 }]}>{cur.step}</Text>}
    </Screen>
  );
}
