// Backup außer Haus (3-2-1): jede neue Sicherung wird mit age verschlüsselt (nur der öffentliche
// Schlüssel liegt auf dem Server) und per rclone an ein Ziel außerhalb der VM kopiert (S3, SFTP …).
// Ziel und Zugang stehen in der .env (OFFSITE_REMOTE, AGE_RECIPIENT, RCLONE_CONFIG_*).
// Dort gilt dieselbe Aufbewahrung wie lokal (OFFSITE_KEEP_DAYS, Standard 30 Tage).
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Runner } from './exec';

export interface OffsiteConfig {
  backupsDir: string;
  remote?: string;
  recipient?: string;
  keepDays: number;
}

export interface OffsiteStatus {
  enabled: boolean;
  lastUpload: string | null;
  lastError: string | null;
}

const DUMP = /^[\w.-]+\.dump$/;

export function createOffsite(cfg: OffsiteConfig, runner: Runner, now = () => new Date()) {
  const marker = join(cfg.backupsDir, '.offsite.json');
  const status: OffsiteStatus = {
    enabled: !!(cfg.remote && cfg.recipient),
    lastUpload: null,
    lastError: null,
  };
  let running = false;

  async function done(): Promise<string[]> {
    try {
      return JSON.parse(await readFile(marker, 'utf8')) as string[];
    } catch {
      return [];
    }
  }

  /** Neue Sicherungen verschlüsseln und hochladen, Altes am Ziel aufräumen. */
  async function run(): Promise<string[]> {
    if (!status.enabled || running) return [];
    running = true;
    const uploaded: string[] = [];
    try {
      const have = new Set(await done());
      const names = (await readdir(cfg.backupsDir)).filter((n) => DUMP.test(n) && !have.has(n));
      const tmpDir = join(cfg.backupsDir, '.offsite-tmp');
      await mkdir(tmpDir, { recursive: true });
      for (const name of names.sort()) {
        const enc = join(tmpDir, `${name}.age`);
        try {
          const a = await runner.run(
            'age',
            ['-r', cfg.recipient!, '-o', enc, join(cfg.backupsDir, name)],
            { timeoutMs: 10 * 60_000 },
          );
          if (a.code !== 0) throw new Error(`age: ${a.stderr.trim()}`);
          const r = await runner.run(
            'rclone',
            ['copyto', enc, `${cfg.remote!.replace(/\/$/, '')}/${name}.age`],
            { timeoutMs: 30 * 60_000 },
          );
          if (r.code !== 0) throw new Error(`rclone: ${r.stderr.trim()}`);
          have.add(name);
          uploaded.push(name);
          status.lastUpload = now().toISOString();
          await writeFile(marker, JSON.stringify([...have]));
        } finally {
          await rm(enc, { force: true });
        }
      }
      // Aufbewahrung am Ziel wie lokal
      const del = await runner.run(
        'rclone',
        ['delete', '--min-age', `${cfg.keepDays}d`, cfg.remote!],
        { timeoutMs: 10 * 60_000 },
      );
      if (del.code !== 0) throw new Error(`rclone delete: ${del.stderr.trim()}`);
      status.lastError = null;
    } catch (e) {
      status.lastError = (e as Error).message.slice(0, 300);
    } finally {
      running = false;
    }
    return uploaded;
  }

  return { run, status: () => ({ ...status }) };
}
