// Arbeitszeiten und Regeln (Artboard „Arbeitszeiten“): pro Wochentag an/aus mit Beginn und Ende,
// dazu Fokus-Block, Guthaben und Social-Zeit. Automatische Aufgaben plant FOKUS nur in diese Zeiten.
import type { Hours, PlanSettings } from '@fokus/core';
import { Body, Button, Card, Chip, Chips, ListRow, Section, Sheet, Title, Toggle } from '@fokus/ui';
import { useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Screen } from '../components/Screen';
import { TimeField } from '../components/TimeField';
import { api } from '../lib/api';
import { useDay } from '../lib/day';
import { useUndo } from '../lib/undo';

const NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const FALLBACK: Hours = { from: '09:00', to: '17:00' };

type Open = null | 'day' | 'focus' | 'credit';
/** Lockerungen gelten erst ab `from` (Tag). */
type Settings = PlanSettings & {
  pending: { from: string; values: Partial<PlanSettings> } | null;
};

const LABELS: Partial<Record<keyof PlanSettings, (v: number) => string>> = {
  creditPerHour: (v) => `${v} Min Guthaben pro Fokus-Std`,
  dailyLimit: (v) => `höchstens ${v} Min am Tag`,
  redirectSpend: (v) => `${v} Min beim Umleiten`,
};

