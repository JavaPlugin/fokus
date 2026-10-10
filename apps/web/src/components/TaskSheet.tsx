// Eine Aufgabe anlegen oder bearbeiten (gleiches Sheet): Was? · Art · Wie lange? · Wann? ·
// Wiederholen. Bei einer Wiederholung fragt FOKUS beim Sichern und Löschen: „Nur diese“ oder „Alle“.
import { clock, dayInZone, instant, todayIn, type Recurrence } from '@fokus/core';
import {
  Body,
  Button,
  Card,
  Chip,
  Chips,
  DateField,
  Field,
  Notice,
  Section,
  Segmented,
  Sheet,
  kindColors,
  type,
  usePalette,
} from '@fokus/ui';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useDay, type Item, type Kind, type Schedule, type Task } from '../lib/day';
import { useUndo } from '../lib/undo';
import { TimeField } from './TimeField';

const DURATIONS = [15, 30, 60, 120];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

const durationLabel = (m: number) => (m % 60 === 0 ? `${m / 60} Std` : `${m} Min`);

/** Nächste volle Stunde als „HH:MM“. */
const nextHour = () => {
  const h = (new Date().getHours() + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
};

type Scope = 'one' | 'all';

export function TaskSheet({
  open,
  onClose,
  task,
  item,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  /** Zum Bearbeiten */
  task?: Task | null;
  /** Das angetippte Vorkommen (bei Wiederholung: „Nur diese“ möglich) */
  item?: Item | null;
  /** Vorbelegung beim Anlegen (z. B. aus einer freien Zeit) */
  defaults?: Partial<{
    title: string;
    minutes: number;
    schedule: Schedule;
    day: string;
    time: string;
  }>;
}) {
  const p = usePalette();
  const day = useDay();
  const undo = useUndo();
  const today = todayIn();

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('work');
  const [minutes, setMinutes] = useState(30);
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [schedule, setSchedule] = useState<Schedule>('auto');
  const [fixedDay, setFixedDay] = useState(today);
  const [time, setTime] = useState(nextHour());
  const [rec, setRec] = useState<'none' | 'daily' | 'weekdays' | 'weekly'>('none');
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<null | 'save' | 'delete'>(null);

  // Beim Öffnen füllen
  useEffect(() => {
    if (!open) return;
    setError('');
    setAsk(null);
    if (task) {
      setTitle(item?.title ?? task.title);
      setKind(task.kind);
      const m = item?.minutes ?? task.minutes;
      setMinutes(m);
      setCustom(!DURATIONS.includes(m));
      setCustomText(DURATIONS.includes(m) ? '' : String(m));
      setSchedule(task.schedule);
      const at = task.fixedAt ? new Date(task.fixedAt) : null;
      setFixedDay(at ? dayInZone(at) : (item?.day ?? today));
      setTime(item && item.how === 'fixed' ? clock(item.start) : at ? clock(at) : nextHour());
      setRec(task.recurrence?.freq ?? 'none');
      setDays(task.recurrence?.days ?? (task.recurrence?.freq === 'weekly' ? [] : []));
    } else {
      setTitle(defaults?.title ?? '');
      setKind('work');
      const m = defaults?.minutes ?? 30;
      setMinutes(m);
      setCustom(!DURATIONS.includes(m));
      setCustomText(DURATIONS.includes(m) ? '' : String(m));
      setSchedule(defaults?.schedule ?? 'auto');
      setFixedDay(defaults?.day ?? today);
      setTime(defaults?.time ?? nextHour());
      setRec('none');
      setDays([]);
    }
  }, [open, task?.id, item?.key]);

  const recurring = !!task?.recurrence && !!item;
  const recurrence: Recurrence | null =
    schedule === 'later' || rec === 'none'
      ? null
      : rec === 'weekly'
        ? { freq: 'weekly', days: days.length ? days : undefined }
        : { freq: rec };

  const shownMinutes = custom ? Number(customText) || 0 : minutes;
  const valid = title.trim().length > 0 && shownMinutes >= 1 && shownMinutes <= 720;

  const body = () => ({
    title: title.trim(),
    kind,
    minutes: shownMinutes,
    schedule,
    fixedAt: schedule === 'fixed' ? new Date(instant(fixedDay, time)).toISOString() : null,
    recurrence,
  });

  async function run(fn: () => Promise<unknown>, message: string, onUndo?: () => void) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onClose();
      undo.notify(message, onUndo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setAsk(null);
    }
  }

  async function save(scope?: Scope) {
    if (!valid) return;
    if (!task) {
      let id = '';
      await run(
        async () => {
          id = (await day.createTask(body())).id;
        },
        `„${title.trim()}“ angelegt`,
        () => void day.deleteTask(id),
      );
      return;
    }
    if (recurring && !scope) return setAsk('save');
    if (recurring && scope === 'one' && item)
      return run(
        () =>
          day.updateOccurrence(task.id, item.day, {
            title: title.trim(),
            minutes: shownMinutes,
            time: schedule === 'fixed' ? time : null,
          }),
        `„${title.trim()}“ geändert (nur diese)`,
      );
    return run(() => day.updateTask(task.id, body()), `„${title.trim()}“ gesichert`);
  }

  async function remove(scope?: Scope) {
    if (!task) return;
    if (recurring && !scope) return setAsk('delete');
    onClose();
    setAsk(null);
    const label = `„${task.title}“ gelöscht`;
    if (recurring && scope === 'one' && item)
      undo.remove(
        item.key,
        () => day.updateOccurrence(task.id, item.day, { skipped: true }),
        label,
      );
    else undo.remove(task.id, () => day.deleteTask(task.id), label);
  }

  const dot = (k: Kind) =>
    ({ work: kindColors.focus, pause: kindColors.pause, social: kindColors.social })[k];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={task ? 'Aufgabe' : 'Neue Aufgabe'}
      action={{
        label: task ? 'Sichern' : 'Anlegen',
        onPress: () => void save(),
        disabled: !valid || busy,
      }}
    >
      {ask ? (
        <>
          <Body>
            {ask === 'save'
              ? 'Diese Aufgabe wiederholt sich. Was soll sich ändern?'
              : 'Diese Aufgabe wiederholt sich. Was soll gelöscht werden?'}
          </Body>
          <Button
            label="Nur diese"
            onPress={() => void (ask === 'save' ? save('one') : remove('one'))}
          />
          <Button
            label="Alle"
            variant={ask === 'save' ? 'secondary' : 'danger'}
            onPress={() => void (ask === 'save' ? save('all') : remove('all'))}
          />
          <Button label="Zurück" variant="secondary" onPress={() => setAsk(null)} />
        </>
      ) : (
        <>
          <Field
            label="Was?"
            value={title}
            onChangeText={setTitle}
            placeholder="z. B. Angebot schreiben"
            autoFocus={!task}
            returnKeyType="done"
          />

          <Section title="Art">
            <Segmented<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'work', label: 'Arbeit' },
                { value: 'pause', label: 'Pause' },
                { value: 'social', label: 'Social' },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot(kind) }} />
              <Text style={[type.small, { color: p.ink3 }]}>
                {kind === 'work'
                  ? 'Arbeit bringt Scroll-Guthaben: je 1 Std. Fokus gibt es Minuten für Social Media.'
                  : kind === 'pause'
                    ? 'Pausen erinnern dich daran, abzuschalten.'
                    : 'Social-Zeit wird beim Start vom Guthaben abgezogen.'}
              </Text>
            </View>
          </Section>

          <Section title="Wie lange?">
            <Chips>
              {DURATIONS.map((d) => (
                <Chip
                  key={d}
                  label={durationLabel(d)}
                  selected={!custom && minutes === d}
                  onPress={() => {
                    setCustom(false);
                    setMinutes(d);
                  }}
                />
              ))}
              <Chip label="…" selected={custom} onPress={() => setCustom(true)} />
            </Chips>
            {custom ? (
              <Field
                label="Minuten"
                value={customText}
                onChangeText={(v) => setCustomText(v.replace(/\D/g, '').slice(0, 3))}
                inputMode="numeric"
                placeholder="z. B. 45"
              />
            ) : null}
          </Section>

          <Section title="Wann?">
            <Segmented<Schedule>
              value={schedule}
              onChange={setSchedule}
              options={[
                { value: 'auto', label: 'Automatisch' },
                { value: 'fixed', label: 'Feste Zeit' },
                { value: 'later', label: 'Später' },
              ]}
            />
            {schedule === 'fixed' ? (
              <Card>
                <DateField label="Tag" value={fixedDay} today={today} onChange={setFixedDay} />
                <TimeField value={time} onChange={setTime} />
              </Card>
            ) : null}
            <Body muted>
              {schedule === 'auto'
                ? 'Automatisch = FOKUS sucht einen freien Platz in deiner Arbeitszeit.'
                : schedule === 'fixed'
                  ? 'Feste Zeit gilt immer, auch außerhalb deiner Arbeitszeit.'
                  : 'Später = noch ohne Zeit. Du findest die Aufgabe unter „Aufgaben“ und planst sie ein, wenn du so weit bist.'}
            </Body>
          </Section>

          {schedule !== 'later' ? (
            <Section title="Wiederholen">
              <Chips>
                {(
                  [
                    ['none', 'Nie'],
                    ['daily', 'Täglich'],
                    ['weekdays', 'Werktags'],
                    ['weekly', 'Wöchentlich'],
                  ] as const
                ).map(([k, l]) => (
                  <Chip key={k} label={l} selected={rec === k} onPress={() => setRec(k)} />
                ))}
              </Chips>
              {rec === 'weekly' ? (
                <Chips>
                  {WD_ORDER.map((d) => (
                    <Chip
                      key={d}
                      label={WD[d]!}
                      selected={days.includes(d)}
                      onPress={() =>
                        setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))
                      }
                    />
                  ))}
                </Chips>
              ) : null}
            </Section>
          ) : null}

          {error ? <Notice tone="negative">{error}</Notice> : null}
          <Button
            label={task ? 'Sichern' : 'Aufgabe anlegen'}
            loading={busy}
            disabled={!valid}
            onPress={() => void save()}
          />
          {task ? <Button label="Löschen" variant="danger" onPress={() => void remove()} /> : null}
        </>
      )}
    </Sheet>
  );
}
