import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createDb } from '@fokus/db';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';
import { createMailer } from './mail';

const env = loadEnv();

if (env.DATABASE_URL.startsWith('pglite:./')) {
  mkdirSync(env.DATABASE_URL.slice('pglite:'.length), { recursive: true });
}

const handle = await createDb(env.DATABASE_URL);
await handle.migrate();

const mailer = createMailer(env);
const auth = createAuth(handle.db, env, mailer);
const app = createApp({ db: handle.db, auth, env, mailer, jobs: true });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.info(`FOKUS API ${env.FK_VERSION} auf Port ${info.port}`);
});

const shutdown = () => {
  server.close();
  void handle.close().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
