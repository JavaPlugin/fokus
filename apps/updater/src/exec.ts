import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Eingabe als Text (z. B. Passwort für docker login). */
  input?: string;
  /** Standardeingabe aus Datei (pg_restore). */
  stdinFile?: string;
  /** Standardausgabe in Datei (pg_dump). */
  stdoutFile?: string;
  timeoutMs?: number;
  /** Umgebung des Prozesses. Ohne Angabe die des Updaters. */
  env?: NodeJS.ProcessEnv;
}

/** Führt Programme aus. Immer mit Argument-Liste, nie über eine Shell. */
export interface Runner {
  run(cmd: string, args: string[], opts?: RunOptions): Promise<RunResult>;
}

export const realRunner: Runner = {
  run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: opts.env ?? process.env,
      });
      let stdout = '';
      let stderr = '';
      const timer = opts.timeoutMs
        ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs)
        : undefined;
      if (opts.stdoutFile) child.stdout.pipe(createWriteStream(opts.stdoutFile));
      else child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      if (opts.stdinFile) createReadStream(opts.stdinFile).pipe(child.stdin);
      else child.stdin.end(opts.input ?? '');
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  },
};

/** Wirft bei Exit-Code ≠ 0 mit der letzten Zeile der Fehlerausgabe. */
export async function must(runner: Runner, cmd: string, args: string[], opts?: RunOptions) {
  const r = await runner.run(cmd, args, opts);
  if (r.code !== 0) {
    const last = (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ');
    throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} … fehlgeschlagen (${r.code}): ${last}`);
  }
  return r;
}
