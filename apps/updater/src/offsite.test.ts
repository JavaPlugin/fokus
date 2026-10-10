import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Runner, RunOptions } from './exec';
import { createOffsite } from './offsite';

function fake(fail?: string) {
  const calls: { cmd: string; args: string[]; opts?: RunOptions }[] = [];
  const runner: Runner = {
    async run(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      if (cmd === fail) return { code: 1, stdout: '', stderr: 'kaputt' };
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return { runner, calls };
}

describe('Backup außer Haus', () => {
  it('ohne Ziel oder Schlüssel: aus, nichts passiert', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fk-'));
    const f = fake();
    const o = createOffsite({ backupsDir: dir, keepDays: 30 }, f.runner);
    expect(await o.run()).toEqual([]);
    expect(o.status().enabled).toBe(false);
    expect(f.calls).toEqual([]);
  });

  it('verschlüsselt jede neue Sicherung einmal, lädt hoch, räumt am Ziel auf', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fk-'));
    await writeFile(join(dir, 'fokus_2026-10-05_0300.dump'), 'x');
    await writeFile(join(dir, 'manuell_2026-10-05_1200.dump'), 'y');
    await writeFile(join(dir, 'notiz.txt'), 'z');
    const f = fake();
    const cfg = { backupsDir: dir, remote: 'box:fokus/', recipient: 'age1abc', keepDays: 30 };
    const o = createOffsite(cfg, f.runner);
    expect(await o.run()).toEqual(['fokus_2026-10-05_0300.dump', 'manuell_2026-10-05_1200.dump']);
    const age = f.calls.filter((c) => c.cmd === 'age');
    expect(age).toHaveLength(2);
    expect(age[0]!.args.slice(0, 2)).toEqual(['-r', 'age1abc']);
    const copy = f.calls.filter((c) => c.cmd === 'rclone' && c.args[0] === 'copyto');
    expect(copy.map((c) => c.args[2])).toEqual([
      'box:fokus/fokus_2026-10-05_0300.dump.age',
      'box:fokus/manuell_2026-10-05_1200.dump.age',
    ]);
    expect(
      f.calls.some(
        (c) => c.cmd === 'rclone' && c.args.join(' ') === 'delete --min-age 30d box:fokus/',
      ),
    ).toBe(true);
    // Zweiter Lauf: nichts Neues
    expect(await o.run()).toEqual([]);
    expect(JSON.parse(await readFile(join(dir, '.offsite.json'), 'utf8'))).toHaveLength(2);
    expect(o.status()).toMatchObject({ enabled: true, lastError: null });
  });

  it('Fehler beim Hochladen: gemeldet, beim nächsten Mal erneut versucht', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fk-'));
    await writeFile(join(dir, 'fokus_2026-10-05_0300.dump'), 'x');
    const bad = fake('rclone');
    const cfg = { backupsDir: dir, remote: 'box:kb', recipient: 'age1abc', keepDays: 30 };
    const o = createOffsite(cfg, bad.runner);
    expect(await o.run()).toEqual([]);
    expect(o.status().lastError).toMatch(/rclone: kaputt/);
    const ok = fake();
    expect(await createOffsite(cfg, ok.runner).run()).toEqual(['fokus_2026-10-05_0300.dump']);
  });
});
