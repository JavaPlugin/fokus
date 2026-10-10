// Ablaufsteuerung: Update installieren, zurückrollen, sichern, wiederherstellen.
// Alles, was nach außen wirkt (Docker, GitHub, Proxmox, Health-Check, Zeit), kommt über Deps,
// damit die Abläufe in Tests ohne echte Infrastruktur geprüft werden können.

import {
  appendFile,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from './config';
import { readEnvValue, setEnvValues } from './envfile';
import { must, type Runner } from './exec';
import type { GitHub, Release } from './github';
import type { Proxmox } from './proxmox';
import { compareVersions, isPrerelease, parseVersion } from './semver';

export type JobKind = 'install' | 'rollback' | 'restore' | 'backup';
export type JobStatus = 'running' | 'ok' | 'failed' | 'rolled-back';

export interface Job {
  id: string;
  kind: JobKind;
  from: string;
  to: string;
  status: JobStatus;
  step: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

interface State {
  /** Stand vor dem letzten erfolgreichen Update: dorthin führt „Zurück“. */
  previous: { version: string; dump: string } | null;
  lastCheck: string | null;
  releases: Release[];
  jobs: Job[];
}

export interface Deps {
  cfg: Config;
  runner: Runner;
  github: GitHub;
  proxmox: Proxmox | null;
  /** Eine Abfrage von /health: true, wenn „ok“ und die erwartete Version läuft. */
  probe: (version: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

export class Busy extends Error {}
export class Rejected extends Error {}

/** Dateien aus dem Deploy-Paket, die zu einer Version gehören. */
const DEPLOY_FILES = ['compose.yaml', 'backup.sh', 'db/10-app-role.sh'];
const IMAGES = ['api', 'web', 'updater'] as const;
const BACKUP_RE = /^[\w.-]+\.dump$/;

export function createUpdater(d: Deps) {
  const dir = d.cfg.FK_DIR;
  const p = {
    env: join(dir, '.env'),
    updates: join(dir, 'updates'),
    state: join(dir, 'updates', 'state.json'),
    backups: join(dir, 'backups'),
    maint: join(dir, 'maintenance'),
  };
  let running: Job | null = null;

  // ---------- Zustand ----------

  async function load(): Promise<State> {
    try {
      return JSON.parse(await readFile(p.state, 'utf8')) as State;
    } catch {
      return { previous: null, lastCheck: null, releases: [], jobs: [] };
    }
  }
  async function save(s: State) {
    await mkdir(p.updates, { recursive: true });
    await writeFile(`${p.state}.tmp`, JSON.stringify(s, null, 2));
    await rename(`${p.state}.tmp`, p.state);
  }
  async function saveJob(job: Job) {
    const s = await load();
    s.jobs = [job, ...s.jobs.filter((j) => j.id !== job.id)].slice(0, 50);
    await save(s);
  }

  const current = async () => (await readEnvValue(p.env, 'FK_VERSION')) ?? 'v0.0.0';
  const stamp = () =>
    d.now().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const logFile = (id: string) => join(p.updates, 'logs', `${id}.log`);

  // ---------- Wartungsmodus (Caddy zeigt die Wartungsseite, solange „on“ existiert) ----------

  async function maintenance(on: boolean) {
    await mkdir(p.maint, { recursive: true });
    if (on) await writeFile(join(p.maint, 'on'), '1');
    else await rm(join(p.maint, 'on'), { force: true });
  }
  async function publish(job: Job) {
    await mkdir(p.maint, { recursive: true });
    const pub = {
      kind: job.kind,
      from: job.from,
      to: job.to,
      state: job.status,
      step: job.step,
      updatedAt: d.now().toISOString(),
    };
    await writeFile(join(p.maint, 'status.json'), JSON.stringify(pub));
  }

  // ---------- Docker ----------

  // Compose bevorzugt Umgebungsvariablen vor der .env. Der Updater-Container hat aber alle
  // .env-Werte vom Start als Variablen (env_file), darunter das alte FK_VERSION. Deshalb läuft
  // compose mit sauberer Umgebung und liest Versionen und Secrets nur aus der .env.
  const composeEnv = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '/root',
  };
  const compose = (args: string[], opts?: Parameters<Runner['run']>[2]) =>
    must(
      d.runner,
      'docker',
      ['compose', '--project-directory', dir, '-f', join(dir, 'compose.yaml'), ...args],
      { ...opts, env: composeEnv },
    );
  const image = (svc: string, v: string) => `${d.cfg.FK_IMAGE_PREFIX}-${svc}:${v}`;

  async function login() {
    await must(
      d.runner,
      'docker',
      ['login', 'ghcr.io', '-u', d.cfg.GHCR_USER, '--password-stdin'],
      {
        input: d.cfg.GHCR_TOKEN,
      },
    );
  }

  async function dump(file: string) {
    await mkdir(p.backups, { recursive: true });
    await compose(
      ['exec', '-T', 'db', 'pg_dump', '-U', 'postgres', '-d', 'fokus', '--format=custom'],
      {
        stdoutFile: file,
        timeoutMs: 15 * 60_000,
      },
    );
    if ((await stat(file)).size === 0) throw new Error('Sicherung ist leer.');
  }

  async function restoreDump(file: string) {
    await compose(['stop', 'api']);
    await compose([
      'exec',
      '-T',
      'db',
      'dropdb',
      '-U',
      'postgres',
      '--if-exists',
      '--force',
      'fokus',
    ]);
    await compose(['exec', '-T', 'db', 'createdb', '-U', 'postgres', '-O', 'fokus_app', 'fokus']);
    await compose(
      [
        'exec',
        '-T',
        'db',
        'pg_restore',
        '-U',
        'postgres',
        '-d',
        'fokus',
        '--no-owner',
        '--role=fokus_app',
      ],
      { stdinFile: file, timeoutMs: 15 * 60_000 },
    );
  }

  async function services(): Promise<string[]> {
    const r = await compose(['config', '--services']);
    return r.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'updater');
  }

  /** Innerhalb von 60 s gesund, danach 15 s stabil. */
  async function waitHealthy(version: string): Promise<boolean> {
    const until = d.now().getTime() + 60_000;
    while (d.now().getTime() < until) {
      if (await d.probe(version)) {
        for (let i = 0; i < 5; i++) {
          await d.sleep(3000);
          if (!(await d.probe(version))) return false;
        }
        return true;
      }
      await d.sleep(3000);
    }
    return false;
  }

  async function swapFiles(from: string, to: string, staging: string) {
    const keep = join(p.updates, 'files', from);
    for (const f of DEPLOY_FILES) {
      await mkdir(join(keep, f, '..'), { recursive: true });
      await copyFile(join(dir, f), join(keep, f)).catch(() => undefined);
      await mkdir(join(dir, f, '..'), { recursive: true });
      await copyFile(join(staging, f), join(dir, f));
    }
    await setEnvValues(p.env, { FK_VERSION: to });
  }
  async function restoreFiles(version: string) {
    const keep = join(p.updates, 'files', version);
    for (const f of DEPLOY_FILES)
      await copyFile(join(keep, f), join(dir, f)).catch(() => undefined);
    await setEnvValues(p.env, { FK_VERSION: version });
  }

  // ---------- Job-Rahmen ----------

  async function start(
    kind: JobKind,
    from: string,
    to: string,
    body: (step: (s: string) => Promise<void>, job: Job) => Promise<JobStatus>,
  ) {
    if (running) throw new Busy('Es läuft schon ein Vorgang.');
    const job: Job = {
      id: `${stamp()}-${kind}`,
      kind,
      from,
      to,
      status: 'running',
      step: 'Start',
      startedAt: d.now().toISOString(),
    };
    running = job;
    await mkdir(join(p.updates, 'logs'), { recursive: true });
    const log = (line: string) => appendFile(logFile(job.id), `${d.now().toISOString()} ${line}\n`);
    const step = async (s: string) => {
      job.step = s;
      await log(`▸ ${s}`);
      await saveJob(job);
      await publish(job);
    };
    await saveJob(job);
    void (async () => {
      try {
        job.status = await body(step, job);
      } catch (e) {
        job.status = 'failed';
        job.error = (e as Error).message;
        await log(`✗ ${job.error}`);
      } finally {
        job.finishedAt = d.now().toISOString();
        job.step = job.status === 'ok' ? 'Fertig' : job.step;
        await log(`= ${job.status}`);
        await saveJob(job);
        await publish(job);
        running = null;
      }
    })();
    return job;
  }

  // ---------- Öffentliche Befehle ----------

  async function check(force = false) {
    const s = await load();
    const age = s.lastCheck ? d.now().getTime() - Date.parse(s.lastCheck) : Infinity;
    // Höchstens stündlich automatisch, manuell höchstens jede Minute
    if (age < (force ? 60_000 : 3600_000)) return s;
    s.releases = await d.github.listReleases();
    s.lastCheck = d.now().toISOString();
    await save(s);
    return s;
  }

  async function status(allowPre: boolean) {
    const s = await check(false).catch(() => load());
    const cur = await current();
    const available = s.releases
      .filter((r) => (allowPre || !isPrerelease(r.version)) && compareVersions(r.version, cur) > 0)
      .sort((a, b) => compareVersions(b.version, a.version));
    return {
      current: cur,
      previous: s.previous?.version ?? null,
      lastCheck: s.lastCheck,
      available,
      job: running ?? s.jobs[0] ?? null,
      jobs: s.jobs.slice(0, 20),
      snapshots: !!d.proxmox,
    };
  }

  async function install(version: string, allowPre: boolean) {
    if (!parseVersion(version)) throw new Rejected('Ungültige Version.');
    if (isPrerelease(version) && !allowPre) throw new Rejected('Testversionen sind ausgeschaltet.');
    const cur = await current();
    if (compareVersions(version, cur) <= 0)
      throw new Rejected(`Nur Updates auf neuere Versionen (installiert: ${cur}).`);
    const release = (await check(false)).releases.find((r) => r.version === version);
    if (!release) throw new Rejected(`Release ${version} nicht gefunden.`);

    return start('install', cur, version, async (step, job) => {
      const staging = join(p.updates, 'staging', version);
      await step('Release laden');
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true });
      await d.github.downloadAsset(release.deployAsset, join(staging, 'deploy.tar.gz'));
      await must(d.runner, 'tar', ['-xzf', join(staging, 'deploy.tar.gz'), '-C', staging]);

      await step('Images laden');
      await login();
      for (const svc of IMAGES)
        await must(d.runner, 'docker', ['pull', '-q', image(svc, version)], {
          timeoutMs: 15 * 60_000,
        });

      await step('Signatur prüfen');
      for (const svc of IMAGES) {
        const r = await must(d.runner, 'docker', [
          'image',
          'inspect',
          '--format',
          '{{index .RepoDigests 0}}',
          image(svc, version),
        ]);
        const ref = r.stdout.trim();
        if (!ref.includes('@sha256:')) throw new Error(`Kein Digest für ${svc}.`);
        await must(d.runner, 'cosign', [
          'verify',
          '--key',
          d.cfg.COSIGN_PUB,
          '--insecure-ignore-tlog=true',
          ref,
        ]);
      }

      // Ab hier merkt man das Update in der App.
      await step('Wartungsmodus');
      await maintenance(true);
      let swapped = false;
      const s0 = await load();
      const dumpFile = join(p.backups, `vor-update_${cur}_${version}_${stamp()}.dump`);
      try {
        await step('Datenbank sichern');
        await dump(dumpFile);
        if (d.proxmox) {
          await step('VM-Snapshot');
          await d.proxmox.snapshot(
            `fk-${version.replace(/[^a-z0-9]/gi, '-')}-${stamp()}`,
            `FOKUS vor Update ${cur} → ${version}`,
          );
          await d.proxmox.prune(3).catch(() => undefined);
        }
        await step('Neue Version starten');
        await swapFiles(cur, version, staging);
        swapped = true;
        await compose(['up', '-d', ...(await services())], { timeoutMs: 10 * 60_000 });
        await step('Health-Check');
        if (!(await waitHealthy(version))) throw new Error(`${version} meldet sich nicht gesund.`);
      } catch (e) {
        if (!swapped) {
          await maintenance(false);
          throw e;
        }
        // ---------- Automatischer Rollback ----------
        job.error = (e as Error).message;
        await step(`Zurück auf ${cur}`);
        await restoreFiles(cur);
        await restoreDump(dumpFile);
        await compose(['up', '-d', ...(await services())], { timeoutMs: 10 * 60_000 });
        if (!(await waitHealthy(cur))) {
          // Wartung bleibt an: lieber Wartungsseite als halbe App.
          throw new Error(
            `${job.error} Rollback auf ${cur} ebenfalls nicht gesund, bitte per SSH prüfen.`,
          );
        }
        await maintenance(false);
        const s1 = await load();
        s1.previous = s0.previous;
        await save(s1);
        return 'rolled-back';
      }
      const s1 = await load();
      s1.previous = { version: cur, dump: dumpFile };
      await save(s1);
      await maintenance(false);

      await step('Updater aktualisieren');
      // Ein Hilfscontainer ersetzt den Updater, damit dieser Prozess nicht mitten im Job endet.
      await d.runner
        .run('docker', [
          'run',
          '-d',
          '--rm',
          '--name',
          `fk-updater-swap-${stamp()}`,
          '-v',
          '/var/run/docker.sock:/var/run/docker.sock',
          '-v',
          `${dir}:${dir}`,
          '--entrypoint',
          'docker',
          image('updater', version),
          'compose',
          '--project-directory',
          dir,
          '-f',
          join(dir, 'compose.yaml'),
          'up',
          '-d',
          '--no-deps',
          'updater',
        ])
        .catch(() => undefined);
      return 'ok';
    });
  }

  async function rollback() {
    const s = await load();
    if (!s.previous) throw new Rejected('Es gibt keine vorherige Version.');
    const prev = s.previous;
    await stat(prev.dump).catch(() => {
      throw new Rejected(
        'Die Sicherung vom letzten Update ist nicht mehr da (älter als 30 Tage?).',
      );
    });
    const cur = await current();
    return start('rollback', cur, prev.version, async (step) => {
      await step('Wartungsmodus');
      await maintenance(true);
      await step('Aktuellen Stand sichern');
      await dump(join(p.backups, `vor-rollback_${cur}_${stamp()}.dump`));
      await step(`Zurück auf ${prev.version}`);
      await restoreFiles(prev.version);
      await restoreDump(prev.dump);
      await compose(['up', '-d', ...(await services())], { timeoutMs: 10 * 60_000 });
      await step('Health-Check');
      if (!(await waitHealthy(prev.version)))
        throw new Error(`${prev.version} meldet sich nicht gesund. Wartung bleibt an.`);
      await maintenance(false);
      const s1 = await load();
      s1.previous = null;
      await save(s1);
      return 'ok';
    });
  }

  async function backupNow() {
    const cur = await current();
    return start('backup', cur, cur, async (step) => {
      await step('Datenbank sichern');
      await dump(join(p.backups, `manuell_${stamp()}.dump`));
      return 'ok';
    });
  }

  async function restore(name: string) {
    if (!BACKUP_RE.test(name)) throw new Rejected('Ungültiger Dateiname.');
    const file = join(p.backups, name);
    await stat(file).catch(() => {
      throw new Rejected('Backup nicht gefunden.');
    });
    const cur = await current();
    return start('restore', cur, cur, async (step) => {
      await step('Wartungsmodus');
      await maintenance(true);
      await step('Aktuellen Stand sichern');
      await dump(join(p.backups, `vor-wiederherstellung_${stamp()}.dump`));
      await step(`${name} einspielen`);
      await restoreDump(file);
      await compose(['up', '-d', 'api']);
      await step('Health-Check');
      if (!(await waitHealthy(cur)))
        throw new Error('Die App meldet sich nach dem Einspielen nicht gesund. Wartung bleibt an.');
      await maintenance(false);
      return 'ok';
    });
  }

  async function listBackups() {
    await mkdir(p.backups, { recursive: true });
    const out = [];
    for (const name of await readdir(p.backups)) {
      if (!BACKUP_RE.test(name)) continue;
      const st = await stat(join(p.backups, name));
      const kind = name.startsWith('fokus_') ? 'nightly' : name.split('_')[0]!.replace(/-/g, ' ');
      out.push({ name, size: st.size, createdAt: st.mtime.toISOString(), kind });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function backupPath(name: string) {
    if (!BACKUP_RE.test(name)) throw new Rejected('Ungültiger Dateiname.');
    const file = join(p.backups, name);
    await stat(file);
    return file;
  }

  async function system() {
    const fs = await statfs(dir);
    const backups = await listBackups();
    return {
      version: await current(),
      diskFreeBytes: fs.bavail * fs.bsize,
      diskTotalBytes: fs.blocks * fs.bsize,
      lastBackup: backups[0]?.createdAt ?? null,
      snapshots: !!d.proxmox,
    };
  }

  async function log(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new Rejected('Ungültige ID.');
    return readFile(logFile(id), 'utf8').catch(() => '');
  }

  /** Nach einem Absturz: hängende Jobs als abgebrochen markieren, Wartung beenden, wenn alles läuft. */
  async function recover() {
    const s = await load();
    let changed = false;
    for (const j of s.jobs) {
      if (j.status === 'running') {
        j.status = 'failed';
        j.error = 'Abgebrochen (Updater wurde neu gestartet).';
        j.finishedAt = d.now().toISOString();
        changed = true;
      }
    }
    if (changed) await save(s);
    if (await d.probe(await current())) await maintenance(false);
  }

  return {
    status,
    check,
    install,
    rollback,
    backupNow,
    restore,
    listBackups,
    backupPath,
    system,
    log,
    recover,
    isBusy: () => !!running,
  };
}

export type Updater = ReturnType<typeof createUpdater>;
