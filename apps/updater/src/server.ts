import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { z } from 'zod';
import { Busy, Rejected, type Updater } from './updater';

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Nur intern (Netz „ops“), nur mit Secret. Kennt nur prüfen, installieren, Rollback und Backups. */
export function createServer(u: Updater, secret: string) {
  const app = new Hono();

  app.get('/healthz', (c) => c.text('ok'));

  app.use('*', async (c, next) => {
    const given = (c.req.header('authorization') ?? '').replace(/^Bearer /, '');
    if (!timingSafeEqual(sha(given), sha(secret))) return c.json({ error: 'Nicht erlaubt.' }, 403);
    await next();
  });

  app.onError((e, c) => {
    if (e instanceof Busy) return c.json({ error: e.message }, 409);
    if (e instanceof Rejected) return c.json({ error: e.message }, 400);
    console.error(e);
    return c.json({ error: (e as Error).message }, 500);
  });

  const pre = (v: string | undefined) => v === '1' || v === 'true';

  app.get('/status', async (c) => c.json(await u.status(pre(c.req.query('prerelease')))));
  app.post('/check', async (c) => {
    await u.check(true);
    return c.json(await u.status(pre(c.req.query('prerelease'))));
  });
  app.post('/install', async (c) => {
    const b = z
      .object({ version: z.string(), allowPrerelease: z.boolean().default(false) })
      .parse(await c.req.json());
    return c.json(await u.install(b.version, b.allowPrerelease), 202);
  });
  app.post('/rollback', async (c) => c.json(await u.rollback(), 202));
  app.get('/jobs/:id/log', async (c) => c.text(await u.log(c.req.param('id'))));

  app.get('/system', async (c) => c.json(await u.system()));
  app.get('/backups', async (c) => c.json(await u.listBackups()));
  app.post('/backups', async (c) => c.json(await u.backupNow(), 202));
  app.get('/backups/:name', async (c) => {
    const file = await u.backupPath(c.req.param('name'));
    const size = (await stat(file)).size;
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
    });
  });
  app.post('/backups/:name/restore', async (c) =>
    c.json(await u.restore(c.req.param('name')), 202),
  );

  return app;
}
