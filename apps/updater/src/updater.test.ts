import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import type { Runner, RunOptions } from './exec';
import type { GitHub, Release } from './github';
import type { Proxmox } from './proxmox';
import { createServer } from './server';
import { Busy, Rejected, createUpdater, type Deps } from './updater';

let dir: string;
let calls: { cmd: string; args: string[]; opts?: RunOptions }[];
let cosignOk: boolean;
let healthy: (v: string) => boolean;
/** Version, die das simulierte docker compose zuletzt gestartet hat. */
let running: string;
let snapshots: string[];
let snapshotFails: boolean;
let time: number;

const release = (version: string, prerelease = false): Release => ({
  version,
  name: version,
  notes: '- feat: neu',
  publishedAt: '2026-10-04T10:00:00Z',
  prerelease,
  url: '',
  deployAsset: `https://api.github.com/repos/JavaPlugin/fokus/releases/assets/${version}`,
});

const runner: Runner = {
  async run(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    const ok = { code: 0, stdout: '', stderr: '' };
    if (cmd === 'tar') {
      const target = args[args.indexOf('-C') + 1]!;
      await mkdir(join(target, 'db'), { recursive: true });
      await writeFile(join(target, 'compose.yaml'), 'neu');
      await writeFile(join(target, 'backup.sh'), 'neu');
      await writeFile(join(target, 'db', '10-app-role.sh'), 'neu');
      return ok;
    }
    if (cmd === 'cosign')
      return cosignOk ? ok : { code: 1, stdout: '', stderr: 'no matching signatures' };
    if (args[0] === 'image') return { ...ok, stdout: `${args.at(-1)!.split(':')[0]}@sha256:abc\n` };
    if (args.includes('config'))
      return { ...ok, stdout: 'caddy\napi\ndb\nbackup\ncloudflared\nupdater\n' };
    if (args.includes('pg_dump')) await writeFile(opts!.stdoutFile!, 'DUMP');
    if (args[0] === 'compose' && args.includes('up')) {
      // Wie echtes Compose: Umgebungsvariablen schlagen die .env.
      const env = opts?.env ?? process.env;
      const fromFile = /^FK_VERSION=(.*)$/m.exec(await readFile(join(dir, '.env'), 'utf8'))![1]!;
      running = env.FK_VERSION ?? fromFile;
    }
    return ok;
  },
};

const github: GitHub = {
  listReleases: async () => [
    release('v0.3.0'),
    release('v0.4.0'),
    release('v0.4.1-broken', true),
    release('v0.2.0'),
  ],
  downloadAsset: async (_url, file) => writeFile(file, 'tar'),
};

const proxmox: Proxmox = {
  async snapshot(name) {
    if (snapshotFails) throw new Error('Proxmox nicht erreichbar');
    snapshots.push(name);
  },
  prune: async () => undefined,
};

function make(withProxmox = true) {
  const deps: Deps = {
    cfg: loadConfig({
      UPDATER_SECRET: 's'.repeat(40),
      FK_DIR: dir,
      FK_IMAGE_PREFIX: 'ghcr.io/javaplugin/fokus',
      GHCR_USER: 'JavaPlugin',
      GHCR_TOKEN: 'token',
    }),
    runner,
    github,
    proxmox: withProxmox ? proxmox : null,
    probe: async (v) => healthy(v),
    sleep: async (ms) => void (time += ms),
    now: () => new Date(time),
  };
  return createUpdater(deps);
}

async function settle(u: ReturnType<typeof make>) {
  for (let i = 0; i < 200 && u.isBusy(); i++) await new Promise((r) => setTimeout(r, 5));
  return (await u.status(true)).job!;
}

