import { writeFile } from 'node:fs/promises';
import { parseVersion } from './semver';

export interface Release {
  version: string;
  name: string;
  /** Changelog aus dem Release-Text. */
  notes: string;
  publishedAt: string;
  prerelease: boolean;
  url: string;
  /** API-URL des Deploy-Pakets (fokus-deploy.tar.gz). */
  deployAsset: string;
}

export interface GitHub {
  listReleases(): Promise<Release[]>;
  downloadAsset(assetUrl: string, file: string): Promise<void>;
}

/** Wiederholt bei Netzfehlern und 5xx, mit wachsender Pause. 4xx sind endgültig. */
export async function withRetry(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  { tries = 4, delayMs = 2000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchFn(url, init);
      if (res.status < 500) return res;
      last = new Error(`GitHub antwortet mit ${res.status}`);
    } catch (e) {
      last = e;
    }
    if (i < tries - 1) await sleep(delayMs * (i + 1));
  }
  throw last instanceof Error ? new Error(`GitHub nicht erreichbar: ${last.message}`) : last;
}

export function createGitHub(repo: string, token: string, fetchFn: typeof fetch = fetch): GitHub {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fokus-updater',
  };
  return {
    async listReleases() {
      const res = await withRetry(
        fetchFn,
        `https://api.github.com/repos/${repo}/releases?per_page=30`,
        {
          headers: { ...headers, Accept: 'application/vnd.github+json' },
        },
      );
      if (!res.ok) throw new Error(`GitHub antwortet mit ${res.status}. Stimmt das Token?`);
      const list = (await res.json()) as {
        tag_name: string;
        name: string | null;
        body: string | null;
        published_at: string;
        prerelease: boolean;
        draft: boolean;
        html_url: string;
        assets: { name: string; url: string }[];
      }[];
      return list
        .filter((r) => !r.draft && parseVersion(r.tag_name))
        .map((r) => ({
          version: r.tag_name,
          name: r.name || r.tag_name,
          notes: r.body ?? '',
          publishedAt: r.published_at,
          prerelease: r.prerelease,
          url: r.html_url,
          deployAsset: r.assets.find((a) => a.name === 'fokus-deploy.tar.gz')?.url ?? '',
        }))
        .filter((r) => r.deployAsset);
    },
    async downloadAsset(assetUrl, file) {
      if (!assetUrl.startsWith(`https://api.github.com/repos/${repo}/releases/assets/`)) {
        throw new Error('Unerwartete Download-Adresse');
      }
      const res = await withRetry(fetchFn, assetUrl, {
        headers: { ...headers, Accept: 'application/octet-stream' },
      });
      if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    },
  };
}
