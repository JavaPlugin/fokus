// Nur Entwicklung: spielt einen Updater nach, damit das Admin-Panel lokal ohne Docker testbar ist.
// Start: pnpm --filter @fokus/updater dev:mock  (API braucht UPDATER_URL=http://localhost:8090)
// MOCK_FAIL=1 lässt das Update scheitern und zurückrollen.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const secret = process.env.UPDATER_SECRET ?? 'dev-updater-secret-dev-updater-secret';
const fail = process.env.MOCK_FAIL === '1';
let current = 'v0.3.0';
let previous: string | null = 'v0.2.0';
const jobs: Record<string, unknown>[] = [
  {
    id: '20261003-210000-install',
    kind: 'install',
    from: 'v0.1.2',
    to: 'v0.2.0',
    status: 'ok',
    step: 'Fertig',
    startedAt: '2026-10-03T21:00:00Z',
    finishedAt: '2026-10-03T21:02:10Z',
  },
];
const releases = [
  {
    version: 'v0.4.0',
    name: 'v0.4.0',
    notes:
      '### Neu\n- feat(web): Redesign aller Screens\n- feat: Konten und CSV-Import\n\n### Behoben\n- fix: Rundung bei Rückzahlungen\n',
    publishedAt: new Date().toISOString(),
    prerelease: false,
    url: 'https://github.com/JavaPlugin/fokus/releases/tag/v0.4.0',
  },
];
const backups = [
  {
    name: 'fokus_2026-10-04_0300.dump',
    size: 182_000,
    createdAt: new Date(Date.now() - 3600_000 * 9).toISOString(),
    kind: 'nightly',
  },
  {
    name: 'vor-update_v0.1.2_v0.2.0_20261003-210000.dump',
    size: 150_000,
    createdAt: '2026-10-03T21:00:00Z',
    kind: 'vor update',
  },
];

const app = new Hono();
app.use('*', async (c, next) => {
  if (c.req.header('authorization') !== `Bearer ${secret}`)
    return c.json({ error: 'Nicht erlaubt.' }, 403);
  await next();
});
const status = () => ({
  current,
  previous,
  lastCheck: new Date(Date.now() - 5 * 60_000).toISOString(),
  available: releases.filter((r) => r.version > current),
  job: jobs[0] ?? null,
  jobs,
  snapshots: true,
});
app.get('/status', (c) => c.json(status()));
app.post('/check', (c) => c.json(status()));
app.get('/system', (c) =>
  c.json({
    version: current,
    diskFreeBytes: 21e9,
    diskTotalBytes: 32e9,
    lastBackup: backups[0]!.createdAt,
    snapshots: true,
  }),
);
app.get('/backups', (c) => c.json(backups));
app.post('/backups', (c) => c.json({ id: 'b' }, 202));
app.get('/jobs/:id/log', (c) =>
  c.text('▸ Release laden\n▸ Images laden\n▸ Signatur prüfen\n= ok\n'),
);
app.post('/install', async (c) => {
  const { version } = (await c.req.json()) as { version: string };
  const job: Record<string, unknown> = {
    id: `${Date.now()}-install`,
    kind: 'install',
    from: current,
    to: version,
    status: 'running',
    step: 'Release laden',
    startedAt: new Date().toISOString(),
  };
  jobs.unshift(job);
  const steps = [
    'Images laden',
    'Signatur prüfen',
    'Wartungsmodus',
    'Datenbank sichern',
    'VM-Snapshot',
    'Neue Version starten',
    'Health-Check',
  ];
  steps.forEach((s, i) => setTimeout(() => (job.step = s), (i + 1) * 1500));
  setTimeout(
    () => {
      if (fail) {
        job.step = `Zurück auf ${current}`;
        setTimeout(() => {
          job.status = 'rolled-back';
          job.error = `${version} meldet sich nicht gesund.`;
        }, 1500);
      } else {
        previous = current;
        current = version;
        job.status = 'ok';
        job.step = 'Fertig';
      }
    },
    (steps.length + 1) * 1500,
  );
  return c.json(job, 202);
});

serve({ fetch: app.fetch, port: 8090 }, () => console.info('Updater-Attrappe auf Port 8090'));
