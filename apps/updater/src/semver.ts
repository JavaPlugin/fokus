// Versionen der Form v1.2.3 oder v1.2.3-test.1. Alles andere wird abgelehnt,
// damit nie ein beliebiger Text in einen Befehl gelangt.

export const VERSION_RE = /^v(\d{1,4})\.(\d{1,4})\.(\d{1,6})(?:-([a-z0-9]+(?:\.[a-z0-9]+)*))?$/;

export interface Version {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export function parseVersion(raw: string): Version | null {
  const m = VERSION_RE.exec(raw);
  if (!m) return null;
  return { raw, major: +m[1]!, minor: +m[2]!, patch: +m[3]!, pre: m[4] ? m[4].split('.') : [] };
}

export const isPrerelease = (raw: string) => (parseVersion(raw)?.pre.length ?? 0) > 0;

/** Semver-Vergleich: < 0 wenn a älter als b. Vorabversionen sind älter als die fertige Version. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`Ungültige Version: ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] - y[k];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return +p - +q;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
