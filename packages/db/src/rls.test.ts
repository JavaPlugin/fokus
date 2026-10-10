import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  apiKey,
  creditEntry,
  createDb,
  notificationLog,
  pushSubscription,
  task,
  timeBlock,
  user,
  userSettings,
  webhook,
  withAdmin,
  withKeyLookup,
  withUser,
} from './index';

async function twoUsers() {
  const h = await createDb('pglite:memory');
  await h.migrate();
  const [a, b] = await h.db
    .insert(user)
    .values([
      { email: 'a@t.de', name: 'A' },
      { email: 'b@t.de', name: 'B' },
    ])
    .returning({ id: user.id });
  return { h, a: a!.id, b: b!.id };
}

describe('Row Level Security', () => {
  it('zeigt jedem Nutzer nur seine Zeilen, auch ohne WHERE', async () => {
    const { h, a, b } = await twoUsers();
    await withUser(h.db, a, (tx) => tx.insert(userSettings).values({ userId: a }));
    await withUser(h.db, b, (tx) => tx.insert(userSettings).values({ userId: b }));
    const seenByA = await withUser(h.db, a, (tx) => tx.select().from(userSettings));
    expect(seenByA.map((s) => s.userId)).toEqual([a]);
    const raw = await withUser(h.db, b, (tx) =>
      tx.execute(sql`select count(*)::int as n from user_settings`),
    );
    const rows = (Array.isArray(raw) ? raw : (raw as { rows: { n: number }[] }).rows) as {
      n: number;
    }[];
    expect(rows[0]!.n).toBe(1);
    await h.close();
  });

  it('verbietet Schreiben in fremde Daten', async () => {
    const { h, a, b } = await twoUsers();
    await expect(
      withUser(h.db, a, (tx) => tx.insert(userSettings).values({ userId: b })),
    ).rejects.toThrow();
    await h.close();
  });

  it('sieht ohne gesetzten Nutzer nichts', async () => {
    const { h, a } = await twoUsers();
    await withUser(h.db, a, (tx) => tx.insert(userSettings).values({ userId: a }));
    const none = await h.db.transaction(async (tx) => {
      await tx.execute(sql`set local role fokus_app`);
      return tx.select().from(userSettings);
    });
    expect(none).toEqual([]);
    await h.close();
  });
});

describe('Push-Abos', () => {
  it('sieht und löscht nur eigene', async () => {
    const { h, a, b } = await twoUsers();
    const sub = { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'x' };
    await withUser(h.db, a, (tx) => tx.insert(pushSubscription).values({ ...sub, userId: a }));
    expect(await withUser(h.db, b, (tx) => tx.select().from(pushSubscription))).toEqual([]);
    await withUser(h.db, b, (tx) => tx.delete(pushSubscription));
    expect(await withUser(h.db, a, (tx) => tx.select().from(pushSubscription))).toHaveLength(1);
    await expect(
      withUser(h.db, b, (tx) => tx.insert(pushSubscription).values({ ...sub, userId: a })),
    ).rejects.toThrow();
    await h.close();
  });
});

describe('Benachrichtigungs-Protokoll', () => {
  it('sieht nur eigene Einträge', async () => {
    const { h, a, b } = await twoUsers();
    await withUser(h.db, a, (tx) => tx.insert(notificationLog).values({ userId: a, key: 'x' }));
    expect(await withUser(h.db, b, (tx) => tx.select().from(notificationLog))).toEqual([]);
    await expect(
      withUser(h.db, b, (tx) => tx.insert(notificationLog).values({ userId: a, key: 'y' })),
    ).rejects.toThrow();
    await h.close();
  });
});

describe('Admin-Kontext', () => {
  it('nur mit withAdmin sind Webhooks aller Nutzer lesbar', async () => {
    const { h, a, b } = await twoUsers();
    await withUser(h.db, a, (tx) =>
      tx
        .insert(webhook)
        .values({ userId: a, url: 'https://x.test', secret: 's', events: ['ping'] }),
    );
    expect(await withUser(h.db, b, (tx) => tx.select().from(webhook))).toEqual([]);
    expect(await withAdmin(h.db, (tx) => tx.select().from(webhook))).toHaveLength(1);
    await h.close();
  });
});

