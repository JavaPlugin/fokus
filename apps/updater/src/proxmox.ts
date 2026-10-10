// Snapshot der FOKUS-VM über die Proxmox-API.
// Proxmox nutzt meist ein selbstsigniertes Zertifikat. Statt die Prüfung abzuschalten,
// wird das Zertifikat per SHA-256-Fingerprint festgenagelt: Erst wenn er stimmt,
// geht die Anfrage mit dem Token raus.

import https from 'node:https';
import { isIP } from 'node:net';
import tls from 'node:tls';
import type { Config } from './config';

export interface Proxmox {
  snapshot(name: string, description: string): Promise<void>;
  /** Löscht ältere FOKUS-Snapshots, die neuesten `keep` bleiben. */
  prune(keep: number): Promise<void>;
}

const norm = (fp: string) => fp.replace(/[^a-f0-9]/gi, '').toUpperCase();

export function createProxmox(c: Config): Proxmox {
  const base = new URL(c.PROXMOX_URL!);
  // Proxmox lauscht standardmäßig auf 8006, auch wenn die Adresse ohne Port angegeben ist.
  const port = +(base.port || 8006);
  const node = `/api2/json/nodes/${encodeURIComponent(c.PROXMOX_NODE!)}`;
  const vm = `${node}/qemu/${c.PROXMOX_VMID}`;
  const auth = `PVEAPIToken=${c.PROXMOX_TOKEN_ID}=${c.PROXMOX_TOKEN_SECRET}`;

  async function call<T>(
    method: string,
    fullPath: string,
    body?: Record<string, string>,
  ): Promise<T> {
    const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect(
        {
          host: base.hostname,
          port,
          // Bei einer IP-Adresse ist kein SNI-Name erlaubt (Node 25)
          servername: isIP(base.hostname) ? undefined : base.hostname,
          rejectUnauthorized: false,
        },
        () => {
          const fp = s.getPeerCertificate().fingerprint256 ?? '';
          if (norm(fp) !== norm(c.PROXMOX_TLS_FINGERPRINT!)) {
            s.destroy();
            reject(new Error('Proxmox-Zertifikat passt nicht zum hinterlegten Fingerprint.'));
          } else resolve(s);
        },
      );
      s.on('error', reject);
    });
    const payload = body ? new URLSearchParams(body).toString() : undefined;
    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        {
          host: base.hostname,
          port,
          path: fullPath,
          method,
          // Kein agent: nur dann nutzt Node die oben geprüfte Verbindung (mit agent: false
          // würde es eine neue, ungeprüfte aufbauen).
          createConnection: () => socket,
          headers: {
            Authorization: auth,
            ...(payload && {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(payload),
            }),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 300)
              reject(
                // Proxmox nennt den Grund in der Statuszeile, z. B. „Permission check failed (/vms/1015, VM.Snapshot)“
                new Error(
                  `Proxmox: ${res.statusCode} ${res.statusMessage ?? ''} ${data.slice(0, 200)}`.trim(),
                ),
              );
            else resolve((JSON.parse(data || '{}') as { data: T }).data);
          });
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  }

  async function waitTask(upid: string) {
    for (let i = 0; i < 120; i++) {
      const status = await call<{ status: string; exitstatus?: string }>(
        'GET',
        `${node}/tasks/${encodeURIComponent(upid)}/status`,
      );
      if (status.status === 'stopped') {
        if (status.exitstatus !== 'OK')
          throw new Error(`Proxmox-Aufgabe fehlgeschlagen: ${status.exitstatus}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Proxmox-Snapshot dauert zu lange.');
  }

  return {
    async snapshot(name, description) {
      const upid = await call<string>('POST', `${vm}/snapshot`, {
        snapname: name,
        description,
        vmstate: '0',
      });
      await waitTask(upid);
    },
    async prune(keep) {
      const list = await call<{ name: string; snaptime?: number }[]>('GET', `${vm}/snapshot`);
      const ours = list
        .filter((s) => s.name.startsWith('fk-'))
        .sort((a, b) => (b.snaptime ?? 0) - (a.snaptime ?? 0));
      for (const s of ours.slice(keep)) {
        const upid = await call<string>('DELETE', `${vm}/snapshot/${encodeURIComponent(s.name)}`);
        await waitTask(upid);
      }
    },
  };
}
