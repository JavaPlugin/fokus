import { clock, earnedFor, minutesBetween, MIN_MS } from '@fokus/core';
import {
  Body,
  BlockRow,
  Button,
  Hero,
  KindCard,
  SymbolIcon,
  font,
  type,
  useKindText,
  usePalette,
} from '@fokus/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BlockSheet } from '../../components/BlockSheet';
import { SocialSheet } from '../../components/SocialSheet';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { useDay, type Block } from '../../lib/day';
import { dayLabel, minutesText } from '../../lib/format';

const KIND_LABEL = { focus: 'Fokus', pause: 'Pause', social: 'Social', event: 'Termin' } as const;

/** Zeile unter dem Titel eines Blocks. */
function subOf(b: Block, perHour: number) {
  const m = `${b.minutes} Min`;
  if (b.kind === 'focus') return `Fokus · +${earnedFor(b.minutes, perHour)} Min Guthaben`;
  if (b.kind === 'social') return `${m} · vom Guthaben`;
  return `${KIND_LABEL[b.kind]} · ${m}`;
}

const endOf = (b: Block) => new Date(b.startsAt).getTime() + b.minutes * MIN_MS;

/** Heute: Scroll-Guthaben, aktueller Fokus-Block, Tagesliste. */
export default function Heute() {
  const p = usePalette();
  const focusText = useKindText('focus');
  const { data, error, planToday, startFocus } = useDay();
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<Block | null>(null);
  const [social, setSocial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const head: ScreenHead = { title: 'Heute', right: <HeadButtons /> };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <Screen head={head}>
        {error ? (
          <Body muted>{error}</Body>
        ) : (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={p.ink3} />
          </View>
        )}
      </Screen>
    );
  }

  const blocks = data.blocks.filter((b) => b.status !== 'skipped');
  const perHour = data.settings.creditPerHour;
  const nextSocial = blocks.find(
    (b) => b.kind === 'social' && b.status === 'planned' && endOf(b) > now,
  );
  const running = data.running ? blocks.find((b) => b.id === data.running!.blockId) : undefined;
  // Jetzt: laufender Block, sonst der Fokus-Block, dessen Zeit gerade ist, sonst der nächste
  const current =
    running ??
    blocks.find(
      (b) =>
        b.kind === 'focus' &&
        b.status === 'planned' &&
        new Date(b.startsAt).getTime() <= now &&
        endOf(b) > now,
    );
  const upcoming = blocks.find(
    (b) => b.kind === 'focus' && b.status === 'planned' && new Date(b.startsAt).getTime() > now,
  );
  const hero = current ?? upcoming;
  const counted = blocks.filter((b) => b.kind !== 'pause');
  const done = counted.filter((b) => b.status === 'done').length;

  const sub = [
    data.focusMinutes ? `${minutesText(data.focusMinutes)} Fokus heute` : 'Noch kein Fokus heute',
    nextSocial ? `nächster Social-Slot ${clock(nextSocial.startsAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function start(b: Block) {
    setBusy(true);
    try {
      await startFocus({ blockId: b.id });
      router.push('/fokus-modus');
    } finally {
      setBusy(false);
    }
  }

  async function plan() {
    setBusy(true);
    setNote('');
    try {
      const r = await planToday();
      if (r.unplaced.length)
        setNote(
          `${r.unplaced.length} ${r.unplaced.length === 1 ? 'Aufgabe passt' : 'Aufgaben passen'} nicht mehr in den Tag.`,
        );
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const openTasks = data.tasks.filter((t) => !t.mini).length;
  const remaining = running
    ? Math.max(0, data.running!.plannedMinutes - minutesBetween(data.running!.startedAt, now))
    : current
      ? Math.max(0, Math.ceil((endOf(current) - now) / MIN_MS))
      : 0;

  return (
    <Screen head={head}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.body, { color: p.ink2 }]}>{dayLabel(data.day)}</Text>
      </View>

      <Hero label="Scroll-Guthaben" value={String(data.credit.balance)} unit="Min" sub={sub} />

      {hero ? (
        <KindCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.small, { color: focusText }]}>
                {running
                  ? `Läuft · bis ${clock(new Date(data.running!.startedAt).getTime() + data.running!.plannedMinutes * MIN_MS)}`
                  : current
                    ? `Jetzt · bis ${clock(endOf(current))}`
                    : `Als Nächstes · ${clock(hero.startsAt)}`}
              </Text>
              <Text
                numberOfLines={2}
                // @ts-expect-error dataSet gibt es nur in react-native-web
                dataSet={{ private: '' }}
                style={[type.section, { color: p.ink, marginTop: 4, fontFamily: font.semibold }]}
              >
                {hero.title || 'Fokus'}
              </Text>
              <Text style={[type.small, { color: p.ink2, marginTop: 4 }]}>
                {running || current
                  ? `Fokus-Block · ${remaining} Min. übrig`
                  : `Fokus-Block · ${hero.minutes} Min.`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={running ? 'Zum Timer' : 'Fokus starten'}
              disabled={busy}
              onPress={() => (running ? router.push('/fokus-modus') : void start(hero))}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: p.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <SymbolIcon name="play" color={p.bg} size={20} />
            </Pressable>
          </View>
        </KindCard>
      ) : (
        <KindCard>
          <Text style={[type.section, { color: p.ink }]}>
            {blocks.length ? 'Für heute ist alles geplant.' : 'Noch nichts geplant.'}
          </Text>
          <Text style={[type.small, { color: p.ink2, marginTop: 4, marginBottom: 12 }]}>
            {openTasks
              ? `${openTasks} offene ${openTasks === 1 ? 'Aufgabe' : 'Aufgaben'}. FOKUS legt sie in deine freie Zeit.`
              : 'Leg mit dem Plus unten eine Aufgabe an.'}
          </Text>
          {openTasks ? <Button label="Tag planen" loading={busy} onPress={plan} /> : null}
        </KindCard>
      )}
      {note ? <Body muted>{note}</Body> : null}

      <View style={{ gap: 12 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Text accessibilityRole="header" style={[type.section, { color: p.ink, fontSize: 22 }]}>
            Dein Tag
          </Text>
          <Text style={[type.small, { color: p.ink2 }]}>
            {counted.length ? `${done} von ${counted.length} erledigt` : ''}
          </Text>
        </View>
        {blocks.length ? (
          <View style={{ gap: 8 }}>
            {blocks.map((b) => (
              <BlockRow
                key={b.id}
                time={clock(b.startsAt)}
                title={b.title || KIND_LABEL[b.kind]}
                sub={subOf(b, perHour)}
                kind={b.kind === 'event' ? 'warning' : b.kind}
                state={b.status === 'done' ? 'done' : b.status === 'running' ? 'now' : 'next'}
                onPress={() => setOpen(b)}
              />
            ))}
          </View>
        ) : (
          <Body muted>Dein Tag ist leer.</Body>
        )}
        {blocks.length && openTasks ? (
          <Button label="Neu planen" variant="secondary" loading={busy} onPress={plan} />
        ) : null}
      </View>

      <Button label="Social-Slot planen" variant="secondary" onPress={() => setSocial(true)} />
      <BlockSheet block={open} onClose={() => setOpen(null)} />
      <SocialSheet open={social} onClose={() => setSocial(false)} />
    </Screen>
  );
}
