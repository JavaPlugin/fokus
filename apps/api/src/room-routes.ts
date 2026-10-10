// Fokus-Partner: gemeinsam einen Fokus-Block starten, live sichtbar. Einladung per Link, Live-Stand
// per SSE (Server-Sent Events, im Speicher, ein API-Prozess). Andere sehen nur Namen und Zustand
// (Fokus oder Pause), keine Aufgaben und keinen Plan.
import { createHash, randomBytes } from 'node:crypto';
import { focusRoom, focusRoomMember, user, withAdmin, withUser, type Db } from '@fokus/db';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { Vars } from './app';
import { authed, parseBody, uuid } from './planning';

const ROOM_HOURS = 3;
const MAX_MEMBERS = 8;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Wer gerade zuhört (Raum → Rückrufe). Nur im Speicher. */
const listeners = new Map<string, Set<() => void>>();
export function notifyRoom(roomId: string) {
  for (const fn of listeners.get(roomId) ?? []) fn();
}

type Room = typeof focusRoom.$inferSelect;
const isOpen = (r: Room) => r.status === 'open' && r.expiresAt.getTime() > Date.now();

/** Alte Räume aufräumen (täglicher Job). */
export async function purgeRooms(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 3600_000);
  await withAdmin(db, (tx) => tx.delete(focusRoom).where(lt(focusRoom.expiresAt, cutoff)));
}

