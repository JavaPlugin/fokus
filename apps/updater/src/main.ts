import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig, proxmoxEnabled } from './config';
import { realRunner } from './exec';
import { createGitHub } from './github';
import { createOffsite } from './offsite';
import { createProxmox } from './proxmox';
import { createServer } from './server';
import { createUpdater } from './updater';

const cfg = loadConfig();

const probe = async (version: string) => {
  try {
    const res = await fetch(cfg.HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string; version?: string };
    return body.status === 'ok' && body.version === version;
  } catch {
    return false;
  }
};

const updater = createUpdater({
  cfg,
  runner: realRunner,
  github: createGitHub(cfg.FK_REPO, cfg.GHCR_TOKEN),
  proxmox: proxmoxEnabled(cfg) ? createProxmox(cfg) : null,
  probe,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date(),
});

await updater.recover().catch((e) => console.error('Wiederherstellung nach Neustart:', e));

// Backup außer Haus: stündlich neue Sicherungen verschlüsseln und hochladen
const offsite = createOffsite(
  {
    backupsDir: join(cfg.FK_DIR, 'backups'),
    remote: cfg.OFFSITE_REMOTE || undefined,
    recipient: cfg.AGE_RECIPIENT || undefined,
    keepDays: cfg.OFFSITE_KEEP_DAYS,
  },
  realRunner,
);
const offsiteRun = () =>
  void offsite
    .run()
    .then((names) => names.length && console.info(`Außer Haus gesichert: ${names.join(', ')}`));
offsiteRun();
setInterval(offsiteRun, 60 * 60_000);
const withOffsite = {
  ...updater,
  system: async () => ({ ...(await updater.system()), offsite: offsite.status() }),
};

serve(
  {
    fetch: createServer(withOffsite, cfg.UPDATER_SECRET).fetch,
    port: cfg.PORT,
    hostname: '0.0.0.0',
  },
  (i) =>
    console.info(
      `FOKUS Updater auf Port ${i.port}${proxmoxEnabled(cfg) ? ' (mit Proxmox-Snapshot)' : ''}`,
    ),
);
