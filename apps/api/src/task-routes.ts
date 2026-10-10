// Aufgaben und Inbox. Schnell notieren (Inbox), später zur Aufgabe machen und einplanen.
import { inboxItem, task, withUser, type Db } from '@fokus/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { Vars } from './app';
import { keyAuth } from './api-keys';
import { authed, day, parseBody, taskOut, uuid } from './planning';

const title = z.string().trim().min(1, 'Gib einen Titel ein.').max(200);
const minutes = z.number().int().min(1).max(480);
const taskFields = {
  title,
  minutes: minutes.optional(),
  heavy: z.boolean().optional(),
  mini: z.boolean().optional(),
  due: day.nullable().optional(),
  note: z.string().max(2000).optional(),
};

export function registerTaskRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);
  const idOf = (raw: string) => (uuid.safeParse(raw).success ? raw : null);

  // ---------- Aufgaben ----------

  app.get('/api/tasks', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const st = c.req.query('status') ?? 'open';
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .select()
        .from(task)
        .where(st === 'all' ? undefined : eq(task.status, st === 'done' ? 'done' : 'open'))
        .orderBy(desc(task.createdAt)),
    );
    return c.json(rows.map(taskOut));
  });

  app.post('/api/tasks', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, z.object({ id: uuid.optional(), ...taskFields }));
    if (b instanceof Response) return b;
    const row = await withUser(db, u.id, async (tx) => {
      // Mit eigener ID wiederholbar (Offline-Warteschlange): zweiter Aufruf ändert nichts
      const [made] = await tx
        .insert(task)
        .values({
          ...(b.id && { id: b.id }),
          userId: u.id,
          title: b.title,
          minutes: b.minutes ?? (b.mini ? 2 : 25),
          heavy: b.heavy ?? false,
          mini: b.mini ?? false,
          due: b.due ?? null,
          note: b.note ?? '',
        })
        .onConflictDoNothing()
        .returning();
      if (made) return made;
      const [old] = await tx.select().from(task).where(eq(task.id, b.id!));
      return old;
    });
    return c.json(taskOut(row!), 201);
  });

  app.put('/api/tasks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(c, z.object(taskFields).partial());
    if (b instanceof Response) return b;
    const [row] = await withUser(db, u.id, (tx) =>
      tx.update(task).set(b).where(eq(task.id, id)).returning(),
    );
    return row ? c.json(taskOut(row)) : notFound(c);
  });

  app.post('/api/tasks/:id/:state{done|reopen}', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const done = c.req.param('state') === 'done';
    const [row] = await withUser(db, u.id, (tx) =>
      tx
        .update(task)
        .set(done ? { status: 'done', doneAt: new Date() } : { status: 'open', doneAt: null })
        .where(eq(task.id, id))
        .returning(),
    );
    return row ? c.json(taskOut(row)) : notFound(c);
  });

  app.delete('/api/tasks/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx.delete(task).where(eq(task.id, id)).returning({ id: task.id }),
    );
    return rows.length ? c.body(null, 204) : notFound(c);
  });

  // ---------- Inbox ----------

  const inboxOut = (r: typeof inboxItem.$inferSelect) => ({
    id: r.id,
    text: r.text,
    status: r.status,
    taskId: r.taskId,
    createdAt: r.createdAt.toISOString(),
  });

  /** Notiz anlegen (auch für Kurzbefehle): wiederholbar über die ID. */
  async function addNote(userId: string, text: string, id?: string) {
    return withUser(db, userId, async (tx) => {
      const [made] = await tx
        .insert(inboxItem)
        .values({ ...(id && { id }), userId, text })
        .onConflictDoNothing()
        .returning();
      if (made) return made;
      const [old] = await tx.select().from(inboxItem).where(eq(inboxItem.id, id!));
      return old!;
    });
  }

  app.get('/api/inbox', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .select()
        .from(inboxItem)
        .where(eq(inboxItem.status, 'open'))
        .orderBy(asc(inboxItem.createdAt)),
    );
    return c.json(rows.map(inboxOut));
  });

  const noteInput = z.object({
    id: uuid.optional(),
    text: z.string().trim().min(1, 'Schreib etwas auf.').max(500),
  });

  app.post('/api/inbox', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, noteInput);
    if (b instanceof Response) return b;
    return c.json(inboxOut(await addNote(u.id, b.text, b.id)), 201);
  });

  // Kurzbefehl: Notiz per API-Schlüssel (Recht inbox:create)
  app.post('/api/v1/inbox', async (c) => {
    const auth = await keyAuth(db, c, 'inbox:create');
    if (auth instanceof Response) return auth;
    const b = await parseBody(c, z.object({ text: noteInput.shape.text }));
    if (b instanceof Response) return b;
    const note = await addNote(auth.userId, b.text);
    return c.json({ message: 'In der Inbox', id: note.id }, 201);
  });

  /** Notiz wird zur Aufgabe (und verschwindet aus der Inbox). */
  app.post('/api/inbox/:id/plan', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(c, z.object({ ...taskFields, title: title.optional() }));
    if (b instanceof Response) return b;
    const made = await withUser(db, u.id, async (tx) => {
      const [note] = await tx
        .select()
        .from(inboxItem)
        .where(and(eq(inboxItem.id, id), eq(inboxItem.status, 'open')));
      if (!note) return null;
      const [t] = await tx
        .insert(task)
        .values({
          userId: u.id,
          title: b.title ?? note.text.slice(0, 200),
          minutes: b.minutes ?? (b.mini ? 2 : 25),
          heavy: b.heavy ?? false,
          mini: b.mini ?? false,
          due: b.due ?? null,
          note: b.note ?? (b.title ? note.text : ''),
        })
        .returning();
      await tx
        .update(inboxItem)
        .set({ status: 'planned', taskId: t!.id })
        .where(eq(inboxItem.id, id));
      return t!;
    });
    return made ? c.json(taskOut(made), 201) : notFound(c);
  });

  app.delete('/api/inbox/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx.delete(inboxItem).where(eq(inboxItem.id, id)).returning({ id: inboxItem.id }),
    );
    return rows.length ? c.body(null, 204) : notFound(c);
  });
}