export function registerRoomRoutes(
  app: Hono<Vars>,
  { db, publicUrl }: { db: Db; publicUrl: string },
) {
  const notFound = (c: Parameters<typeof authed>[0]) => c.json({ error: 'Nicht gefunden.' }, 404);
  const idOf = (raw: string) => (uuid.safeParse(raw).success ? raw : null);
  const url = (token: string) => `${publicUrl}/partner?token=${token}`;

  /** Gemeinsamer Blick auf einen Raum, nur für Mitglieder (sonst null). */
  async function snapshot(roomId: string, userId: string) {
    const mine = await withUser(db, userId, (tx) =>
      tx
        .select()
        .from(focusRoomMember)
        .where(and(eq(focusRoomMember.roomId, roomId), isNull(focusRoomMember.leftAt))),
    );
    if (!mine.length) return null;
    return withAdmin(db, async (tx) => {
      const [room] = await tx.select().from(focusRoom).where(eq(focusRoom.id, roomId));
      if (!room) return null;
      const members = await tx
        .select()
        .from(focusRoomMember)
        .where(and(eq(focusRoomMember.roomId, roomId), isNull(focusRoomMember.leftAt)))
        .orderBy(asc(focusRoomMember.joinedAt));
      return {
        room,
        members,
      };
    }).then(async (x) => {
      if (!x) return null;
      const { room, members } = x;
      // Name des Besitzers aus der Nutzertabelle (nicht Teil des Fachdaten-Zugriffs)
      const [owner] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, room.userId));
      return {
        id: room.id,
        title: room.title,
        minutes: room.minutes,
        status: isOpen(room) ? ('open' as const) : ('closed' as const),
        ownerName: owner?.name ?? '',
        isOwner: room.userId === userId,
        startedAt: room.createdAt.toISOString(),
        members: members.map((m) => ({
          name: m.name,
          state: m.state,
          joinedAt: m.joinedAt.toISOString(),
          me: m.userId === userId,
        })),
      };
    });
  }

  async function create(userId: string, name: string, title: string, minutes: number) {
    const token = randomBytes(24).toString('base64url');
    const room = await withUser(db, userId, async (tx) => {
      // Ein eigener offener Raum zurzeit: den alten schließen
      await tx.update(focusRoom).set({ status: 'closed' }).where(eq(focusRoom.status, 'open'));
      const [r] = await tx
        .insert(focusRoom)
        .values({
          userId,
          title,
          minutes,
          inviteHash: hashToken(token),
          expiresAt: new Date(Date.now() + ROOM_HOURS * 3600_000),
        })
        .returning();
      await tx.insert(focusRoomMember).values({ userId, roomId: r!.id, name });
      return r!;
    });
    return { room, token };
  }

  app.post('/api/rooms', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(
      c,
      z.object({
        title: z.string().trim().max(200).default(''),
        minutes: z.number().int().min(5).max(240).default(50),
      }),
    );
    if (b instanceof Response) return b;
    const { room, token } = await create(u.id, u.name, b.title, b.minutes);
    return c.json({ ...(await snapshot(room.id, u.id)), inviteUrl: url(token) }, 201);
  });

  /** Neuer Einladungslink (der alte gilt danach nicht mehr), nur für den Besitzer. */
  app.post('/api/rooms/:id/invite', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const token = randomBytes(24).toString('base64url');
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .update(focusRoom)
        .set({ inviteHash: hashToken(token) })
        .where(and(eq(focusRoom.id, id), eq(focusRoom.status, 'open')))
        .returning({ id: focusRoom.id }),
    );
    return rows.length ? c.json({ inviteUrl: url(token) }) : notFound(c);
  });

  /** Vorschau für den Einladungslink, auch ohne Anmeldung: nur Name, Titel und Dauer. */
  app.get('/api/rooms/preview', async (c) => {
    const token = c.req.query('token') ?? '';
    if (token.length < 20) return notFound(c);
    const [r] = await withAdmin(db, (tx) =>
      tx
        .select()
        .from(focusRoom)
        .where(eq(focusRoom.inviteHash, hashToken(token))),
    );
    if (!r) return notFound(c);
    const [o] = await db.select({ name: user.name }).from(user).where(eq(user.id, r.userId));
    return c.json({
      ownerName: o?.name ?? '',
      title: r.title,
      minutes: r.minutes,
      open: isOpen(r),
    });
  });

  app.post('/api/rooms/join', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const b = await parseBody(c, z.object({ token: z.string().min(20).max(100) }));
    if (b instanceof Response) return b;
    const res = await withAdmin(db, async (tx) => {
      const [r] = await tx
        .select()
        .from(focusRoom)
        .where(eq(focusRoom.inviteHash, hashToken(b.token)));
      if (!r) return { status: 404 as const };
      if (!isOpen(r)) return { status: 410 as const };
      const members = await tx
        .select()
        .from(focusRoomMember)
        .where(and(eq(focusRoomMember.roomId, r.id), isNull(focusRoomMember.leftAt)));
      if (members.length >= MAX_MEMBERS && !members.some((m) => m.userId === u.id))
        return { status: 409 as const };
      return { status: 200 as const, room: r };
    });
    if (res.status === 404) return notFound(c);
    if (res.status === 410) return c.json({ error: 'Dieser Fokus-Block ist schon vorbei.' }, 410);
    if (res.status === 409) return c.json({ error: 'Der Raum ist voll.' }, 409);
    await withUser(db, u.id, (tx) =>
      tx
        .insert(focusRoomMember)
        .values({ userId: u.id, roomId: res.room.id, name: u.name })
        .onConflictDoUpdate({
          target: [focusRoomMember.userId, focusRoomMember.roomId],
          set: { leftAt: null, state: 'focus', name: u.name },
        }),
    );
    notifyRoom(res.room.id);
    return c.json(await snapshot(res.room.id, u.id));
  });

  /** Mein aktueller Raum (zuletzt beigetreten, noch offen), oder null. */
  app.get('/api/rooms/current', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const mine = await withUser(db, u.id, (tx) =>
      tx
        .select()
        .from(focusRoomMember)
        .where(isNull(focusRoomMember.leftAt))
        .orderBy(asc(focusRoomMember.joinedAt)),
    );
    for (const m of mine.reverse()) {
      const snap = await snapshot(m.roomId, u.id);
      if (snap?.status === 'open') return c.json(snap);
    }
    return c.json(null);
  });

  app.get('/api/rooms/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const s = await snapshot(id, u.id);
    return s ? c.json(s) : notFound(c);
  });

  // Live: bei jeder Änderung ein „update“, die App holt dann den Stand
  app.get('/api/rooms/:id/events', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id || !(await snapshot(id, u.id))) return notFound(c);
    return streamSSE(c, async (stream) => {
      let alive = true;
      const poke = () =>
        void stream.writeSSE({ event: 'update', data: '1' }).catch(() => (alive = false));
      const set = listeners.get(id) ?? new Set();
      listeners.set(id, set);
      set.add(poke);
      stream.onAbort(() => {
        alive = false;
        set.delete(poke);
        if (!set.size) listeners.delete(id);
      });
      await stream.writeSSE({ event: 'update', data: '1' });
      while (alive) {
        await stream.sleep(25_000);
        if (alive) await stream.writeSSE({ event: 'ping', data: '1' }).catch(() => (alive = false));
      }
    });
  });

  app.post('/api/rooms/:id/state', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const b = await parseBody(c, z.object({ state: z.enum(['focus', 'pause']) }));
    if (b instanceof Response) return b;
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .update(focusRoomMember)
        .set({ state: b.state })
        .where(and(eq(focusRoomMember.roomId, id), isNull(focusRoomMember.leftAt)))
        .returning({ id: focusRoomMember.roomId }),
    );
    if (!rows.length) return notFound(c);
    notifyRoom(id);
    return c.body(null, 204);
  });

  app.post('/api/rooms/:id/leave', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .update(focusRoomMember)
        .set({ leftAt: new Date() })
        .where(and(eq(focusRoomMember.roomId, id), isNull(focusRoomMember.leftAt)))
        .returning({ id: focusRoomMember.roomId }),
    );
    if (!rows.length) return notFound(c);
    notifyRoom(id);
    return c.body(null, 204);
  });

  /** Besitzer beendet den Raum für alle. */
  app.delete('/api/rooms/:id', async (c) => {
    const u = authed(c);
    if (u instanceof Response) return u;
    const id = idOf(c.req.param('id'));
    if (!id) return notFound(c);
    const rows = await withUser(db, u.id, (tx) =>
      tx
        .update(focusRoom)
        .set({ status: 'closed' })
        .where(eq(focusRoom.id, id))
        .returning({ id: focusRoom.id }),
    );
    if (!rows.length) return notFound(c);
    notifyRoom(id);
    return c.body(null, 204);
  });
}
