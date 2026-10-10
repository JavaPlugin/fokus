// Profil → Planung: Länge von Fokus und Pause, Guthaben pro Stunde, Tageslimit, Arbeitstag und die
// übliche Scroll-Zeit (Basis für „zurückgeholt“).
import type { PlanSettings as Settings } from '@fokus/core';
import { Body, Chip, Chips, Notice, Section } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Num = 'focusMinutes' | 'pauseMinutes' | 'creditPerHour' | 'dailyLimit' | 'baselineScroll';

const NUMS: { key: Num; title: string; options: number[]; unit: string; hint?: string }[] = [
  { key: 'focusMinutes', title: 'Fokus-Block', options: [25, 40, 50, 60, 90], unit: 'Min.' },
  { key: 'pauseMinutes', title: 'Pause', options: [5, 10, 15, 20], unit: 'Min.' },
  {
    key: 'creditPerHour',
    title: 'Guthaben pro Stunde Fokus',
    options: [10, 15, 20, 30],
    unit: 'Min.',
    hint: 'So viele Scroll-Minuten verdient eine Stunde Fokus.',
  },
  {
    key: 'dailyLimit',
    title: 'Tageslimit fürs Scrollen',
    options: [30, 60, 90, 120],
    unit: 'Min.',
    hint: 'Mehr als das gibt FOKUS pro Tag nicht aus, egal wie viel Guthaben da ist.',
  },
  {
    key: 'baselineScroll',
    title: 'Übliche Scroll-Zeit pro Tag',
    options: [30, 45, 60, 90, 120],
    unit: 'Min.',
    hint: 'Damit rechnet FOKUS, wie viel du zurückholst.',
  },
];
const STARTS = ['06:00', '07:00', '08:00', '09:00', '10:00'];
const ENDS = ['16:00', '17:00', '18:00', '19:00', '20:00'];

export function PlanSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Settings>('/api/plan/settings')
      .then(setS)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function set(patch: Partial<Settings>) {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch });
    setError('');
    try {
      setS(await api<Settings>('/api/plan/settings', { method: 'PUT', body: patch }));
    } catch (e) {
      setS(prev);
      setError((e as Error).message);
    }
  }

  if (!s) return error ? <Notice tone="negative">{error}</Notice> : null;
  return (
    <>
      {NUMS.map((n) => (
        <Section key={n.key} title={n.title}>
          <Chips>
            {n.options.map((o) => (
              <Chip
                key={o}
                label={`${o} ${n.unit}`}
                selected={s[n.key] === o}
                onPress={() => void set({ [n.key]: o })}
              />
            ))}
          </Chips>
          {n.hint ? <Body muted>{n.hint}</Body> : null}
        </Section>
      ))}
      <Section title="Arbeitstag beginnt">
        <Chips>
          {STARTS.map((t) => (
            <Chip
              key={t}
              label={`${t} Uhr`}
              selected={s.workStart === t}
              onPress={() => void set({ workStart: t })}
            />
          ))}
        </Chips>
      </Section>
      <Section title="Arbeitstag endet">
        <Chips>
          {ENDS.map((t) => (
            <Chip
              key={t}
              label={`${t} Uhr`}
              selected={s.workEnd === t}
              onPress={() => void set({ workEnd: t })}
            />
          ))}
        </Chips>
        <Body muted>In diesem Fenster plant FOKUS deine Aufgaben.</Body>
      </Section>
      {error ? <Notice tone="negative">{error}</Notice> : null}
    </>
  );
}
