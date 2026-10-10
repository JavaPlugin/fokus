import { describe, expect, it } from 'vitest';
import { clock, instant, MIN_MS } from './dates';
import { freeGaps, pickRedirectTask, suggestForGap } from './gaps';
import { WORK_DAY } from './model';
import { mergeIntervals, planAhead, subtract, workWindow, type DayInput } from './plan';
import { cleanRecurrence, occursOn, recurrenceLabel } from './recurrence';

// 12.10.2026 ist ein Montag
const MON = '2026-10-12';
const at = (hhmm: string, day = MON) => instant(day, hhmm);
const day = (d: string, over: Partial<DayInput> = {}): DayInput => ({
  day: d,
  hours: WORK_DAY,
  busy: [],
  recurring: [],
  ...over,
});
const show = (r: ReturnType<typeof planAhead>, d: string) =>
  r.byDay[d]!.map((p) => `${clock(p.start)} ${p.taskId} ${p.minutes}`);

describe('Zeitspannen', () => {
  it('verschmelzen und abziehen', () => {
    expect(
      mergeIntervals([
        { start: 5, end: 8 },
        { start: 1, end: 3 },
        { start: 2, end: 6 },
      ]),
    ).toEqual([{ start: 1, end: 8 }]);
    expect(
      subtract({ start: 0, end: 10 }, [
        { start: 2, end: 4 },
        { start: 8, end: 20 },
        { start: -5, end: 1 },
      ]),
    ).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 8 },
    ]);
  });

  it('Arbeitsfenster: ab jetzt auf 5 Minuten aufgerundet, frei = kein Fenster', () => {
    expect(workWindow(MON, WORK_DAY)).toEqual({ start: at('09:00'), end: at('17:00') });
    expect(workWindow(MON, WORK_DAY, at('10:02'))!.start).toBe(at('10:05'));
    expect(workWindow(MON, WORK_DAY, at('07:00'))!.start).toBe(at('09:00'));
    expect(workWindow(MON, WORK_DAY, at('17:30'))).toBeNull();
    expect(workWindow(MON, null)).toBeNull();
  });
});

describe('Planer', () => {
  it('automatische Aufgaben nacheinander ab Arbeitsbeginn', () => {
    const r = planAhead(
      [day(MON)],
      [
        { id: 'a', minutes: 50 },
        { id: 'b', minutes: 30 },
      ],
    );
    expect(show(r, MON)).toEqual(['09:00 a 50', '09:50 b 30']);
    expect(r.unplaced).toEqual([]);
  });

  it('weicht Terminen aus (auch krumme Zeiten, Raster 5 Min.) und nutzt Lücken', () => {
    const r = planAhead(
      [day(MON, { busy: [{ start: at('09:30'), end: at('10:07') }] })],
      [
        { id: 'lang', minutes: 60 },
        { id: 'kurz', minutes: 25 },
      ],
    );
    // 09:00–09:30 reicht für „lang“ nicht, „kurz“ (25) schon; „lang“ danach
    expect(show(r, MON)).toEqual(
      ['09:00 kurz 25', '10:10 lang 60'].sort((a, b) => (a < b ? -1 : 1)),
    );
  });

  it('nichts vor „jetzt“; nichts außerhalb der Arbeitszeit', () => {
    const r = planAhead([day(MON)], [{ id: 'a', minutes: 30 }], at('13:02'));
    expect(show(r, MON)).toEqual(['13:05 a 30']);
    const late = planAhead([day(MON)], [{ id: 'a', minutes: 30 }], at('16:50'));
    expect(late.byDay[MON]).toEqual([]);
    expect(late.unplaced).toEqual(['a']);
  });

  it('passt es heute nicht mehr, kommt es an den nächsten Arbeitstag; freie Tage werden übersprungen', () => {
    const FRI = '2026-10-16';
    const SAT = '2026-10-17';
    const NEXT_MON = '2026-10-19';
    const r = planAhead(
      [day(FRI), day(SAT, { hours: null }), day('2026-10-18', { hours: null }), day(NEXT_MON)],
      [
        { id: 'gross', minutes: 7 * 60 },
        { id: 'zweit', minutes: 3 * 60 },
      ],
    );
    expect(show(r, FRI)).toEqual(['09:00 gross 420']);
    expect(r.byDay[SAT]).toEqual([]);
    expect(show(r, NEXT_MON)).toEqual(['09:00 zweit 180']);
    expect(r.unplaced).toEqual([]);
  });

  it('Wiederkehrendes gehört zu seinem Tag und kommt vor Einmaligem', () => {
    const r = planAhead(
      [day(MON, { recurring: [{ id: 'taeglich', minutes: 30 }] })],
      [{ id: 'einmal', minutes: 45 }],
    );
    expect(show(r, MON)).toEqual(['09:00 taeglich 30', '09:30 einmal 45']);
    // Kein Platz: Vorkommen verfällt (kein Verschieben), wird gemeldet
    const full = planAhead(
      [
        day(MON, {
          busy: [{ start: at('09:00'), end: at('17:00') }],
          recurring: [{ id: 'x', minutes: 30 }],
        }),
      ],
      [],
    );
    expect(full.missedRecurring).toEqual([{ taskId: 'x', day: MON }]);
  });

  it('stabil: gleiche Eingabe, gleicher Plan; nichts überlappt', () => {
    const input = [
      day(MON, { busy: [{ start: at('11:00'), end: at('12:00') }] }),
      day('2026-10-13'),
    ];
    const tasks = [
      { id: 'a', minutes: 90 },
      { id: 'b', minutes: 120 },
      { id: 'c', minutes: 45 },
      { id: 'd', minutes: 240 },
    ];
    const r = planAhead(input, tasks);
    expect(planAhead(input, tasks)).toEqual(r);
    for (const [d, list] of Object.entries(r.byDay))
      list.forEach((p, i) => {
        const end = p.start + p.minutes * MIN_MS;
        expect(end <= at('17:00', d)).toBe(true);
        if (list[i + 1]) expect(end <= list[i + 1]!.start).toBe(true);
      });
  });
});

