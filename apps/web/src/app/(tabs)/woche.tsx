import { addDays, equivalents, todayIn, weekStart, type WeekSummary } from '@fokus/core';
import { Body, Hero, kindColors, goalPalettes, font, type, usePalette, useScheme } from '@fokus/ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { api } from '../../lib/api';
import { minutesText } from '../../lib/format';

type Week = WeekSummary & {
  today: string;
  streak: number;
  streakGoal: number;
  baselineScroll: number;
  tasksDone: number;
};

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MON = [
  'Jan',
  'Feb',
  'März',
  'Apr',
  'Mai',
  'Juni',
  'Juli',
  'Aug',
  'Sept',
  'Okt',
  'Nov',
  'Dez',
];
const dm = (d: string) => `${+d.slice(8)}.`;
/** „5.–11. Okt“ (über Monatsgrenzen „29. Sept – 5. Okt“) */
const range = (a: string, b: string) =>
  a.slice(5, 7) === b.slice(5, 7)
    ? `${dm(a)}–${dm(b)} ${MON[+b.slice(5, 7) - 1]}`
    : `${+a.slice(8)}. ${MON[+a.slice(5, 7) - 1]} – ${+b.slice(8)}. ${MON[+b.slice(5, 7) - 1]}`;
/** „14 Std 20“ */
const stdMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} Std ${m % 60}` : `${m} Min`);

const BAR_H = 150;

/** Woche: vom Scrollen zurückgeholt, Fokus und Social pro Tag, Serie. */
export default function Woche() {
  const p = usePalette();
  const dark = useScheme() === 'dark';
  const [anchor, setAnchor] = useState(() => weekStart(todayIn()));
  const [w, setW] = useState<Week | null>(null);
  const [error, setError] = useState('');
  const head: ScreenHead = { title: 'Woche', right: <HeadButtons /> };

  const load = useCallback(() => {
    api<Week>(`/api/week/${anchor}`)
      .then((r) => (setW(r), setError('')))
      .catch((e: Error) => setError(e.message));
  }, [anchor]);
  useEffect(() => {
    setW(null);
    load();
  }, [load]);
  // Beim Zurückkehren zur Woche aktuell halten
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!w)
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

  const thisWeek = w.start === weekStart(w.today);
  const max = Math.max(60, ...w.days.flatMap((d) => [d.focus, d.social]));
  const h = Math.floor(w.regained / 60);
  const eq = equivalents(w.regained);
  const tint = goalPalettes.violet;
  const tintStyle: ViewStyle = dark
    ? ({
        backgroundImage: `linear-gradient(135deg, ${tint.from}, ${tint.to})`,
      } as unknown as ViewStyle)
    : {};

  const nav = (label: string, to: string, off?: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '‹' ? 'Vorherige Woche' : 'Nächste Woche'}
      disabled={off}
      onPress={() => setAnchor(to)}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: p.surface2,
        opacity: off ? 0.35 : 1,
      }}
    >
      <Text style={[type.body, { color: p.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen head={head}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.body, { color: p.ink2 }]}>{range(w.start, w.end)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {nav('‹', addDays(w.start, -7))}
          <View
            style={{
              backgroundColor: p.surface2,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={[type.small, { color: p.ink }]}>{thisWeek ? 'Diese Woche' : 'Woche'}</Text>
          </View>
          {nav('›', addDays(w.start, 7), thisWeek)}
        </View>
      </View>

      <Hero
        label="Vom Scrollen zurückgeholt"
        value={String(h)}
        unit="Std"
        extra={{ value: String(w.regained % 60), unit: 'Min' }}
        sub={`Social Media ${minutesText(w.social)} statt ${minutesText(w.expectedSocial)}`}
      />

      <View
        style={{ backgroundColor: p.surface, borderRadius: 24, padding: 18, paddingBottom: 14 }}
      >
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {(
            [
              ['Fokus', kindColors.focus],
              ['Social', kindColors.social],
            ] as const
          ).map(([l, c]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
              <Text style={[type.small, { color: p.ink2, fontSize: 12 }]}>{l}</Text>
            </View>
          ))}
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Fokus- und Social-Zeit pro Tag: ${w.days.map((d, i) => `${WD[i]} ${d.focus} Minuten Fokus, ${d.social} Social`).join('; ')}`}
          style={{
            marginTop: 14,
            height: BAR_H + 22,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          {w.days.map((d, i) => {
            const empty = !d.focus && !d.social;
            const bar = (m: number, color: string) => (
              <View
                style={{
                  width: 12,
                  height: empty ? 4 : Math.max(4, Math.round((m / max) * BAR_H)),
                  borderRadius: 4,
                  backgroundColor: empty ? p.surface2 : color,
                }}
              />
            );
            return (
              <View key={d.day} style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
                  {bar(d.focus, kindColors.focus)}
                  {bar(d.social, kindColors.social)}
                </View>
                <Text
                  style={[
                    type.small,
                    {
                      fontSize: 11,
                      color: d.day === w.today ? p.ink : p.ink3,
                      fontFamily: d.day === w.today ? font.semibold : font.regular,
                    },
                  ]}
                >
                  {WD[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(
          [
            ['Fokus-Zeit', stdMin(w.focus)],
            ['Serie', `${w.streak} ${w.streak === 1 ? 'Tag' : 'Tage'}`],
          ] as const
        ).map(([l, v]) => (
          <View
            key={l}
            style={{ flex: 1, backgroundColor: p.surface, borderRadius: 20, padding: 16 }}
          >
            <Text style={[type.small, { color: p.ink2, fontSize: 12 }]}>{l}</Text>
            <Text
              style={[
                type.section,
                {
                  color: p.ink,
                  fontSize: 24,
                  marginTop: 4,
                  fontFamily: font.bold,
                  fontVariant: ['tabular-nums'],
                },
              ]}
            >
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[type.small, { color: p.ink3, marginTop: -16 }]}>
        Ein Tag zählt für die Serie ab {minutesText(w.streakGoal)} Fokus.
        {w.bestDay
          ? ` Bester Tag: ${WD[(new Date(w.bestDay + 'T12:00:00Z').getUTCDay() + 6) % 7]}.`
          : ''}
        {w.tasksDone
          ? ` ${w.tasksDone} ${w.tasksDone === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt.`
          : ''}
      </Text>

      {eq ? (
        <View
          style={[
            {
              borderRadius: 20,
              paddingVertical: 16,
              paddingHorizontal: 18,
              backgroundColor: dark ? tint.to : p.surface,
              borderWidth: 1,
              borderColor: dark ? 'rgba(255,255,255,0.06)' : p.surface2,
            },
            tintStyle,
          ]}
        >
          <Text style={[type.small, { color: dark ? tint.text : p.ink2, fontSize: 13 }]}>
            Das sind etwa
          </Text>
          <Text
            style={[
              type.section,
              { color: p.ink, fontSize: 17, marginTop: 4, fontFamily: font.semibold },
            ]}
          >
            {[
              eq.chapters
                ? `${eq.chapters} ${eq.chapters === 1 ? 'Kapitel' : 'Kapitel'} deines Buchs`
                : null,
              eq.trainings
                ? `${eq.trainings} ${eq.trainings === 1 ? 'Training' : 'Trainings'}`
                : null,
            ]
              .filter(Boolean)
              .join(' oder ')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