export default function Arbeitszeiten() {
  const day = useDay();
  const undo = useUndo();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Open>(null);

  useEffect(() => {
    api<Settings>('/api/plan/settings')
      .then(setS)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(patch: Partial<PlanSettings>, message = 'Gesichert') {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch });
    setError('');
    try {
      const next = await api<Settings>('/api/plan/settings', { method: 'PUT', body: patch });
      setS(next);
      void day.reload();
      const later = Object.keys(patch).some((k) => next.pending && k in next.pending.values);
      undo.notify(later ? 'Lockerung gilt ab morgen' : message);
    } catch (e) {
      setS(prev);
      setError((e as Error).message);
    }
  }

  const setDay = (d: number, h: Hours | null) => {
    if (!s) return;
    const week = [...s.week];
    week[d] = h;
    return save({ week }, `${NAMES[d]}: ${h ? `${h.from}–${h.to}` : 'frei'}`);
  };

  if (!s) return <Screen title="Arbeitszeiten">{error ? <Body muted>{error}</Body> : null}</Screen>;
  const h = sel === null ? null : s.week[sel];
  // Gewählt anzeigen, was ab morgen gilt (sonst sähe die Auswahl wie nicht gespeichert aus)
  const shown = { ...s, ...(s.pending?.values ?? {}) } as PlanSettings;
  const pendingText = s.pending
    ? (Object.entries(s.pending.values) as [keyof PlanSettings, number][])
        .map(([k, v]) => LABELS[k]?.(v))
        .filter(Boolean)
        .join(', ')
    : '';
  const pendingNote = pendingText ? (
    <Body muted>
      Ab morgen: {pendingText}. Lockerungen gelten erst am nächsten Tag, damit du sie nicht im
      Moment der Versuchung machst. Strengere Regeln gelten sofort.
    </Body>
  ) : null;

  return (
    <Screen title="Arbeitszeiten">
      <BackButton parent="/profil" label="Profil" />
      <Title>Arbeitszeiten</Title>
      <Body muted>
        Automatische Aufgaben plant FOKUS nur in diese Zeiten. Aufgaben mit fester Zeit gehen immer.
      </Body>
      <Card>
        {ORDER.map((d) => (
          <ListRow
            key={d}
            title={NAMES[d]!}
            value={s.week[d] ? `${s.week[d]!.from} – ${s.week[d]!.to} ›` : 'frei ›'}
            onPress={() => {
              setSel(d);
              setSheet('day');
            }}
          />
        ))}
      </Card>

      <Section title="Regeln">
        <Card>
          <ListRow
            title="Fokus-Block"
            value={`${s.focusMinutes} Min + ${s.pauseMinutes} Min Pause ›`}
            onPress={() => setSheet('focus')}
          />
          <ListRow
            title="Guthaben"
            value={`${s.creditPerHour} Min pro Fokus-Std ›`}
            onPress={() => setSheet('credit')}
          />
        </Card>
        <Body muted>
          Das Guthaben ist deine Scroll-Zeit: Je Stunde Fokus bekommst du {s.creditPerHour} Minuten
          für Social Media. Mehr als {s.dailyLimit} Minuten am Tag gibt FOKUS nicht aus. Einen
          Social-Slot legst du als Aufgabe an (Art „Social“, Wiederholen „Täglich“). Frei wird
          Social Media erst, wenn du ihn startest: Das kostet Guthaben.
        </Body>
        {pendingNote}
      </Section>
      {error ? <Body muted>{error}</Body> : null}

      <Sheet
        open={sheet === 'day'}
        onClose={() => setSheet(null)}
        title={sel === null ? '' : NAMES[sel]}
      >
        {sel !== null ? (
          <>
            <Card>
              <Toggle
                label="Arbeitstag"
                value={!!h}
                onChange={(on) => void setDay(sel, on ? FALLBACK : null)}
              />
              {h ? (
                <>
                  <TimeField
                    label="Beginn"
                    value={h.from}
                    onChange={(v) => void setDay(sel, { ...h, from: v })}
                  />
                  <TimeField
                    label="Ende"
                    value={h.to}
                    onChange={(v) => void setDay(sel, { ...h, to: v })}
                  />
                </>
              ) : null}
            </Card>
            {h && h.from >= h.to ? <Body muted>Der Tag muss vor seinem Ende beginnen.</Body> : null}
            <Button
              label="Für alle Werktage übernehmen"
              variant="secondary"
              disabled={!h}
              onPress={() => {
                if (!h) return;
                const week = s.week.map((x, i) => (i >= 1 && i <= 5 ? h : x));
                void save({ week }, 'Mo–Fr gesichert');
              }}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet open={sheet === 'focus'} onClose={() => setSheet(null)} title="Fokus-Block">
        <Section title="Länge">
          <Chips>
            {[25, 40, 50, 60, 90].map((m) => (
              <Chip
                key={m}
                label={`${m} Min`}
                selected={s.focusMinutes === m}
                onPress={() => void save({ focusMinutes: m })}
              />
            ))}
          </Chips>
        </Section>
        <Section title="Pause danach">
          <Chips>
            {[5, 10, 15, 20].map((m) => (
              <Chip
                key={m}
                label={`${m} Min`}
                selected={s.pauseMinutes === m}
                onPress={() => void save({ pauseMinutes: m })}
              />
            ))}
          </Chips>
        </Section>
        <Body muted>Gilt für den Timer, wenn du einen freien Block startest.</Body>
      </Sheet>

      <Sheet open={sheet === 'credit'} onClose={() => setSheet(null)} title="Guthaben">
        <Section title="Minuten pro Fokus-Stunde">
          <Chips>
            {[10, 15, 20, 30].map((m) => (
              <Chip
                key={m}
                label={`${m} Min`}
                selected={shown.creditPerHour === m}
                onPress={() => void save({ creditPerHour: m })}
              />
            ))}
          </Chips>
        </Section>
        <Section title="Höchstens pro Tag">
          <Chips>
            {[30, 60, 90, 120].map((m) => (
              <Chip
                key={m}
                label={`${m} Min`}
                selected={shown.dailyLimit === m}
                onPress={() => void save({ dailyLimit: m })}
              />
            ))}
          </Chips>
        </Section>
        <Section title="Übliche Scroll-Zeit pro Tag">
          <Chips>
            {[30, 45, 60, 90, 120].map((m) => (
              <Chip
                key={m}
                label={`${m} Min`}
                selected={shown.baselineScroll === m}
                onPress={() => void save({ baselineScroll: m })}
              />
            ))}
          </Chips>
        </Section>
        <Body muted>Damit rechnet FOKUS in der Woche, wie viel Scroll-Zeit du zurückholst.</Body>
        {pendingNote}
      </Sheet>
    </Screen>
  );
}
