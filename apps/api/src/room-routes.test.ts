import { createDb, focusRoom, type DbHandle } from '@fokus/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import type { Mail } from './mail';
import { purgeRooms } from './room-routes';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite:memory',
  PUBLIC_URL: 'https://fokus.test',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  SETUP_CODE: 'richtiger-code',
});

let h: DbHandle;
let app: ReturnType<typeof createApp>;
let outbox: Mail[];

const req = async <T = never>(method: string, path: string, cookie: string, body?: unknown) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
};
const login = async () => {
  const url = new URL(outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const res = await app.request(url.pathname + url.search, { redirect: 'manual' });
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
};

beforeEach(async () => {
  h = await createDb('pglite:memory');
  await h.migrate();
  outbox = [];
  const mailer = { send: async (m: Mail) => void outbox.push(m) };
  app = createApp({ db: h.db, auth: createAuth(h.db, env, mailer), env, mailer });
});
afterEach(() => h.close());

async function users() {
  await req('POST', '/api/setup/admin', '', {
    code: 'richtiger-code',
    email: 'a@t.de',
    name: 'Anna',
  });
  const a = await login();
  await req('POST', '/api/setup/complete', a, { code: 'richtiger-code' });
  const mk = async (email: string, name: string) => {
    const inv = await req<{ url: string }>('POST', '/api/admin/invites', a, {});
    await req('POST', '/api/invites/accept', '', {
      acceptTerms: true,
      token: new URL(inv.data.url).searchParams.get('token'),
      email,
      name,
    });
    return login();
  };
  return { a, b: await mk('b@t.de', 'Ben'), c: await mk('c@t.de', 'Cleo') };
}

type Snap = {
  id: string;
  status: string;
  isOwner: boolean;
  title: string;
  minutes: number;
  members: { name: string; state: string; me: boolean }[];
  inviteUrl?: string;
};

describe('Fokus-Partner', () => {
  it('einladen, beitreten, Zustand, verlassen, beenden; Fremde sehen nichts', async () => {
    const { a, b, c } = await users();
    const made = await req<Snap>('POST', '/api/rooms', a, { title: 'Angebot', minutes: 50 });
    expect(made.status).toBe(201);
    expect(made.data).toMatchObject({ isOwner: true, status: 'open', minutes: 50 });
    expect(made.data.members.map((m) => m.name)).toEqual(['Anna']);
    const token = new URL(made.data.inviteUrl!).searchParams.get('token')!;
    expect(made.data.inviteUrl).toMatch(/^https:\/\/fokus\.test\/partner\?token=/);

    // Vorschau ohne Anmeldung: nur Name, Titel, Dauer
    const pv = await req<{ ownerName: string; title: string; open: boolean }>(
      'GET',
      `/api/rooms/preview?token=${token}`,
      '',
    );
    expect(pv.data).toEqual({ ownerName: 'Anna', title: 'Angebot', minutes: 50, open: true });
    expect((await req('GET', '/api/rooms/preview?token=falsch', '')).status).toBe(404);

    // Fremde (nicht Mitglied): Raum unsichtbar
    const id = made.data.id;
    expect((await req('GET', `/api/rooms/${id}`, b)).status).toBe(404);
    expect((await req('GET', `/api/rooms/${id}/events`, b)).status).toBe(404);
    expect((await req('POST', `/api/rooms/${id}/state`, b, { state: 'pause' })).status).toBe(404);
    expect((await req('DELETE', `/api/rooms/${id}`, b)).status).toBe(404);
    expect((await req('POST', '/api/rooms/join', b, { token: 'x'.repeat(30) })).status).toBe(404);
    expect((await req('POST', '/api/rooms/join', '', { token })).status).toBe(401);

    // Ben tritt bei: beide sehen beide
    const join = await req<Snap>('POST', '/api/rooms/join', b, { token });
    expect(join.data.members.map((m) => m.name)).toEqual(['Anna', 'Ben']);
    expect(join.data.isOwner).toBe(false);
    const forAnna = (await req<Snap>('GET', `/api/rooms/${id}`, a)).data;
    expect(forAnna.members.map((m) => [m.name, m.me])).toEqual([
      ['Anna', true],
      ['Ben', false],
    ]);
    expect((await req<Snap | null>('GET', '/api/rooms/current', b)).data?.id).toBe(id);
    expect((await req('GET', '/api/rooms/current', c)).data).toBeNull();
    // Cleo ist weiter ausgesperrt
    expect((await req('GET', `/api/rooms/${id}`, c)).status).toBe(404);

    // Zustand wird für alle sichtbar
    expect((await req('POST', `/api/rooms/${id}/state`, b, { state: 'pause' })).status).toBe(204);
    expect((await req<Snap>('GET', `/api/rooms/${id}`, a)).data.members[1]!.state).toBe('pause');
    expect((await req('POST', `/api/rooms/${id}/state`, b, { state: 'kaputt' })).status).toBe(400);

    // Neuer Link ungültigmacht den alten
    const re = await req<{ inviteUrl: string }>('POST', `/api/rooms/${id}/invite`, a);
    expect(re.data.inviteUrl).not.toContain(token);
    expect((await req('GET', `/api/rooms/preview?token=${token}`, '')).status).toBe(404);
    expect((await req('POST', `/api/rooms/${id}/invite`, b)).status).toBe(404);

    // Ben geht, Anna beendet
    expect((await req('POST', `/api/rooms/${id}/leave`, b)).status).toBe(204);
    expect((await req<Snap>('GET', `/api/rooms/${id}`, a)).data.members.map((m) => m.name)).toEqual(
      ['Anna'],
    );
    expect((await req('GET', `/api/rooms/${id}`, b)).status).toBe(404);
    expect((await req('DELETE', `/api/rooms/${id}`, a)).status).toBe(204);
    expect((await req<Snap>('GET', `/api/rooms/${id}`, a)).data.status).toBe('closed');
    expect((await req('GET', '/api/rooms/current', a)).data).toBeNull();
  });

  it('beendete oder abgelaufene Räume: Beitritt gesperrt (410), Aufräumen nach einem Tag; ein offener Raum je Besitzer', async () => {
    const { a, b } = await users();
    const one = await req<Snap>('POST', '/api/rooms', a, {});
    const t1 = new URL(one.data.inviteUrl!).searchParams.get('token')!;
    const two = await req<Snap>('POST', '/api/rooms', a, {});
    expect((await req<Snap>('GET', `/api/rooms/${one.data.id}`, a)).data.status).toBe('closed');
    expect((await req('POST', '/api/rooms/join', b, { token: t1 })).status).toBe(410);
    const t2 = new URL(two.data.inviteUrl!).searchParams.get('token')!;
    // Abgelaufen
    await h.db.update(focusRoom).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await req('POST', '/api/rooms/join', b, { token: t2 })).status).toBe(410);
    expect((await req<Snap>('GET', `/api/rooms/${two.data.id}`, a)).data.status).toBe('closed');
    await h.db.update(focusRoom).set({ expiresAt: new Date(Date.now() - 25 * 3600_000) });
    await purgeRooms(h.db);
    expect(await h.db.select().from(focusRoom)).toEqual([]);
  });

  it('Live-Stand: ein Ereignis beim Verbinden und bei jeder Änderung', async () => {
    const { a, b } = await users();
    const made = await req<Snap>('POST', '/api/rooms', a, {});
    const token = new URL(made.data.inviteUrl!).searchParams.get('token')!;
    await req('POST', '/api/rooms/join', b, { token });
    const res = await app.request(`/api/rooms/${made.data.id}/events`, { headers: { cookie: a } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);
    expect(await read()).toContain('event: update');
    await req('POST', `/api/rooms/${made.data.id}/state`, b, { state: 'pause' });
    expect(await read()).toContain('event: update');
    await reader.cancel();
  });
});
