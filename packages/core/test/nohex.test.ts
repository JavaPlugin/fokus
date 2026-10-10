// Farbwelt-Regel: Farbwerte stehen nur in theme.ts und tokens.ts, nie in Komponenten.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const ALLOWED = new Set(['packages/ui/src/theme.ts', 'packages/ui/src/tokens.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('Keine Hex-Farben in Komponenten', () => {
  it('apps/web/src und packages/ui/src nutzen nur Tokens', () => {
    const hits: string[] = [];
    let seen = 0;
    for (const dir of ['apps/web/src', 'packages/ui/src']) {
      for (const f of files(join(root, dir))) {
        const rel = relative(root, f).split('\\').join('/');
        if (ALLOWED.has(rel)) continue;
        seen++;
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/['"`(\s:]#[0-9a-fA-F]{3,8}\b/.test(line))
              hits.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(hits).toEqual([]);
  });
});
