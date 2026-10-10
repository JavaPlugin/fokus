// Uhrzeit wählen (nie Freitext): Zeile mit Wert, öffnet ein Sheet mit Stunden und Minuten.
import { Chip, ListRow, Sheet, Section } from '@fokus/ui';
import { useState } from 'react';
import { View } from 'react-native';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '30', '40', '45', '50'];

export function TimeField({
  label = 'Uhrzeit',
  value,
  onChange,
}: {
  label?: string;
  /** „HH:MM“ */
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':') as [string, string];
  return (
    <>
      <ListRow title={label} value={`${value} ›`} onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <Section title="Stunde">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {HOURS.map((x) => (
              <Chip key={x} label={x} selected={x === h} onPress={() => onChange(`${x}:${m}`)} />
            ))}
          </View>
        </Section>
        <Section title="Minute">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()).map((x) => (
              <Chip key={x} label={x} selected={x === m} onPress={() => onChange(`${h}:${x}`)} />
            ))}
          </View>
        </Section>
      </Sheet>
    </>
  );
}
