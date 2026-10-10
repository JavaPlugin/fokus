import { readFile, rename, writeFile } from 'node:fs/promises';

/** Liest einen Wert aus der .env (einfache KEY=VALUE-Zeilen, optional in Anführungszeichen). */
export async function readEnvValue(file: string, key: string): Promise<string | null> {
  const text = await readFile(file, 'utf8');
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
  if (!m) return null;
  return m[1]!.trim().replace(/^(['"])(.*)\1$/, '$2');
}

/** Setzt Werte in der .env. Alle anderen Zeilen bleiben unverändert. Schreibt atomar. */
export async function setEnvValues(file: string, values: Record<string, string>): Promise<void> {
  let text = await readFile(file, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z0-9_]+$/.test(key) || /[\n'"]/.test(value))
      throw new Error(`Ungültiger Wert für ${key}`);
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text)
      ? text.replace(re, `${key}=${value}`)
      : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
  }
  await writeFile(`${file}.tmp`, text, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}