const env = () => readFile(join(dir, '.env'), 'utf8');
const ran = (pred: (c: (typeof calls)[number]) => boolean) => calls.some(pred);
const compose = (sub: string) => (c: (typeof calls)[number]) =>
  c.args[0] === 'compose' && c.args.includes(sub);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fk-updater-'));
  await mkdir(join(dir, 'db'), { recursive: true });
  await writeFile(join(dir, '.env'), "FK_VERSION=v0.3.0\nSMTP_FROM='FOKUS <a@b.de>'\n");
  await writeFile(join(dir, 'compose.yaml'), 'alt');
  await writeFile(join(dir, 'backup.sh'), 'alt');
  await writeFile(join(dir, 'db', '10-app-role.sh'), 'alt');
  calls = [];
  cosignOk = true;
  running = 'v0.3.0';
  // Gesund ist nur, was wirklich läuft
  healthy = (v) => v === running;
  // Wie im Container: env_file setzt die .env-Werte vom Start als Variablen
  process.env.FK_VERSION = 'v0.3.0';
  snapshots = [];
  snapshotFails = false;
  time = Date.parse('2026-10-04T12:00:00Z');
});
afterEach(async () => {
  delete process.env.FK_VERSION;
  await rm(dir, { recursive: true, force: true });
});

describe('Update installieren', () => {
  it('sichert, prüft, tauscht und startet die neue Version', async () => {
    const u = make();
    await u.install('v0.4.0', false);
    const job = await settle(u);
    expect(job).toMatchObject({ status: 'ok', from: 'v0.3.0', to: 'v0.4.0' });
    expect(await env()).toContain('FK_VERSION=v0.4.0');
    expect(await env()).toContain("SMTP_FROM='FOKUS <a@b.de>'");
    expect(await readFile(join(dir, 'compose.yaml'), 'utf8')).toBe('neu');
    expect(calls.filter((c) => c.cmd === 'cosign')).toHaveLength(3);
    expect(ran(compose('pg_dump'))).toBe(true);
    expect(snapshots).toHaveLength(1);
    expect((await u.status(false)).previous).toBe('v0.3.0');
    expect(existsSync(join(dir, 'maintenance', 'on'))).toBe(false);
    // Updater wird nicht im laufenden Job neu gestartet, sondern per Hilfscontainer
    const up = calls.find(compose('up'))!;
    expect(up.args).not.toContain('updater');
    expect(ran((c) => c.args[0] === 'run' && c.args.includes('--no-deps'))).toBe(true);
    const status = JSON.parse(await readFile(join(dir, 'maintenance', 'status.json'), 'utf8'));
    expect(status).toMatchObject({ state: 'ok', to: 'v0.4.0' });
  });

  it('rollt automatisch zurück, wenn die neue Version nicht gesund wird', async () => {
    healthy = (v) => v !== 'v0.4.0' && v === running;
    const u = make();
    await u.install('v0.4.0', false);
    const job = await settle(u);
    expect(job.status).toBe('rolled-back');
    expect(job.error).toContain('v0.4.0 meldet sich nicht gesund');
    expect(await env()).toContain('FK_VERSION=v0.3.0');
    expect(await readFile(join(dir, 'compose.yaml'), 'utf8')).toBe('alt');
    const dumpCall = calls.find(compose('pg_dump'))!;
    const restoreCall = calls.find(compose('pg_restore'))!;
    expect(restoreCall.opts?.stdinFile).toBe(dumpCall.opts?.stdoutFile);
    expect(ran(compose('dropdb'))).toBe(true);
    expect(existsSync(join(dir, 'maintenance', 'on'))).toBe(false);
    expect((await u.status(false)).previous).toBeNull();
    const log = await u.log(job.id);
    expect(log).toContain('Zurück auf v0.3.0');
  });

  it('lässt die Wartung an, wenn auch der Rollback nicht gesund wird', async () => {
    healthy = () => false;
    const u = make();
    await u.install('v0.4.0', false);
    const job = await settle(u);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('bitte per SSH prüfen');
    expect(existsSync(join(dir, 'maintenance', 'on'))).toBe(true);
  });

  it('bricht bei falscher Signatur ab, ohne etwas anzufassen', async () => {
    cosignOk = false;
    const u = make();
    await u.install('v0.4.0', false);
    const job = await settle(u);
    expect(job.status).toBe('failed');
    expect(job.error).toContain('no matching signatures');
    expect(await env()).toContain('FK_VERSION=v0.3.0');
    expect(ran(compose('pg_dump'))).toBe(false);
    expect(existsSync(join(dir, 'maintenance', 'on'))).toBe(false);
  });

  it('bricht ab, wenn der Snapshot scheitert, bevor etwas getauscht wird', async () => {
    snapshotFails = true;
    const u = make();
    await u.install('v0.4.0', false);
    const job = await settle(u);
    expect(job.status).toBe('failed');
    expect(await env()).toContain('FK_VERSION=v0.3.0');
    expect(ran(compose('up'))).toBe(false);
    expect(existsSync(join(dir, 'maintenance', 'on'))).toBe(false);
  });

  it('funktioniert ohne Proxmox', async () => {
    const u = make(false);
    await u.install('v0.4.0', false);
    expect((await settle(u)).status).toBe('ok');
    expect(snapshots).toEqual([]);
  });

  it('erlaubt nur Upgrades auf bekannte Versionen und Testversionen nur auf Wunsch', async () => {
    const u = make();
    await expect(u.install('v0.2.0', false)).rejects.toBeInstanceOf(Rejected);
    await expect(u.install('v0.3.0', false)).rejects.toBeInstanceOf(Rejected);
    await expect(u.install('v9.9.9', false)).rejects.toThrow('nicht gefunden');
    await expect(u.install('v0.4.1-broken', false)).rejects.toThrow('Testversionen');
    await expect(u.install('v0.4.0; rm -rf /', false)).rejects.toThrow('Ungültige Version');
    expect((await u.status(false)).available.map((r) => r.version)).toEqual(['v0.4.0']);
    expect((await u.status(true)).available.map((r) => r.version)).toEqual([
      'v0.4.1-broken',
      'v0.4.0',
    ]);
  });

  it('startet nie zwei Vorgänge gleichzeitig', async () => {
    const u = make();
    await u.install('v0.4.0', false);
    await expect(u.backupNow()).rejects.toBeInstanceOf(Busy);
    await settle(u);
  });
});

