import { describe, expect, it } from 'vitest';
import { clock, dayInZone } from './dates';
import { parseIcs } from './ics';

const wrap = (...ev: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...ev.flatMap((e) => ['BEGIN:VEVENT', e, 'END:VEVENT']),
    'END:VCALENDAR',
  ].join('\r\n');
const show = (t: string, a = '2026-10-01', b = '2026-10-31') =>
  parseIcs(t, a, b).map((e) => `${dayInZone(e.start)} ${clock(e.start)} ${e.minutes} ${e.title}`);

describe('ICS', () => {
  it('UTC, lokale Zeit mit TZID, Dauer, ganztägig bleibt draußen', () => {
    const t = wrap(
      'UID:a\nDTSTART:20261012T073000Z\nDTEND:20261012T083000Z\nSUMMARY:Zahnarzt',
      'UID:b\nDTSTART;TZID=Europe/Berlin:20261013T140000\nDURATION:PT45M\nSUMMARY:Workshop\\, Teil 1',
      'UID:c\nDTSTART;VALUE=DATE:20261014\nSUMMARY:Urlaub',
      'UID:d\nDTSTART;TZID=America/New_York:20261015T090000\nDTEND;TZID=America/New_York:20261015T100000\nSUMMARY:Call',
    );
    expect(show(t)).toEqual([
      '2026-10-12 09:30 60 Zahnarzt',
      '2026-10-13 14:00 45 Workshop, Teil 1',
      '2026-10-15 15:00 60 Call',
    ]);
  });

  it('entfaltet Zeilen, ignoriert Abgesagtes, nimmt Zeitraum', () => {
    const t = wrap(
      'UID:a\nDTSTART:20261012T070000Z\nDTEND:20261012T080000Z\nSUMMARY:Ein sehr lan\r\n  ger Titel',
      'UID:b\nDTSTART:20261012T090000Z\nDTEND:20261012T100000Z\nSUMMARY:Weg\nSTATUS:CANCELLED',
      'UID:c\nDTSTART:20261120T090000Z\nDTEND:20261120T100000Z\nSUMMARY:Später',
    );
    expect(show(t)).toEqual(['2026-10-12 09:00 60 Ein sehr lan ger Titel']);
  });

  it('Wiederholungen: wöchentlich mit Wochentagen, COUNT, EXDATE, Sommerzeit', () => {
    const t = wrap(
      'UID:w\nDTSTART;TZID=Europe/Berlin:20261005T100000\nDTEND;TZID=Europe/Berlin:20261005T103000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5\nEXDATE;TZID=Europe/Berlin:20261007T100000\nSUMMARY:Daily',
    );
    expect(show(t)).toEqual([
      '2026-10-05 10:00 30 Daily',
      '2026-10-12 10:00 30 Daily',
      '2026-10-14 10:00 30 Daily',
      '2026-10-19 10:00 30 Daily',
    ]);
    // 10:00 Berlin bleibt 10:00 über die Zeitumstellung (25.10.)
    const t2 = wrap(
      'UID:x\nDTSTART;TZID=Europe/Berlin:20261023T100000\nDTEND;TZID=Europe/Berlin:20261023T110000\nRRULE:FREQ=DAILY;COUNT=4\nSUMMARY:Täglich',
    );
    expect(show(t2).map((l) => l.slice(0, 16))).toEqual([
      '2026-10-23 10:00',
      '2026-10-24 10:00',
      '2026-10-25 10:00',
      '2026-10-26 10:00',
    ]);
  });

  it('monatlich, UNTIL und INTERVAL', () => {
    const t = wrap(
      'UID:m\nDTSTART:20260831T080000Z\nDTEND:20260831T090000Z\nRRULE:FREQ=MONTHLY\nSUMMARY:Monat',
      'UID:i\nDTSTART:20261001T080000Z\nDTEND:20261001T090000Z\nRRULE:FREQ=DAILY;INTERVAL=10;UNTIL=20261021T000000Z\nSUMMARY:Zehntel',
    );
    expect(show(t, '2026-09-01', '2026-12-31')).toEqual([
      '2026-10-01 10:00 60 Zehntel',
      '2026-10-11 10:00 60 Zehntel',
      '2026-10-31 10:00 60 Monat',
      '2026-12-31 10:00 60 Monat',
    ]);
  });

  it('kaputte Dateien: nichts', () => {
    expect(parseIcs('quatsch', '2026-10-01', '2026-10-31')).toEqual([]);
    expect(parseIcs(wrap('DTSTART:kaputt\nSUMMARY:x'), '2026-10-01', '2026-10-31')).toEqual([]);
  });
});
