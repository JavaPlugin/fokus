// Persönliche Einstellungen: Fortschritt der Einführung (geräteübergreifend).
import { userSettings, withUser, type Db } from '@fokus/db';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { SessionUser, Vars } from './app';

export function registerSettingsRoutes(app: Hono<Vars>, { db }: { db: Db }) {
  const userOf = (c: { get: (k: 'user') => SessionUser | null }) => c.get('user');

  app.get('/api/onboarding', async (c) => {
    const u = userOf(c);
    if (!u) return c.json({ error: 'Nicht angemeldet.' }, 401);
    const [row] = await withUser(db, u.id, (tx) =>
      tx.select({ o: userSettings.onboarding }).from(userSettings),
    );
    return c.json(row?.o ?? { step: 0, done: false });
  });

  app.put('/api/onboarding', async (c) => {
    const u = userOf(c);
    if (!u) return c.json({ error: 'Nicht angemeldet.' }, 401);
    const b = z
      .object({ step: z.number().int().min(0).max(10), done: z.boolean() })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'Ungültige Eingabe.' }, 400);
    await withUser(db, u.id, (tx) =>
      tx
        .insert(userSettings)
        .values({ userId: u.id, onboarding: b.data })
        .onConflictDoUpdate({ target: userSettings.userId, set: { onboarding: b.data } }),
    );
    return c.json(b.data);
  });
}