describe('Zurück und Wiederherstellen', () => {
  it('geht nach einem Update auf die vorherige Version zurück, mit Sicherung vorher', async () => {
    const u = make();
    await expect(u.rollback()).rejects.toThrow('keine vorherige Version');
    await u.install('v0.4.0', false);
    await settle(u);
    calls = [];
    await u.rollback();
    const job = await settle(u);
    expect(job).toMatchObject({ status: 'ok', kind: 'rollback', to: 'v0.3.0' });
    expect(await env()).toContain('FK_VERSION=v0.3.0');
    expect(calls.filter(compose('pg_dump'))).toHaveLength(1);
    expect(ran(compose('pg_restore'))).toBe(true);
    expect((await u.status(false)).previous).toBeNull();
  });

  it('spielt nur gültige Backups ein', async () => {
    const u = make();
    await expect(u.restore('../.env')).rejects.toBeInstanceOf(Rejected);
    await expect(u.restore('fehlt.dump')).rejects.toThrow('nicht gefunden');
    await mkdir(join(dir, 'backups'), { recursive: true });
    await writeFile(join(dir, 'backups', 'fokus_2026-10-04_0300.dump'), 'DUMP');
    await u.restore('fokus_2026-10-04_0300.dump');
    expect((await settle(u)).status).toBe('ok');
    expect((await u.listBackups()).map((b) => b.kind)).toContain('nightly');
  });
});

describe('Server', () => {
  it('verlangt das Secret', async () => {
    const app = createServer(make(), 's'.repeat(40));
    expect((await app.request('/status')).status).toBe(403);
    expect(
      (await app.request('/status', { headers: { authorization: 'Bearer falsch' } })).status,
    ).toBe(403);
    const ok = await app.request('/status', {
      headers: { authorization: `Bearer ${'s'.repeat(40)}` },
    });
    expect(ok.status).toBe(200);
    const bad = await app.request('/install', {
      method: 'POST',
      headers: { authorization: `Bearer ${'s'.repeat(40)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ version: 'v0.1.0' }),
    });
    expect(bad.status).toBe(400);
  });
});
