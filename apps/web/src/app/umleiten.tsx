// Umleiten (Artboard „Umleiten“): Der Kurzbefehl öffnet diese Seite, wenn eine Social-App ohne
// Freigabe aufgeht (/umleiten?app=instagram&k=<schlüssel>). Hier gibt es drei Wege: eine kleine
// Aufgabe machen, Guthaben ausgeben (= Freigabe) oder eine Ausnahme (kostet, mit Wartezeit).
// Oft in Safari ohne Sitzung geöffnet: dann zählt der Schlüssel aus der Adresse.
import { clock } from '@fokus/core';
import {
  Body,
  Button,
  CatTile,
  Notice,
  SymbolIcon,
  font,
  goalPalettes,
  kindColors,
  type,
  usePalette,
  useScheme,
} from '@fokus/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHead } from '../components/PageHead';
import { ApiError, api } from '../lib/api';

type Info = {
  app: string;
  label: string;
  url: string | null;
  state: 'free' | 'focus' | 'blocked';
  passUntil: string | null;
  focus: { title: string; endsAt: string } | null;
  nextSocial: string | null;
  task: { id: string; title: string; minutes: number } | null;
  fallback: string;
  spend: number;
  canSpend: number;
  credit: { balance: number };
  override: { left: number; cost: number; waitSeconds: number };
  ticket: string;
};

