// Echter TLS-Server mit selbstsigniertem Zertifikat (wie Proxmox), erzeugt mit openssl.
// Prüft, dass die Anfrage über die geprüfte Verbindung auf dem richtigen Port läuft.
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { createProxmox } from './proxmox';

let hasOpenssl = true;
try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' });
} catch {
  hasOpenssl = false;
}

describe.skipIf(!hasOpenssl)('Proxmox-Client', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fk-pve-'));
  let server: https.Server;
  let port = 0;
  let fingerprint = '';
  const seen: { method: string; url: string; auth: string; body: string }[] = [];

  beforeAll(async () => {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=pve',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const cert = readFileSync(join(dir, 'cert.pem'));
    fingerprint = new X509Certificate(cert).fingerprint256;
    server = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert }, (req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        seen.push({
          method: req.method!,
          url: req.url!,
          auth: req.headers.authorization ?? '',
          body,
        });
        res.setHeader('content-type', 'application/json');
        if (req.url!.includes('/tasks/'))
          return res.end(JSON.stringify({ data: { status: 'stopped', exitstatus: 'OK' } }));
        if (req.method === 'GET')
          return res.end(
            JSON.stringify({ data: [{ name: 'fk-alt', snaptime: 1 }, { name: 'current' }] }),
          );
        res.end(JSON.stringify({ data: 'UPID:pve:1' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const client = (fp: string) =>
    createProxmox(
      loadConfig({
        UPDATER_SECRET: 's'.repeat(40),
        FK_IMAGE_PREFIX: 'x',
        GHCR_USER: 'u',
        GHCR_TOKEN: 't',
        PROXMOX_URL: `https://127.0.0.1:${port}`,
        PROXMOX_NODE: 'pve',
        PROXMOX_VMID: '210',
        PROXMOX_TOKEN_ID: 'fokus@pve!updater',
        PROXMOX_TOKEN_SECRET: 'geheim',
        PROXMOX_TLS_FINGERPRINT: fp,
      }),
    );

  it('legt einen Snapshot über die gepinnte Verbindung an', async () => {
    await client(fingerprint).snapshot('fk-v0-3-2', 'Test');
    const post = seen.find((s) => s.method === 'POST')!;
    expect(post.url).toBe('/api2/json/nodes/pve/qemu/210/snapshot');
    expect(post.auth).toBe('PVEAPIToken=fokus@pve!updater=geheim');
    expect(post.body).toContain('snapname=fk-v0-3-2');
    expect(seen.some((s) => s.url.startsWith('/api2/json/nodes/pve/tasks/'))).toBe(true);
  });

  it('räumt nur eigene alte Snapshots auf', async () => {
    seen.length = 0;
    await client(fingerprint).prune(0);
    const del = seen.filter((s) => s.method === 'DELETE').map((s) => s.url);
    expect(del).toEqual(['/api2/json/nodes/pve/qemu/210/snapshot/fk-alt']);
  });

  it('sendet nichts, wenn der Fingerprint nicht passt', async () => {
    seen.length = 0;
    await expect(client('AA:BB').snapshot('fk-x', 'x')).rejects.toThrow('Fingerprint');
    expect(seen).toEqual([]);
  });
});
