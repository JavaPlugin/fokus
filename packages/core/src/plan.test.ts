import { describe, expect, it } from 'vitest';
import { clock, instant, MIN_MS } from './dates';
import { suggestForGap, pickRedirectTask, freeGaps } from './gaps';
import { DEFAULT_SETTINGS, type TaskLite } from './model';
import { mergeIntervals, planDay, subtract, workWindow } from './plan';

const DAY = '2026-10-12';
const S = DEFAULT_SETTINGS;
const at = (hhmm: string) => instant(DAY, hhmm);
const task = (id: string, minutes: number, p: Partial<TaskLite> = {}): TaskLite => ({
  id,
  title: id,
  minutes,
  heavy: false,
  mini: false,
  due: null,
  ...p,
});
/** „09:00 focus a 50“ */
const show = (r: ReturnType<typeof planDay>) =>
  r.blocks.map((b) => `${clock(b.start)} ${b.kind} ${b.taskId ?? '-'} ${b.minutes}`);

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

  it('Arbeitsfenster ab jetzt, auf 5 Minuten aufgerundet', () => {
    expect(workWindow(DAY, S)).toEqual({ start: at('09:00'), end: at('18:00') });
    expect(workWindow(DAY, S, at('10:02'))!.start).toBe(at('10:05'));
    expect(workWindow(DAY, S, at('07:00'))!.start).toBe(at('09:00'));
    expect(workWindow(DAY, S, at('18:30'))).toBeNull();
  });
});

describe('Tagesplan', () => {
  it('eine kurze Aufgabe: ein Fokus-Block am Anfang', () => {
    const r = planDay({ day: DAY, settings: S, busy: [], tasks: [task('a', 30)] });
    expect(show(r)).toEqual(['09:00 focus a 30']);
    expect(r.unplaced).toEqual([]);
  });

  it('lange Aufgabe: Blöcke à 50 Min., dazwischen 10 Min. Pause', () => {
    const r = planDay({ day: DAY, settings: S, busy: [], tasks: [task('a', 120)] });
    expect(show(r)).toEqual([
      '09:00 focus a 50',
      '09:50 pause - 10',
      '10:00 focus a 50',
      '10:50 pause - 10',
      '11:00 focus a 20',
    ]);
  });

  it('Termine bleiben frei, auch krumme Zeiten (Raster 5 Min.)', () => {
    const r = planDay({
      day: DAY,
      settings: S,
      busy: [{ start: at('09:30'), end: at('10:07') }],
      tasks: [task('a', 60)],
    });
    expect(show(r)).toEqual(['09:00 focus a 30', '10:10 focus a 30']);
    // nichts liegt im Termin
    for (const b of r.blocks) {
      const end = b.start + b.minutes * MIN_MS;
      expect(end <= at('09:30') || b.start >= at('10:07')).toBe(true);
    }
  });

  it('Reihenfolge: früh fällig, dann schwer, dann lang', () => {
    const r = planDay({
      day: DAY,
      settings: S,
      busy: [],
      tasks: [
        task('leicht', 20),
        task('schwer', 20, { heavy: true }),
        task('faellig', 20, { due: '2026-10-12' }),
        task('spaeter', 20, { due: '2026-10-20' }),
      ],
    });
    expect(r.blocks.map((b) => b.taskId)).toEqual(['faellig', 'spaeter', 'schwer', 'leicht']);
  });

  it('schwere Aufgaben in die Hochphase, leichte davor', () => {
    const r = planDay({
      day: DAY,
      settings: S,
      busy: [],
      tasks: [task('schwer', 50, { heavy: true }), task('leicht', 30)],
      peaks: [{ from: '10:00', to: '12:00' }],
    });
    expect(show(r)).toEqual(['09:00 focus leicht 30', '10:00 focus schwer 50']);
  });

  it('Hochphase voll: schwere Aufgabe weicht auf den Rest des Tages aus', () => {
    const r = planDay({
      day: DAY,
      settings: S,
      busy: [{ start: at('10:00'), end: at('12:00') }],
      tasks: [task('schwer', 50, { heavy: true })],
      peaks: [{ from: '10:00', to: '12:00' }],
    });
    expect(show(r)).toEqual(['09:00 focus schwer 50']);
  });

  it('nichts in der Vergangenheit', () => {
    const r = planDay({
      day: DAY,
      now: at('13:02'),
      settings: S,
      busy: [],
      tasks: [task('a', 30)],
    });
    expect(show(r)).toEqual(['13:05 focus a 30']);
  });

  it('zu viel für den Tag: Rest bleibt übrig', () => {
    const r = planDay({
      day: DAY,
      settings: { ...S, workEnd: '10:00' },
      busy: [],
      tasks: [task('a', 120)],
    });
    expect(r.blocks.reduce((s, b) => s + (b.kind === 'focus' ? b.minutes : 0), 0)).toBe(60);
    expect(r.unplaced).toEqual([{ taskId: 'a', minutes: 60 }]);
  });

  it('Lücken kürzer als 10 Min. bleiben leer, Mini-Aufgaben werden nicht fest geplant', () => {
    const r = planDay({
      day: DAY,
      settings: S,
      busy: [{ start: at('09:05'), end: at('17:55') }],
      tasks: [task('a', 30), task('m', 2, { mini: true })],
    });
    expect(r.blocks).toEqual([]);
    expect(r.unplaced).toEqual([{ taskId: 'a', minutes: 30 }]);
  });

  it('stabil: gleiche Eingabe, gleicher Plan', () => {
    const input = {
      day: DAY,
      settings: S,
      busy: [],
      tasks: [task('b', 40), task('a', 40)],
    };
    expect(planDay(input)).toEqual(planDay(input));
  });
});

