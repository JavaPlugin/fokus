// Gemeinsam für Heute und Aufgaben: Aufgabe antippen = Bearbeiten-Sheet, „+“ = Neue Aufgabe.
import { useState, type ReactElement } from 'react';
import { api } from '../lib/api';
import type { Item, Schedule, Task } from '../lib/day';
import { TaskSheet } from './TaskSheet';

type Defaults = Partial<{
  title: string;
  minutes: number;
  schedule: Schedule;
  day: string;
  time: string;
}>;

export function useTaskEditor(): {
  editItem: (item: Item) => void;
  editTask: (task: Task) => void;
  newTask: (defaults?: Defaults) => void;
  error: string;
  sheet: ReactElement;
} {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [defaults, setDefaults] = useState<Defaults | undefined>();
  const [error, setError] = useState('');

  return {
    error,
    editItem: (i) => {
      if (!i.taskId) return;
      setError('');
      api<Task>(`/api/tasks/${i.taskId}`)
        .then((t) => {
          setTask(t);
          setItem(i);
          setOpen(true);
        })
        .catch((e: Error) => setError(e.message));
    },
    editTask: (t) => {
      setTask(t);
      setItem(null);
      setOpen(true);
    },
    newTask: (d) => {
      setTask(null);
      setItem(null);
      setDefaults(d);
      setOpen(true);
    },
    sheet: (
      <TaskSheet
        open={open}
        onClose={() => setOpen(false)}
        task={task}
        item={item}
        defaults={defaults}
      />
    ),
  };
}
