import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * In Produktion liefert Caddy App und API unter derselben Adresse aus.
 * In der Entwicklung zeigt EXPO_PUBLIC_API_URL auf die API (http://localhost:3000).
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

export const authClient = createAuthClient({
  baseURL: API_BASE,
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
  plugins: [magicLinkClient(), passkeyClient(), adminClient()],
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Sitzung abgelaufen (401, nachdem es schon eine gab): lib/session.ts räumt auf und meldet ab.
let hadSession = false;
let unauthorized: (() => void) | null = null;
export const onUnauthorized = (fn: () => void) => void (unauthorized = fn);

export async function api<T = void>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      // Löschen soll auch beim Verlassen der Seite ankommen (Rückgängig-Toast, pagehide)
      keepalive: init.method === 'DELETE',
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung. Prüfe dein Netz.');
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    // Während Updates und Wiederherstellungen liefert Caddy die Wartungsseite (503, HTML).
    if (res.status === 503 && !b)
      throw new ApiError(503, 'FOKUS wird gerade gewartet. Gleich wieder da.');
    if (res.status === 401 && hadSession) unauthorized?.();
    throw new ApiError(res.status, b?.error ?? 'Da ist etwas schiefgelaufen.');
  }
  if (path === '/api/me') hadSession = true;
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export type Me = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  /** Registriert am (ISO). */
  createdAt?: string;
  version?: string;
};
export type SetupStatus = {
  setupCompleted: boolean;
  publicUrl: string;
  hostMatches: boolean;
  https: boolean;
  registrationMode: 'invite' | 'open';
  legal: Legal;
  signedIn?: boolean;
};
export type Legal = { name: string; address: string; email: string };

/** Ermittelt, wohin die App beim Start gehört: Einrichtung, Anmeldung oder Inhalt. */
export async function bootState(): Promise<
  { kind: 'setup' } | { kind: 'login' } | { kind: 'ready'; me: Me }
> {
  const status = await api<SetupStatus>('/api/setup/status');
  if (!status.setupCompleted) return { kind: 'setup' };
  try {
    return { kind: 'ready', me: await api<Me>('/api/me') };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: 'login' };
    throw e;
  }
}

// ---------- Admin-Panel ----------

export type JobStatus = 'running' | 'ok' | 'failed' | 'rolled-back';
export type Job = {
  id: string;
  kind: 'install' | 'rollback' | 'restore' | 'backup';
  from: string;
  to: string;
  status: JobStatus;
  step: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};
export type Release = {
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  prerelease: boolean;
  url: string;
};
export type UpdateStatus = {
  current: string;
  previous: string | null;
  lastCheck: string | null;
  available: Release[];
  job: Job | null;
  jobs: Job[];
  snapshots: boolean;
};
export type SystemStatus = {
  legal: Legal;
  version: string;
  users: number;
  dbBytes: number;
  registrationMode: 'invite' | 'open';
  showTestReleases: boolean;
  updater: {
    diskFreeBytes: number;
    diskTotalBytes: number;
    lastBackup: string | null;
    snapshots: boolean;
    /** Backup außer Haus (verschlüsselt, per rclone). */
    offsite?: { enabled: boolean; lastUpload: string | null; lastError: string | null };
  } | null;
};
export type Backup = { name: string; size: number; createdAt: string; kind: string };

/** Fortschritt eines laufenden Vorgangs: Caddy liefert ihn auch während der Wartung. */
export async function progress(): Promise<
  (Pick<Job, 'kind' | 'from' | 'to' | 'step'> & { state: JobStatus }) | null
> {
  try {
    const r = await fetch(`${window.location.origin}/maintenance/status.json`, {
      cache: 'no-store',
    });
    if (r.ok && r.headers.get('content-type')?.includes('json')) return await r.json();
  } catch {
    /* Entwicklung ohne Caddy */
  }
  try {
    const s = await api<UpdateStatus>('/api/admin/updates');
    return s.job && { ...s.job, state: s.job.status };
  } catch {
    return null;
  }
}
