// Gemeinsamer Stand für Heute, Aufgaben und Fokus: der Tagesplan (vom Server berechnet), Guthaben
// und der laufende Fokus-Durchgang. Jede Änderung lädt den Stand neu (`version` zählt hoch, damit
// Listen sich aktualisieren). Geladen wird erst, wenn eine Seite `reload()` ruft (nach der
// Anmeldung), danach jede Minute und beim Zurückkehren in die App.
import { todayIn, type CreditSummary, type PlanSettings, type Recurrence } from '@fokus/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { api } from './api';

export type Kind = 'work' | 'pause' | 'social';
export type Schedule = 'auto' | 'fixed' | 'later';

export type Task = {
  id: string;
  title: string;
  kind: Kind;
  minutes: number;
  schedule: Schedule;
  fixedAt: string | null;
  due: string | null;
  recurrence: Recurrence | null;
  anchor: string;
  status: 'open' | 'done';
  doneAt: string | null;
};

/** Eine Zeile im Tagesplan (Aufgabe an einem Tag oder Kalender-Termin). */
export type Item = {
  key: string;
  taskId: string | null;
  day: string;
  title: string;
  kind: Kind | 'event';
  start: string;
  minutes: number;
  how: 'auto' | 'fixed' | 'event';
  recurring: string;
  done: boolean;
  doneAt: string | null;
  changed: boolean;
};

export type Gap = {
  start: string;
  end: string;
  minutes: number;
  suggestion: { taskId: string; title: string; minutes: number } | null;
};

export type Running = {
  id: string;
  taskId: string | null;
  day: string;
  startedAt: string;
  plannedMinutes: number;
};

export type DayData = {
  day: string;
  hours: { from: string; to: string } | null;
  settings: PlanSettings;
  items: Item[];
  gaps: Gap[];
  waiting: Task[];
  credit: CreditSummary;
  focusMinutes: number;
  running: Running | null;
  /** Laufende Social-Freigabe (aus ausgegebenem Guthaben) */
  pass: { until: string } | null;
};

/** Eingabe beim Anlegen und Ändern einer Aufgabe. */
export type TaskInput = {
  title: string;
  kind: Kind;
  minutes: number;
  schedule: Schedule;
  fixedAt: string | null;
  recurrence: Recurrence | null;
};

interface DayApi {
  data: DayData | null;
  error: string;
  /** Zählt bei jeder Änderung hoch: Listen laden dann neu. */
  version: number;
  reload: () => Promise<void>;
  createTask: (t: Partial<TaskInput> & { title: string }) => Promise<Task>;
  updateTask: (id: string, t: Partial<TaskInput>) => Promise<void>;
  /** Nur ein Vorkommen einer Wiederholung ändern oder überspringen */
  updateOccurrence: (
    id: string,
    day: string,
    p: { title?: string; minutes?: number; time?: string | null; skipped?: boolean },
  ) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setDone: (taskId: string, day: string, done: boolean) => Promise<void>;
  startFocus: (opts: { taskId?: string; minutes?: number }) => Promise<Running>;
  finishFocus: (
    id: string,
    opts: { taskDone?: boolean },
  ) => Promise<{ focusedMinutes: number; earned: number }>;
  spend: (
    minutes: number,
    reason: 'social' | 'redirect',
  ) => Promise<{ granted: number; short: number; passUntil: string | null }>;
}

const Ctx = createContext<DayApi | null>(null);

export function useDay(): DayApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('DayProvider fehlt');
  return v;
}

const web = Platform.OS === 'web' && typeof document !== 'undefined';

export function DayProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const started = useRef(false);
  const lastSync = useRef(0);

  const reload = useCallback(async () => {
    started.current = true;
    try {
      // Kalender-Abos höchstens alle 10 Minuten abgleichen (der Server drosselt zusätzlich)
      if (Date.now() - lastSync.current > 10 * 60_000) {
        lastSync.current = Date.now();
        await api('/api/calendar/sync', { method: 'POST', body: {} }).catch(() => undefined);
      }
      setData(await api<DayData>(`/api/day/${todayIn()}`));
      setVersion((v) => v + 1);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Jede Minute und beim Zurückkehren in die App aktualisieren (nur wenn schon geladen wurde)
  useEffect(() => {
    const tick = () => started.current && void reload();
    const t = setInterval(tick, 60_000);
    const vis = () => document.visibilityState === 'visible' && tick();
    if (web) document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      if (web) document.removeEventListener('visibilitychange', vis);
    };
  }, [reload]);

  const value = useMemo<DayApi>(() => {
    const then = async <T,>(p: Promise<T>) => {
      const r = await p;
      await reload();
      return r;
    };
    return {
      data,
      error,
      version,
      reload,
      createTask: (t) => then(api<Task>('/api/tasks', { body: t })),
      updateTask: (id, t) => then(api(`/api/tasks/${id}`, { method: 'PUT', body: t })),
      updateOccurrence: (id, day, p) =>
        then(api(`/api/tasks/${id}/occurrence/${day}`, { method: 'PUT', body: p })),
      deleteTask: (id) => then(api(`/api/tasks/${id}`, { method: 'DELETE' })),
      setDone: (taskId, day, done) =>
        then(api(`/api/tasks/${taskId}/${done ? 'done' : 'reopen'}`, { body: { day } })),
      startFocus: (opts) => then(api<Running>('/api/focus/start', { body: opts })),
      finishFocus: (id, opts) =>
        then(
          api<{ focusedMinutes: number; earned: number }>(`/api/focus/${id}/finish`, {
            body: opts,
          }),
        ),
      spend: (minutes, reason) =>
        then(
          api<{ granted: number; short: number; passUntil: string | null }>('/api/credit/spend', {
            body: { minutes, reason },
          }),
        ),
    };
  }, [data, error, version, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