describe('API-Schlüssel', () => {
  it('nur eigene; Nachschlagen per Hash nur im Lookup-Kontext und nur lesen/berühren', async () => {
    const { h, a, b } = await twoUsers();
    await withUser(h.db, a, (tx) =>
      tx.insert(apiKey).values({
        userId: a,
        name: 'Kurzbefehl',
        prefix: 'fk_abc',
        hash: 'h1',
        scopes: ['inbox:create'],
      }),
    );
    expect(await withUser(h.db, b, (tx) => tx.select().from(apiKey))).toEqual([]);
    const found = await withKeyLookup(h.db, (tx) =>
      tx.select({ userId: apiKey.userId }).from(apiKey).where(eq(apiKey.hash, 'h1')),
    );
    expect(found).toEqual([{ userId: a }]);
    await withKeyLookup(h.db, (tx) =>
      tx.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.hash, 'h1')),
    );
    // Löschen und Anlegen gehen im Lookup-Kontext nicht
    await withKeyLookup(h.db, (tx) => tx.delete(apiKey));
    expect(await withUser(h.db, a, (tx) => tx.select().from(apiKey))).toHaveLength(1);
    await expect(
      withKeyLookup(h.db, (tx) =>
        tx.insert(apiKey).values({ userId: b, name: 'x', prefix: 'x', hash: 'h2', scopes: [] }),
      ),
    ).rejects.toThrow();
    await h.close();
  });
});

describe('Jede Tabelle mit Nutzerdaten hat RLS', () => {
  it('user_id → Row Level Security (FORCE), Ausnahmen nur Anmeldedaten', async () => {
    const { h } = await twoUsers();
    const res = await h.db.execute(sql`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force
      from information_schema.columns col
      join pg_class c on c.relname = col.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = col.table_schema
      where col.table_schema = 'public' and col.column_name = 'user_id' and c.relkind = 'r'
      order by 1`);
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as {
      name: string;
      rls: boolean;
      force: boolean;
    }[];
    // Better Auth: Sitzungen, Konten, Passkeys liest nur die Anmeldung (nie die Fach-API)
    const auth = ['account', 'passkey', 'session'];
    const without = rows.filter((r) => !(r.rls && r.force)).map((r) => r.name);
    expect(without).toEqual(auth);
    expect(rows.length).toBeGreaterThanOrEqual(16);
    await h.close();
  });
});

describe('Aufgaben und Zeitblöcke', () => {
  it('jeder sieht nur seine, auch über Verweise nicht', async () => {
    const { h, a, b } = await twoUsers();
    const t = await withUser(h.db, a, (tx) =>
      tx.insert(task).values({ userId: a, title: 'Geheim-A' }).returning({ id: task.id }),
    );
    const taskId = t[0]!.id;
    await withUser(h.db, a, (tx) =>
      tx.insert(timeBlock).values({
        userId: a,
        kind: 'focus',
        startsAt: new Date(),
        minutes: 50,
        taskId,
      }),
    );
    for (const table of [task, timeBlock])
      expect(await withUser(h.db, b, (tx) => tx.select().from(table))).toEqual([]);
    // B kann nichts auf As Aufgabe anlegen oder ändern
    await expect(
      withUser(h.db, b, (tx) =>
        tx.insert(creditEntry).values({ userId: a, minutes: 5, reason: 'focus' }),
      ),
    ).rejects.toThrow();
    const changed = await withUser(h.db, b, (tx) =>
      tx.update(task).set({ title: 'gehackt' }).returning(),
    );
    expect(changed).toEqual([]);
    expect((await withUser(h.db, a, (tx) => tx.select().from(task)))[0]!.title).toBe('Geheim-A');
    await h.close();
  });
});