describe('Wiederholung', () => {
  const anchor = MON;
  it('täglich, werktags, wöchentlich, einmalig', () => {
    expect(occursOn({ freq: 'daily' }, anchor, '2026-10-17')).toBe(true);
    expect(occursOn({ freq: 'daily' }, anchor, '2026-10-11')).toBe(false);
    expect(occursOn({ freq: 'weekdays' }, anchor, '2026-10-16')).toBe(true);
    expect(occursOn({ freq: 'weekdays' }, anchor, '2026-10-17')).toBe(false);
    expect(occursOn({ freq: 'weekly', days: [1, 3] }, anchor, '2026-10-14')).toBe(true);
    expect(occursOn({ freq: 'weekly', days: [1, 3] }, anchor, '2026-10-15')).toBe(false);
    // ohne Tage: Wochentag des Ankers
    expect(occursOn({ freq: 'weekly' }, anchor, '2026-10-19')).toBe(true);
    expect(occursOn({ freq: 'weekly' }, anchor, '2026-10-20')).toBe(false);
    expect(occursOn(null, anchor, anchor)).toBe(true);
    expect(occursOn(null, anchor, '2026-10-13')).toBe(false);
  });

  it('Beschriftung und Eingabe säubern', () => {
    expect(recurrenceLabel({ freq: 'daily' })).toBe('täglich');
    expect(recurrenceLabel({ freq: 'weekdays' })).toBe('werktags');
    expect(recurrenceLabel({ freq: 'weekly', days: [3, 1] })).toBe('jeden Mo, Mi');
    expect(recurrenceLabel({ freq: 'weekly', days: [0, 6] })).toBe('jeden Sa, So');
    expect(recurrenceLabel({ freq: 'weekly' }, MON)).toBe('jeden Mo');
    expect(recurrenceLabel(null)).toBe('');
    expect(cleanRecurrence({ freq: 'weekly', days: [1, 1, 9, 'x'] })).toEqual({
      freq: 'weekly',
      days: [1],
    });
    expect(cleanRecurrence({ freq: 'weekly', days: [] })).toEqual({ freq: 'weekly' });
    expect(cleanRecurrence({ freq: 'monatlich' })).toBeNull();
    expect(cleanRecurrence(null)).toBeNull();
  });
});

describe('Freie Zeit', () => {
  it('Lücken ab 15 Min., nur in der Arbeitszeit, nach „jetzt“', () => {
    const busy = [
      { start: at('09:00'), end: at('15:20') },
      { start: at('15:25'), end: at('16:00') },
    ];
    expect(freeGaps(MON, WORK_DAY, busy).map((g) => [clock(g.start), clock(g.end)])).toEqual([
      ['16:00', '17:00'],
    ]);
    expect(freeGaps(MON, WORK_DAY, [], at('16:50'))).toEqual([]);
    expect(freeGaps(MON, null, [])).toEqual([]);
  });

  it('Vorschläge: früh fällig, dann am besten gefüllt; nur was passt', () => {
    const tasks = [
      { id: 'gross', minutes: 40, due: null },
      { id: 'mittel', minutes: 15, due: null },
      { id: 'faellig', minutes: 10, due: '2026-10-12' },
    ];
    expect(suggestForGap(15, tasks).map((t) => t.id)).toEqual(['faellig', 'mittel']);
    expect(suggestForGap(5, tasks)).toEqual([]);
    expect(suggestForGap(60, tasks, 1)).toHaveLength(1);
  });

  it('Umleiten: kurze Aufgabe bis 2 Minuten', () => {
    const tasks = [
      { id: 'lang', minutes: 30, due: null },
      { id: 'm5', minutes: 5, due: null },
      { id: 'm2', minutes: 2, due: null },
    ];
    expect(pickRedirectTask(tasks)?.id).toBe('m2');
    expect(pickRedirectTask(tasks, 5, 'm2')?.id).toBe('m5');
    expect(pickRedirectTask([tasks[0]!])).toBeNull();
  });
});
