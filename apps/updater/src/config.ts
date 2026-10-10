import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  UPDATER_SECRET: z.string().min(32, 'UPDATER_SECRET fehlt oder ist zu kurz'),
  FK_DIR: z.string().default('/opt/fokus'),
  FK_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .default('JavaPlugin/fokus'),
  FK_IMAGE_PREFIX: z.string().regex(/^[a-z0-9./-]+$/),
  GHCR_USER: z.string().min(1),
  GHCR_TOKEN: z.string().min(1),
  COSIGN_PUB: z.string().default('/app/cosign.pub'),
  HEALTH_URL: z.string().default('http://api:3000/health'),
  // Optional: Backup außer Haus (age-Schlüssel öffentlich, Ziel als rclone-Remote, z. B. „box:fokus“)
  OFFSITE_REMOTE: z.string().optional(),
  AGE_RECIPIENT: z
    .string()
    .regex(/^age1[0-9a-z]{20,}$/, 'AGE_RECIPIENT ist kein öffentlicher age-Schlüssel')
    .optional()
    .or(z.literal('')),
  OFFSITE_KEEP_DAYS: z.coerce.number().int().min(1).default(30),
  // Optional: Snapshot der ganzen VM vor jedem Update
  PROXMOX_URL: z.string().optional(),
  PROXMOX_NODE: z.string().optional(),
  PROXMOX_VMID: z.string().regex(/^\d+$/).optional().or(z.literal('')),
  PROXMOX_TOKEN_ID: z.string().optional(),
  PROXMOX_TOKEN_SECRET: z.string().optional(),
  PROXMOX_TLS_FINGERPRINT: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    throw new Error(
      `Ungültige Konfiguration:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return r.data;
}

export const proxmoxEnabled = (c: Config) =>
  !!(
    c.PROXMOX_URL &&
    c.PROXMOX_NODE &&
    c.PROXMOX_VMID &&
    c.PROXMOX_TOKEN_ID &&
    c.PROXMOX_TOKEN_SECRET &&
    c.PROXMOX_TLS_FINGERPRINT
  );
