import { clock, todayIn } from '@fokus/core';
import { Body, Button, Segmented, SwipeRow, Title, font, type, usePalette } from '@fokus/ui';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HeadButtons } from '../../components/HeadButtons';
import { Screen, type ScreenHead } from '../../components/Screen';
import { TaskRow, rowSub } from '../../components/TaskRow';
import { useTaskEditor } from '../../components/useTaskEditor';
import { api } from '../../lib/api';
import { useDay, type Item, type Task } from '../../lib/day';
import { dayLabel } from '../../lib/format';
import { useUndo } from '../../lib/undo';

type View_ = 'open' | 'recurring' | 'done';
type Open = {
  today: Item[];
  week: { day: string; items: Item[] }[];
  later: Task[];
  waiting: Task[];
};
type Recurring = (Task & { label: string })[];
type Done = {
  key: string;
  taskId: string;
  day: string;
  title: string;
  kind: Task['kind'];
  minutes: number;
  doneAt: string;
  recurring: string;
}[];

const dur = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} Std` : `${m} Min`);

/** Aufgaben: alles, was ansteht. Kreis = erledigt, Aufgabe antippen = bearbeiten. */
export default function Aufgaben() {
  const p = usePalette();
  const day = useDay();
  const undo = useUndo();
  const editor = useTaskEditor();
  const [view, setView] = useState<View_>('open');
  const [open, setOpen] = useState<Open | null>(null);
  const [recurring, setRecurring] = useState<Recurring | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState('');
  const head: ScreenHead = { title: 'Aufgaben', right: <HeadButtons /> };

  const load = useCallback(() => {
    const get = <T,>(v: View_, set: (x: T) => void) =>
      api<T>(`/api/tasks?view=${v}`)
        .then((r) => (set(r), setError('')))
        .catch((e: Error) => setError(e.message));
    if (view === 'open') void get<Open>('open', setOpen);
    else if (view === 'recurring') void get<Recurring>('recurring', setRecurring);
    else void get<Done>('done', setDone);
  }, [view]);
  // Neu laden bei Wechsel und nach jeder Änderung
  useEffect(load, [load, day.version]);

  const toggle = async (taskId: string, d: string, title: string, was: boolean) => {
    await day.setDone(taskId, d, !was);
    if (!was) undo.notify(`„${title}“ erledigt`, () => void day.setDone(taskId, d, false));
  };

  const itemRow = (i: Item, showDay = false) => (
    <SwipeRow
      key={i.key}
      onDelete={() =>
        i.taskId && undo.remove(i.key, () => day.deleteTask(i.taskId!), `„${i.title}“ gelöscht`)
      }
    >
      <TaskRow
        title={i.title}
        sub={rowSub(
          showDay ? `${dayLabel(i.day)} ${clock(i.start)}` : clock(i.start),
          i.minutes,
          i.kind,
          i.how,
          i.recurring,
        )}
        kind={i.kind}
        done={i.done}
        onToggle={i.taskId ? () => void toggle(i.taskId!, i.day, i.title, i.done) : undefined}
        onPress={i.taskId ? () => editor.editItem(i) : undefined}
      />
    </SwipeRow>
  );

  const laterRow = (t: Task, hint?: string) => (
    <SwipeRow
      key={t.id}
      onDelete={() => undo.remove(t.id, () => day.deleteTask(t.id), `„${t.title}“ gelöscht`)}
    >
      <TaskRow
        title={t.title}
        sub={[dur(t.minutes), hint ?? (t.due ? `bis ${dayLabel(t.due)}` : '')]
          .filter(Boolean)
          .join(' · ')}
        kind={t.kind}
        onToggle={() => void toggle(t.id, todayIn(), t.title, false)}
        onPress={() => editor.editTask(t)}
        trailing={
          t.schedule === 'later' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t.title} einplanen`}
              onPress={async () => {
                await day.updateTask(t.id, { schedule: 'auto' });
                undo.notify(`„${t.title}“ wird automatisch eingeplant`);
              }}
              style={{
                height: 34,
                borderRadius: 17,
                paddingHorizontal: 14,
                backgroundColor: p.surface2,
                justifyContent: 'center',
              }}
            >
              <Text style={[type.small, { color: p.ink }]}>Einplanen</Text>
            </Pressable>
          ) : undefined
        }
      />
    </SwipeRow>
  );

  const heading = (t: string) => (
    <Text
      style={[
        type.small,
        {
          color: p.ink3,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontFamily: font.semibold,
        },
      ]}
    >
      {t}
    </Text>
  );

  const openCount = open
    ? open.today.filter((i) => !i.done && i.taskId).length + open.later.length
    : 0;
  const visibleOpen = open && {
    ...open,
    today: open.today.filter((i) => !undo.hidden.has(i.key)),
    later: open.later.filter((t) => !undo.hidden.has(t.id)),
  };

  return (
    <Screen head={head}>
      <Title>Aufgaben</Title>
      <Segmented<View_>
        value={view}
        onChange={setView}
        options={[
          { value: 'open', label: open ? `Offen · ${openCount}` : 'Offen' },
          { value: 'recurring', label: 'Wiederkehrend' },
          { value: 'done', label: 'Erledigt' },
        ]}
      />

      {view === 'open' && visibleOpen ? (
        <>
          {visibleOpen.today.length ? (
            <View style={{ gap: 8 }}>
              {heading('Heute eingeplant')}
              {visibleOpen.today.map((i) => itemRow(i))}
            </View>
          ) : null}
          {visibleOpen.later.length || visibleOpen.waiting.length ? (
            <View style={{ gap: 8 }}>
              {heading('Noch ohne Zeit')}
              {visibleOpen.later.map((t) => laterRow(t))}
              {visibleOpen.waiting.map((t) => laterRow(t, 'kein Platz in der Arbeitszeit'))}
            </View>
          ) : null}
          {visibleOpen.week.some((w) => w.items.length) ? (
            <View style={{ gap: 8 }}>
              {heading('Diese Woche')}
              {visibleOpen.week.flatMap((w) => w.items.map((i) => itemRow(i, true)))}
            </View>
          ) : null}
          {!visibleOpen.today.length &&
          !visibleOpen.later.length &&
          !visibleOpen.waiting.length &&
          !visibleOpen.week.some((w) => w.items.length) ? (
            <Body muted>Nichts offen. Mit dem Plus unten legst du eine Aufgabe an.</Body>
          ) : null}
        </>
      ) : null}

      {view === 'recurring' && recurring ? (
        recurring.length ? (
          <View style={{ gap: 8 }}>
            {recurring.map((t) => (
              <TaskRow
                key={t.id}
                title={t.title}
                sub={[
                  dur(t.minutes),
                  t.label,
                  t.schedule === 'fixed' && t.fixedAt
                    ? `um ${clock(t.fixedAt)}`
                    : 'automatisch geplant',
                ].join(' · ')}
                kind={t.kind}
                onPress={() => editor.editTask(t)}
              />
            ))}
          </View>
        ) : (
          <Body muted>
            Noch nichts Wiederkehrendes. Beim Anlegen wählst du unter „Wiederholen“ täglich,
            werktags oder wöchentlich.
          </Body>
        )
      ) : null}

      {view === 'done' && done ? (
        done.length ? (
          <View style={{ gap: 8 }}>
            {done.map((d) => (
              <TaskRow
                key={d.key}
                title={d.title}
                sub={`${dayLabel(d.day)} · ${dur(d.minutes)}${d.recurring ? ` · ${d.recurring}` : ''}`}
                kind={d.kind}
                done
                onToggle={() => void day.setDone(d.taskId, d.day, false)}
              />
            ))}
            <Body muted>Kreis antippen = wieder öffnen. Gezeigt werden die letzten 30 Tage.</Body>
          </View>
        ) : (
          <Body muted>Noch nichts erledigt.</Body>
        )
      ) : null}

      {error ? <Body muted>{error}</Body> : null}
      {view === 'open' ? (
        <>
          <Button label="Neue Aufgabe" variant="secondary" onPress={() => editor.newTask()} />
          <Text style={[type.small, { color: p.ink3, textAlign: 'center' }]}>
            Kreis antippen = erledigt. Aufgabe antippen = bearbeiten.
          </Text>
        </>
      ) : null}
      {editor.sheet}
    </Screen>
  );
}
