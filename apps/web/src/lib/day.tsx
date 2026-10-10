// Gemeinsamer Stand des Tages für Heute, Fokus und Inbox: Blöcke, Aufgaben, Guthaben, laufender
// Fokus-Durchgang und Notizen. Eine Quelle, damit alle Tabs dasselbe zeigen. Geladen wird erst,
// wenn eine Seite `reload()` ruft (nach der Anmeldung), danach jede Minute und beim Zurückkehren.
import { todayIn, type CreditSummary, type PlanSettings } from '@fokus/core';
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

export type Block = {
  id: string;
  kind: 'focus' | 'pause' | 'social' | 'event';
  startsAt: string;
  minutes: number;
  title: string;
  taskId: string | null;
  status: 'planned' | 'running' | 'done' | 'skipped';
  source: 'plan' | 'manual' | 'calendar';
};
export type Task = {
  id: string;
  title: string;
  minutes: number;
  heavy: boolean;
  mini: boolean;
  due: string | null;
  status: 'open' | 'done';
  note: string;
};
export type Running = {
  id: string;
  blockId: string | null;
  taskId: string | null;
  startedAt: string;
  plannedMinutes: number;
};
export type Gap = { startsAt: string; minutes: number; suggestions: string[] };
export type DayData = {
  day: string;
  settings: PlanSettings;
  blocks: Block[];
  tasks: Task[];
  credit: CreditSummary;
  focusMinutes: number;
  running: Running | null;
  gaps: Gap[];
};
export type Note = { id: string; text: string; createdAt: string };

export type NewTask = {
  title: string;
  minutes?: number;
  heavy?: boolean;
  mini?: boolean;
  due?: string | null;
};

interface DayApi {
  data: DayData | null;
  notes: Note[] | null;
  error: string;
  /** Neu laden (still, wenn schon Daten da sind) */
  reload: () => Promise<void>;
  addNote: (text: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  /** Notiz wird zur Aufgabe */
  planNote: (id: string, fields: Partial<NewTask>) => Promise<void>;
  addTask: (t: NewTask) => Promise<Task>;
  setTaskDone: (id: string, done: boolean) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  planToday: () => Promise<{ unplaced: { title: string; minutes: number }[] }>;
  startFocus: (opts: { blockId?: string; taskId?: string; minutes?: number }) => Promise<Running>;
  finishFocus: (
    id: string,
    opts: { taskDone?: boolean },
  ) => Promise<{ focusedMinutes: number; earned: number }>;
  setBlockStatus: (id: string, status: Block['status']) => Promise<void>;
  removeBlock: (id: string) => Promise<void>;
  spend: (
    minutes: number,
    reason: 'social' | 'redirect',
    blockId?: string,
  ) => Promise<{ granted: number; short: number }>;
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
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  const reload = useCallback(async () => {
    started.current = true;
    try {
      const [d, n] = await Promise.all([
        api<DayData>(`/api/day/${todayIn()}`),
        api<Note[]>('/api/inbox'),
      ]);
      setData(d);
      setNotes(n);
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
      notes,
      error,
      reload,
      addNote: (text) => then(api('/api/inbox', { body: { text } })),
      removeNote: (id) => then(api(`/api/inbox/${id}`, { method: 'DELETE' })),
      planNote: (id, fields) => then(api(`/api/inbox/${id}/plan`, { body: fields })),
      addTask: (t) => then(api<Task>('/api/tasks', { body: t })),
      setTaskDone: (id, done) =>
        then(api(`/api/tasks/${id}/${done ? 'done' : 'reopen'}`, { method: 'POST', body: {} })),
      removeTask: (id) => then(api(`/api/tasks/${id}`, { method: 'DELETE' })),
      planToday: () =>
        then(
          api<{ unplaced: { title: string; minutes: number }[] }>(`/api/plan/${todayIn()}`, {
            method: 'POST',
            body: {},
          }),
        ),
      startFocus: (opts) => then(api<Running>('/api/focus/start', { body: opts })),
      finishFocus: (id, opts) =>
        then(
          api<{ focusedMinutes: number; earned: number }>(`/api/focus/${id}/finish`, {
            body: opts,
          }),
        ),
      setBlockStatus: (id, status) =>
        then(api(`/api/blocks/${id}`, { method: 'PUT', body: { status } })),
      removeBlock: (id) => then(api(`/api/blocks/${id}`, { method: 'DELETE' })),
      spend: (minutes, reason, blockId) =>
        then(
          api<{ granted: number; short: number }>('/api/credit/spend', {
            body: { minutes, reason, blockId },
          }),
        ),
    };
  }, [data, notes, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
