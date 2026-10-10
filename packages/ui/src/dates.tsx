// Datumsauswahl: drei Bausteine, überall gleich. Nie Freitext.
// - DateField: einzelnes Datum (Buchung, Begleichen), öffnet Kalender mit „Heute“ / „Gestern“
// - DayOfMonthPicker: Tag im Monat (monatliche Posten), Raster 1–31 + „Letzter Tag“
// - YearlyPicker: Monat + Tag (jährliche Termine, Kündbar bis)
// Gespeichert wird ISO (YYYY-MM-DD) bzw. Zahlen, angezeigt deutsch.
import {
  addDays,
  dateOf,
  dayOf,
  daysInMonth,
  monthOf,
  nextMonth,
  prevMonth,
  weekday,
  yearOf,
  type Day,
} from '@fokus/core';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ListRow, usePalette } from './components';
import { Chip, Chips, Sheet } from './controls';
import { font, layout, type } from './tokens';

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const SHORT = [
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

/** „Sa, 17. Okt“ */
export const formatDay = (d: Day) => `${WD[weekday(d)]}, ${dateOf(d)}. ${SHORT[monthOf(d) - 1]}`;
/** „Heute“, „Gestern“ oder „Sa, 17. Okt“ */
export const relativeDay = (d: Day, today: Day) =>
  d === today ? 'Heute' : d === addDays(today, -1) ? 'Gestern' : formatDay(d);
/** „17. jeden Monats“ / „Letzter Tag jeden Monats“ */
export const formatMonthDay = (day: number | null) =>
  day === null
    ? 'ohne festen Tag'
    : day >= 31
      ? 'Letzter Tag jeden Monats'
      : `${day}. jeden Monats`;
/** „1. Januar“ */
export const formatYearDay = (month: number, day: number) => `${day}. ${MONTHS[month - 1]}`;

/** Eine Zelle im 7er-Raster: Button mit Screenreader-Text. */
function Cell({
  label,
  a11y,
  selected,
  marked,
  muted,
  wide,
  onPress,
}: {
  label: string;
  a11y: string;
  selected?: boolean;
  marked?: boolean;
  muted?: boolean;
  wide?: boolean;
  onPress?: () => void;
}) {
  const p = usePalette();
  return (
    <View style={{ width: `${(100 / 7) * (wide ? 3 : 1)}%`, padding: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${a11y}${selected ? ', ausgewählt' : ''}`}
        accessibilityState={{ selected: !!selected, disabled: !onPress }}
        disabled={!onPress}
        onPress={onPress}
        style={{
          height: layout.touchMin - 4,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? p.ink : 'transparent',
          borderWidth: marked && !selected ? 1 : 0,
          borderColor: p.ink3,
        }}
      >
        <Text
          style={[
            wide ? type.small : type.body,
            {
              fontFamily: selected ? font.semibold : font.medium,
              color: selected ? p.bg : muted ? p.ink3 : p.ink,
              fontVariant: ['tabular-nums'],
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: p.surface2,
        borderRadius: 14,
        padding: 6,
      }}
    >
      {children}
    </View>
  );
};

/** Kopfzeile über einem Raster: „EINGANG AM … 17. jeden Monats“. */
function Caption({ left, right }: { left: string; right: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.small, { color: p.ink3, textTransform: 'uppercase' }]}>{left}</Text>
      <Text style={[type.small, { color: p.ink, fontFamily: font.semibold }]}>{right}</Text>
    </View>
  );
}

// ---------- Einzelnes Datum ----------

export function DateField({
  label = 'Datum',
  value,
  today,
  onChange,
}: {
  label?: string;
  value: Day;
  today: Day;
  onChange: (d: Day) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={label}
        value={`${relativeDay(value, today)} ›`}
        onPress={() => setOpen(true)}
      />
      <DateSheet
        open={open}
        value={value}
        today={today}
        title={label}
        onClose={() => setOpen(false)}
        onPick={(d) => {
          onChange(d);
          setOpen(false);
        }}
      />
    </>
  );
}

export function DateSheet({
  open,
  value,
  today,
  title = 'Datum',
  onPick,
  onClose,
}: {
  open: boolean;
  value: Day;
  today: Day;
  title?: string;
  onPick: (d: Day) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [view, setView] = useState<[number, number]>([yearOf(value), monthOf(value)]);
  const [shown, setShown] = useState(false);
  if (open !== shown) {
    setShown(open);
    if (open) setView([yearOf(value), monthOf(value)]);
  }
  const [y, m] = view;
  const first = dayOf(y, m, 1);
  const lead = (weekday(first) + 6) % 7; // Woche beginnt Montag
  const n = daysInMonth(y, m);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Chips>
        <Chip label="Heute" selected={value === today} onPress={() => onPick(today)} />
        <Chip
          label="Gestern"
          selected={value === addDays(today, -1)}
          onPress={() => onPick(addDays(today, -1))}
        />
      </Chips>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vorheriger Monat"
          onPress={() => setView(prevMonth(y, m))}
          style={{
            minWidth: layout.touchMin,
            minHeight: layout.touchMin,
            justifyContent: 'center',
          }}
        >
          <Text style={[type.section, { color: p.ink }]}>‹</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[type.body, { color: p.ink, fontFamily: font.semibold }]}
        >
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nächster Monat"
          onPress={() => setView(nextMonth(y, m))}
          style={{
            minWidth: layout.touchMin,
            minHeight: layout.touchMin,
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          <Text style={[type.section, { color: p.ink }]}>›</Text>
        </Pressable>
      </View>
      <Grid>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <Cell key={w} label={w} a11y={w} muted />
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <Cell key={`l${i}`} label="" a11y="" />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const d = dayOf(y, m, i + 1);
          return (
            <Cell
              key={d}
              label={String(i + 1)}
              a11y={`${i + 1}. ${MONTHS[m - 1]} ${y}`}
              selected={d === value}
              marked={d === today}
              onPress={() => onPick(d)}
            />
          );
        })}
      </Grid>
    </Sheet>
  );
}

// ---------- Tag im Monat ----------

function DayGrid({
  value,
  max = 31,
  lastDay = true,
  monthName,
  onChange,
}: {
  value: number | null;
  max?: number;
  lastDay?: boolean;
  monthName?: string;
  onChange: (d: number) => void;
}) {
  return (
    <Grid>
      {Array.from({ length: max }, (_, i) => (
        <Cell
          key={i}
          label={String(i + 1)}
          a11y={monthName ? `${i + 1}. ${monthName}` : `${i + 1}. jeden Monats`}
          selected={value === i + 1 && !(lastDay && i + 1 === 31)}
          onPress={() => onChange(i + 1)}
        />
      ))}
      {lastDay ? (
        <Cell
          wide
          label="Letzter Tag"
          a11y="Letzter Tag jeden Monats"
          selected={value !== null && value >= 31}
          onPress={() => onChange(31)}
        />
      ) : null}
    </Grid>
  );
}

/** Tag im Monat. Tage nach Monatsende gelten als letzter Tag des Monats (31 = Monatsende). */
export function DayOfMonthPicker({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: number | null;
  onChange: (d: number | null) => void;
  allowNone?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Caption left={label} right={formatMonthDay(value)} />
      <DayGrid value={value} onChange={onChange} />
      {allowNone ? (
        <Chips>
          <Chip label="Ohne festen Tag" selected={value === null} onPress={() => onChange(null)} />
        </Chips>
      ) : null}
    </View>
  );
}

// ---------- Jährlich ----------

/** Monat + Tag, z. B. „1. Januar“. */
export function YearlyPicker({
  label,
  month,
  day,
  onChange,
  allowNone,
}: {
  label: string;
  month: number | null;
  day: number | null;
  onChange: (month: number | null, day: number | null) => void;
  allowNone?: boolean;
}) {
  const m = month ?? 1;
  const max = daysInMonth(2025, m); // kein Schaltjahr: 29. Februar wäre nicht jedes Jahr
  return (
    <View style={{ gap: 8 }}>
      <Caption
        left={label}
        right={month && day ? formatYearDay(month, Math.min(day, max)) : 'nicht gesetzt'}
      />
      <Chips>
        {SHORT.map((name, i) => (
          <Chip
            key={name}
            label={name}
            selected={month === i + 1}
            onPress={() => onChange(i + 1, Math.min(day ?? 1, daysInMonth(2025, i + 1)))}
          />
        ))}
      </Chips>
      {month ? (
        <DayGrid
          value={day}
          max={max}
          lastDay={false}
          monthName={MONTHS[m - 1]}
          onChange={(d) => onChange(m, d)}
        />
      ) : null}
      {allowNone && month ? (
        <Chips>
          <Chip label="Entfernen" onPress={() => onChange(null, null)} />
        </Chips>
      ) : null}
    </View>
  );
}
