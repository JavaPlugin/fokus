import { MIN_MS, clock, earnedFor } from '@fokus/core';
import {
  Body,
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
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { TaskRow, rowSub } from '../../components/TaskRow';
import { useTaskEditor } from '../../components/useTaskEditor';
import { useDay, type Item } from '../../lib/day';
import { dayLabel, minutesText } from '../../lib/format';
import { useUndo } from '../../lib/undo';

const endOf = (i: Item) => new Date(i.start).getTime() + i.minutes * MIN_MS;

/** Heute: Scroll-Guthaben, was als Nächstes dran ist, der Tag. */
export default function Heute() {
  const p = usePalette();
  const focusText = useKindText('focus');
  const day = useDay();
  const { data, error } = day;
  const undo = useUndo();
  const editor = useTaskEditor();
  const [now, setNow] = useState(Date.now());
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

  const items = data.items.filter((i) => !undo.hidden.has(i.key));
  const perHour = data.settings.creditPerHour;
  const running = data.running;
  // Als Nächstes: laufende Aufgabe, sonst die erste offene Arbeit oder Social-Zeit, die noch nicht vorbei ist
  const current = running
    ? items.find((i) => i.taskId === running.taskId && i.day === running.day)
    : undefined;
  const next =
    current ??
    items.find((i) => !i.done && (i.kind === 'work' || i.kind === 'social') && endOf(i) > now);
  const gap = data.gaps.find((g) => new Date(g.end).getTime() > now);
  const hours = data.hours ? `Arbeitszeit ${data.hours.from}–${data.hours.to}` : 'Heute frei';

  async function toggle(i: Item) {
    if (!i.taskId) return;
    setNote('');
    try {
      await day.setDone(i.taskId, i.day, !i.done);
      if (!i.done)
        undo.notify(`„${i.title}“ erledigt`, () => void day.setDone(i.taskId!, i.day, false));
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function start(i: Item) {
    if (!i.taskId) return;
    setBusy(true);
    setNote('');
    try {
      if (i.kind === 'social') {
        const r = await day.spend(i.minutes, 'social');
        await day.setDone(i.taskId, i.day, true);
        undo.notify(
          r.short > 0
            ? `Social-Zeit gestartet: ${r.granted} von ${i.minutes} Min. vom Guthaben (mehr war nicht da)`
            : `Social-Zeit gestartet: ${r.granted} Min. vom Guthaben`,
        );
      } else {
        await day.startFocus({ taskId: i.taskId, minutes: i.minutes });
        router.push('/fokus-modus');
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen head={head}>
      <Text style={[type.body, { color: p.ink2 }]}>{dayLabel(data.day)}</Text>

      <Hero
        label="Scroll-Guthaben"
        value={String(data.credit.balance)}
        unit="Min"
        sub={`Je 1 Std. Fokus bekommst du ${perHour} Min. für Social Media.`}
      />

      {next ? (
        <KindCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.small, { color: focusText }]}>
                {running && next === current ? 'Läuft' : `Als Nächstes · ${clock(next.start)}`}
              </Text>
              <Text
                numberOfLines={2}
                style={[type.section, { color: p.ink, marginTop: 4, fontFamily: font.semibold }]}
              >
                {next.title}
              </Text>
              <Text style={[type.small, { color: p.ink2, marginTop: 4 }]}>
                {next.kind === 'work'
                  ? `${next.minutes} Min · bringt +${earnedFor(next.minutes, perHour)} Min Guthaben`
                  : `${next.minutes} Min · kostet ${next.minutes} Min Guthaben`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={running && next === current ? 'Zum Timer' : 'Start'}
              disabled={busy}
              onPress={() =>
                running && next === current ? router.push('/fokus-modus') : void start(next)
              }
              style={{
                height: 44,
                borderRadius: 22,
                paddingHorizontal: 16,
                backgroundColor: p.ink,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <SymbolIcon name="play" color={p.bg} size={14} />
              <Text style={[type.body, { color: p.bg, fontFamily: font.semibold }]}>
                {running && next === current ? 'Timer' : 'Start'}
              </Text>
            </Pressable>
          </View>
        </KindCard>
      ) : null}

      <View style={{ gap: 10 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Text accessibilityRole="header" style={[type.section, { color: p.ink, fontSize: 20 }]}>
            Heute
          </Text>
          <Text style={[type.small, { color: p.ink2 }]}>{hours}</Text>
        </View>

        {items.length ? (
          <View style={{ gap: 8 }}>
            {items.map((i) => (
              <TaskRow
                key={i.key}
                title={i.title}
                sub={rowSub(clock(i.start), i.minutes, i.kind, i.how, i.recurring)}
                kind={i.kind}
                done={i.done}
                highlight={!!running && i.taskId === running.taskId && i.day === running.day}
                onToggle={i.taskId ? () => void toggle(i) : undefined}
                onPress={i.taskId ? () => editor.editItem(i) : undefined}
              />
            ))}
          </View>
        ) : (
          <View style={{ gap: 12, paddingVertical: 8 }}>
            <Text style={[type.section, { color: p.ink }]}>Noch nichts geplant</Text>
            <Body muted>
              Lege eine Aufgabe an. FOKUS sucht einen freien Platz in deiner Arbeitszeit.
            </Body>
            <Button label="Aufgabe anlegen" onPress={() => editor.newTask()} />
          </View>
        )}

        {gap ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: p.ink4,
              borderRadius: 16,
              paddingVertical: 10,
              paddingHorizontal: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: p.ink, fontSize: 14 }]}>
                {clock(gap.start)}–{clock(gap.end)} frei
              </Text>
              <Text numberOfLines={2} style={[type.small, { color: p.ink3, fontSize: 12 }]}>
                {gap.suggestion
                  ? `Vorschlag: ${gap.suggestion.title} · ${minutesText(gap.suggestion.minutes)}`
                  : `${minutesText(gap.minutes)} Platz für eine Aufgabe`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gap.suggestion ? 'Vorschlag einplanen' : 'Aufgabe anlegen'}
              onPress={async () => {
                if (!gap.suggestion)
                  return editor.newTask({ schedule: 'fixed', time: clock(gap.start) });
                try {
                  await day.updateTask(gap.suggestion.taskId, {
                    schedule: 'fixed',
                    fixedAt: gap.start,
                  });
                  undo.notify(`„${gap.suggestion.title}“ um ${clock(gap.start)} eingeplant`);
                } catch (e) {
                  setNote((e as Error).message);
                }
              }}
              style={{
                height: 36,
                borderRadius: 18,
                paddingHorizontal: 14,
                backgroundColor: p.surface2,
                justifyContent: 'center',
              }}
            >
              <Text style={[type.small, { color: p.ink }]}>
                {gap.suggestion ? 'Einplanen' : 'Anlegen'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {note || editor.error ? <Body muted>{note || editor.error}</Body> : null}
      {data.waiting.length ? (
        <Body muted>
          {data.waiting.length === 1
            ? '1 automatische Aufgabe findet in den nächsten Tagen keinen Platz. Verkürze sie oder erweitere deine Arbeitszeit.'
            : `${data.waiting.length} automatische Aufgaben finden in den nächsten Tagen keinen Platz. Verkürze sie oder erweitere deine Arbeitszeit.`}
        </Body>
      ) : null}
      {editor.sheet}
    </Screen>
  );
}
