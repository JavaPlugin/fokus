import { instant } from '@fokus/core';
import { createDb, creditEntry, focusSession, timeBlock, user, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Mail } from './mail';
import { createNotifier } from './notify';
import { createPush } from './push';
import { createReminders } from './reminders';

let h: DbHandle;
let a: string;
let outbox: Mail[];
let pushed: string[];

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  pushed = [];
  [{ id: a }] = (await h.db
    .insert(user)
    .values({ email: 'a@t.de', name: 'A' })
    .returning({ id: user.id })) as [{ id: string }];
});
afterEach(() => h.close());

function setup() {
  const push = createPush(
    h.db,
    'https://fokus.test',
    async (_s, payload) => void pushed.push(payload),
  );
  const notifier = createNotifier({
    db: h.db,
    mailer: { send: async (m) => void outbox.push(m) },
    push,
    publicUrl: 'https://fokus.test',
  });
  return { notifier, r: createReminders({ db: h.db, notifier, publicUrl: 'https://fokus.test' }) };
}
const DAY = '2026-10-12';

describe('Erinnerungen', () => {
  it('kurz vor Fokus-Block und Social-Slot, einmal je Block, nicht davor oder danach', async () => {
    const { notifier, r } = setup();
    await h.db.insert(timeBlock).values([
      {
        userId: a,
        kind: 'focus',
        startsAt: new Date(instant(DAY, '10:00')),
        minutes: 50,
        title: 'Angebot',
      },
      { userId: a, kind: 'social', startsAt: new Date(instant(DAY, '18:00')), minutes: 20 },
      { userId: a, kind: 'pause', startsAt: new Date(instant(DAY, '10:50')), minutes: 10 },
    ]);
    // E-Mail statt Push, damit die Mail zu sehen ist
    await notifier.send(a, 'test', {
      push: { title: 'x', body: 'x', url: '/' },
      mail: () => ({ to: 'x', subject: 'x', text: 'x' }),
    });
    outbox = [];
    pushed = [];
    await h.db.insert((await import('@fokus/db')).userSettings).values({
      userId: a,
      notify: { channel: 'email', focus: true, social: false, recap: true },
    });
    expect((await r.tick(new Date(instant(DAY, '09:40')))).blocks).toBe(0);
    expect((await r.tick(new Date(instant(DAY, '09:56')))).blocks).toBe(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.subject).toContain('Angebot');
    expect(outbox[0]!.subject).toContain('10:00');
    // gleiche Minute noch einmal und später: nichts doppelt
    expect((await r.tick(new Date(instant(DAY, '09:57')))).blocks).toBe(0);
    expect((await r.tick(new Date(instant(DAY, '10:30')))).blocks).toBe(0);
    // Social ist aus: keine Mail, auch nicht kurz vor 18:00
    expect((await r.tick(new Date(instant(DAY, '17:56')))).blocks).toBe(0);
    expect(outbox).toHaveLength(1);
  });

  it('Tagesrückblick ab 20 Uhr, einmal, nur mit Aktivität', async () => {
    const { r } = setup();
    expect((await r.tick(new Date(instant(DAY, '20:30')))).recaps).toBe(0);
    await h.db.insert(focusSession).values({
      userId: a,
      startedAt: new Date(instant(DAY, '10:00')),
      endedAt: new Date(instant(DAY, '10:50')),
      plannedMinutes: 50,
      focusedMinutes: 50,
      status: 'done',
    });
    await h.db.insert(creditEntry).values([
      { userId: a, at: new Date(instant(DAY, '10:50')), minutes: 12, reason: 'focus' },
      { userId: a, at: new Date(instant(DAY, '18:00')), minutes: -20, reason: 'social' },
    ]);
    await h.db.insert((await import('@fokus/db')).userSettings).values({
      userId: a,
      notify: { channel: 'both', focus: true, social: true, recap: true },
    });
    expect((await r.tick(new Date(instant(DAY, '19:30')))).recaps).toBe(0);
    expect((await r.tick(new Date(instant(DAY, '20:30')))).recaps).toBe(1);
    expect(outbox[0]!.subject).toBe('Heute: 50 Min. Fokus');
    expect(outbox[0]!.text).toContain('47 Min.'); // 67 Basis − 20 Social
    expect((await r.tick(new Date(instant(DAY, '21:30')))).recaps).toBe(0);
  });
});