describe('Energie', () => {
  const tasks = [task('schwer', 50, { heavy: true }), task('leicht', 30)];
  const peaks = [{ from: '10:00', to: '12:00' }];

  it('niedrig: Leichtes zuerst, Schweres zuletzt, Hochphase gilt nicht', () => {
    const r = planDay({ day: DAY, settings: S, busy: [], tasks, peaks, energy: 'low' });
    expect(show(r)).toEqual(['09:00 focus leicht 30', '09:30 focus schwer 50']);
  });

  it('hoch und normal: Schweres in die Hochphase', () => {
    for (const energy of ['high', 'normal'] as const)
      expect(show(planDay({ day: DAY, settings: S, busy: [], tasks, peaks, energy }))).toEqual([
        '09:00 focus leicht 30',
        '10:00 focus schwer 50',
      ]);
  });
});

describe('Lücken-Füller', () => {
  it('freie Lücken ab 15 Min. (kleinere zählen nicht)', () => {
    const g = freeGaps(
      DAY,
      [
        { start: at('09:10'), end: at('12:00') },
        { start: at('12:10'), end: at('17:50') },
      ],
      S,
    );
    expect(g).toEqual([]);
    const h = freeGaps(DAY, [{ start: at('09:10'), end: at('17:00') }], S);
    expect(h.map((x) => [clock(x.start), clock(x.end)])).toEqual([['17:00', '18:00']]);
  });

  it('passende Aufgaben: früh fällig, Mini zuerst, sonst am besten gefüllt', () => {
    const tasks = [
      task('gross', 40),
      task('mini', 3, { mini: true }),
      task('mittel', 15),
      task('faellig', 10, { due: '2026-10-12' }),
    ];
    expect(suggestForGap(15, tasks).map((t) => t.id)).toEqual(['faellig', 'mini', 'mittel']);
    expect(suggestForGap(5, tasks).map((t) => t.id)).toEqual(['mini']);
    expect(suggestForGap(2, tasks)).toEqual([]);
    expect(suggestForGap(60, tasks, 1)).toHaveLength(1);
  });

  it('Umleiten: eine Mini-Aufgabe bis 2 Min.', () => {
    const tasks = [task('lang', 2), task('m5', 5, { mini: true }), task('m2', 2, { mini: true })];
    expect(pickRedirectTask(tasks)?.id).toBe('m2');
    expect(pickRedirectTask(tasks, 5, 'm2')?.id).toBe('m5');
    expect(pickRedirectTask([task('x', 30)])).toBeNull();
  });
});