type Step =
  | { kind: 'choose' }
  | { kind: 'task'; until: number }
  | { kind: 'done' }
  | { kind: 'free'; until: string; note?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const mins = (n: number) => (n < 0 ? `−${-n} Min` : `${n} Min`);

export default function Umleiten() {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ app?: string; k?: string; fehler?: string }>();
  const app = one(params.app) ?? '';
  const token = one(params.k);
  const broken = one(params.fehler) === 'adresse';
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const call = useCallback(
    <T,>(path: string, body?: unknown) => api<T>(path, { body, token: token || undefined }),
    [token],
  );

  const load = useCallback(() => {
    call<Info>(`/api/v1/redirect?app=${encodeURIComponent(app)}`)
      .then((i) => {
        setInfo(i);
        setLoadedAt(Date.now());
        setLoadError(null);
        if (i.state === 'free' && i.passUntil) setStep({ kind: 'free', until: i.passUntil });
      })
      .catch((e: ApiError) => setLoadError(e));
  }, [app, call]);

  useEffect(() => {
    if (!broken) load();
  }, [broken, load]);

  // Sekundentakt für Wartezeit und Aufgaben-Uhr
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Im Browser im selben Tab (window.open ließe auf dem iPhone einen leeren Tab zurück)
  const openApp = () => {
    if (!info?.url) return;
    if (Platform.OS === 'web') window.location.href = info.url;
    else void Linking.openURL(info.url);
  };

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

  const shell = (children: ReactNode) => (
    <View style={{ flex: 1 }}>
      <PageHead title="Umleiten" />
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          alignSelf: 'center',
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
      >
        {children}
      </View>
    </View>
  );

  const header = (title: string, text: string, sub: string) => (
    <>
      <CatTile color={kindColors.social} symbol="uhr" size={56} radius={16} />
      <Text style={[type.body, { color: p.ink2, marginTop: 24 }]}>{sub}</Text>
      <Text
        accessibilityRole="header"
        style={[type.title, { color: p.ink, fontSize: 30, lineHeight: 34, marginTop: 6 }]}
      >
        {title}
      </Text>
      <Text style={[type.body, { color: p.ink2, marginTop: 10, lineHeight: 22 }]}>{text}</Text>
    </>
  );

  const actions = (children: ReactNode) => (
    <View style={{ marginTop: 'auto', gap: 10, paddingTop: 24 }}>{children}</View>
  );

  // ---------- Fehler und Einrichtung ----------

  if (broken || loadError?.status === 401 || loadError?.status === 403)
    return shell(
      <>
        {header(
          broken ? 'Adresse gilt nicht mehr' : 'Nicht angemeldet',
          broken
            ? 'Der Kurzbefehl nutzt einen alten Schlüssel. Öffne FOKUS → Profil → Umleiten und richte die Automation mit der neuen Adresse ein.'
            : 'Melde dich in diesem Browser an oder richte den Kurzbefehl neu ein (Profil → Umleiten). Mit der neuen Adresse klappt es ohne Anmeldung.',
          'Umleiten',
        )}
        {actions(
          <Button
            label="Anmelden"
            onPress={() =>
              router.replace(`/login?next=${encodeURIComponent(`/umleiten?app=${app}`)}`)
            }
          />,
        )}
      </>,
    );

  if (!info)
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {loadError ? (
          <>
            <Body muted>{loadError.message}</Body>
            <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
              <Button label="Noch einmal" variant="secondary" onPress={load} />
            </View>
          </>
        ) : (
          <ActivityIndicator color={p.ink3} />
        )}
      </View>,
    );

  // ---------- Freigabe läuft ----------

  if (step.kind === 'free')
    return shell(
      <>
        {header(
          `Bis ${clock(step.until)} frei.`,
          step.note ??
            `Deine Social-Zeit läuft bis ${clock(step.until)}. Danach geht ${info.label} wieder zuerst hierher.`,
          info.label,
        )}
        {actions(
          <>
            {info.url ? <Button label={`${info.label} öffnen`} onPress={openApp} /> : null}
            <Button
              label="Zurück zu FOKUS"
              variant="secondary"
              onPress={() => router.replace('/')}
            />
          </>,
        )}
      </>,
    );

  // ---------- Fokus läuft ----------

  if (info.state === 'focus' && info.focus) {
    const left = Math.max(0, Math.ceil((new Date(info.focus.endsAt).getTime() - now) / 60_000));
    return shell(
      <>
        {header(
          'Du bist mitten im Fokus.',
          `„${info.focus.title}“ läuft noch ${left} Min. bis ${clock(info.focus.endsAt)}. Während eines Fokus-Blocks bleibt ${info.label} zu. Danach hast du mehr Guthaben.`,
          `${info.label} · Fokus läuft`,
        )}
        {actions(<Button label="Zum Timer" onPress={() => router.replace('/fokus-modus')} />)}
      </>,
    );
  }

  // ---------- Kleine Aufgabe ----------

  const title = info.task?.title ?? info.fallback;
  const taskMinutes = info.task?.minutes ?? 2;

  if (step.kind === 'task') {
    const rest = Math.max(0, Math.ceil((step.until - now) / 1000));
    const mm = String(Math.floor(rest / 60));
    const ss = String(rest % 60).padStart(2, '0');
    return shell(
      <>
        {header(title, 'Leg das Handy kurz weg und mach es jetzt.', `${info.label} · Aufgabe`)}
        <Text
          accessibilityLabel={`Noch ${rest} Sekunden`}
          style={[
            type.title,
            {
              color: p.ink,
              fontSize: 64,
              lineHeight: 72,
              marginTop: 32,
              fontVariant: ['tabular-nums'],
            },
          ]}
        >
          {mm}:{ss}
        </Text>
        {error ? <Notice tone="negative">{error}</Notice> : null}
        {actions(
          <>
            <Button
              label={rest > 0 ? `Erledigt (in ${rest} s)` : 'Erledigt'}
              disabled={rest > 0}
              loading={busy}
              onPress={() =>
                run(async () => {
                  if (info.task)
                    await call('/api/v1/redirect/done', {
                      taskId: info.task.id,
                      ticket: info.ticket,
                    });
                  setStep({ kind: 'done' });
                })
              }
            />
            <Button
              label="Abbrechen"
              variant="secondary"
              onPress={() => setStep({ kind: 'choose' })}
            />
          </>,
        )}
      </>,
    );
  }

  if (step.kind === 'done')
    return shell(
      <>
        {header(
          'Geschafft.',
          info.task
            ? `„${title}“ ist erledigt. Guthaben gibt es fürs Fokussieren: Starte einen Fokus-Block, dann ist ${info.label} wieder drin.`
            : `Gut gemacht. Guthaben gibt es fürs Fokussieren: Starte einen Fokus-Block, dann ist ${info.label} wieder drin.`,
          info.label,
        )}
        {actions(
          <>
            <Button label="Weiter mit FOKUS" onPress={() => router.replace('/')} />
            <Button
              label="Zurück"
              variant="secondary"
              onPress={() => {
                setStep({ kind: 'choose' });
                load();
              }}
            />
          </>,
        )}
      </>,
    );

  // ---------- Auswahl ----------

  const next = info.nextSocial ? clock(info.nextSocial) : null;
  const tint = goalPalettes.green;
  const card: ViewStyle =
    dark && Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(135deg, ${tint.from}, ${tint.to})`,
        } as unknown as ViewStyle)
      : {};
  const waitLeft = Math.max(0, Math.ceil(info.override.waitSeconds - (now - loadedAt) / 1000));
  const debt = info.credit.balance < 0;
  const spendLabel =
    info.canSpend <= 0
      ? debt
        ? 'Erst die Schulden abarbeiten'
        : 'Kein Guthaben: erst ein Fokus-Block'
      : `${info.canSpend} Min vom Guthaben nehmen`;
  const overrideLabel =
    info.override.left <= 0
      ? 'Heute keine Ausnahmen mehr'
      : waitLeft > 0
        ? `Trotzdem öffnen geht in ${waitLeft} s`
        : `Trotzdem öffnen: ${info.override.cost} Min für ${info.override.cost} Min Guthaben (noch ${info.override.left}× heute)`;

  return shell(
    <>
      {header(
        'Kurz was Kleines zuerst?',
        `${next ? `Dein nächster Social-Slot ist um ${next}. Starte ihn dann in FOKUS. ` : ''}Social-Zeit gibt es nur mit Guthaben, und Guthaben gibt es fürs Fokussieren.`,
        `${info.label} · gerade keine Social-Zeit`,
      )}
      <View
        style={[
          {
            marginTop: 24,
            borderRadius: 24,
            padding: 20,
            backgroundColor: dark ? tint.to : p.surface,
            borderWidth: 1,
            borderColor: dark ? 'rgba(255,255,255,0.06)' : p.surface2,
          },
          card,
        ]}
      >
        <Text style={[type.small, { color: dark ? tint.text : p.ink2 }]}>
          {info.task ? 'Aus deinem Plan' : 'Vorschlag'} · {taskMinutes} Min
        </Text>
        <Text style={[type.section, { color: p.ink, marginTop: 6, fontFamily: font.semibold }]}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 }}>
          <SymbolIcon name="uhr" color={dark ? tint.text : p.ink2} size={16} />
          <Text style={[type.small, { color: dark ? tint.text : p.ink2 }]}>
            Statt zu scrollen: {taskMinutes} Min, dann bist du durch
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          backgroundColor: p.surface,
          borderRadius: 18,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        <Text style={[type.body, { color: p.ink2, fontSize: 14 }]}>
          {debt ? 'Guthaben (Schulden)' : 'Guthaben jetzt'}
        </Text>
        <Text
          style={[
            type.body,
            {
              color: debt ? p.negative : p.ink,
              fontFamily: font.semibold,
              fontSize: 14,
              fontVariant: ['tabular-nums'],
            },
          ]}
        >
          {mins(info.credit.balance)}
        </Text>
      </View>
      {error ? <Notice tone="negative">{error}</Notice> : null}
      {actions(
        <>
          <Button
            label="Aufgabe machen"
            onPress={() => {
              setError('');
              setStep({ kind: 'task', until: Date.now() + taskMinutes * 60_000 });
            }}
          />
          <Button
            label={spendLabel}
            variant="secondary"
            disabled={info.canSpend <= 0}
            loading={busy}
            onPress={() =>
              run(async () => {
                const r = await call<{ granted: number; passUntil: string | null }>(
                  '/api/v1/redirect/spend',
                  {},
                );
                if (!r.passUntil) throw new Error('Kein Guthaben mehr da.');
                setStep({ kind: 'free', until: r.passUntil });
              })
            }
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: waitLeft > 0 || info.override.left <= 0 || busy }}
            disabled={waitLeft > 0 || info.override.left <= 0 || busy}
            onPress={() =>
              run(async () => {
                const r = await call<{ passUntil: string | null; credit: { balance: number } }>(
                  '/api/v1/redirect/override',
                  { ticket: info.ticket },
                );
                if (!r.passUntil) throw new Error('Das hat nicht geklappt.');
                setStep({
                  kind: 'free',
                  until: r.passUntil,
                  note:
                    r.credit.balance < 0
                      ? `Ausnahme bis ${clock(r.passUntil)}. Dein Guthaben steht bei ${mins(r.credit.balance)}: der nächste Fokus-Block zahlt das zurück.`
                      : `Ausnahme bis ${clock(r.passUntil)}. ${info.override.cost} Min sind vom Guthaben weg.`,
                });
              })
            }
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={[type.body, { color: p.ink3, fontSize: 14, textAlign: 'center' }]}>
              {overrideLabel}
            </Text>
          </Pressable>
        </>,
      )}
    </>,
  );
}
