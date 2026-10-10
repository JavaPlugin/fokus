import { z } from 'zod';

const url = z.url().transform((u) => u.replace(/\/+$/, ''));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    /** postgres://… oder pglite:memory / pglite:./.data/pg */
    DATABASE_URL: z.string().min(1),
    /** Feste HTTPS-Adresse der App, z. B. https://fokus.example.de. Basis für Passkeys. */
    PUBLIC_URL: url,
    /** Nur Entwicklung: API läuft auf eigenem Port, getrennt vom Expo-Dev-Server. */
    API_URL: url.optional(),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET muss mindestens 32 Zeichen haben'),
    /** Von install.sh erzeugt, schützt den Einrichtungs-Assistenten. */
    SETUP_CODE: z.string().min(8),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('FOKUS <fokus@localhost>'),
    /** Anzeigename des Absenders (die Adresse kommt aus SMTP_FROM). */
    MAIL_FROM_NAME: z.string().default('FOKUS'),
    FK_VERSION: z.string().default('dev'),
    /** Interner Updater-Dienst (nur im Compose-Stack). */
    UPDATER_URL: url.optional(),
    UPDATER_SECRET: z.string().optional(),
    /** Optional: Lebenszeichen an einen Uptime-Dienst nach dem täglichen Lauf (GET). */
    HEARTBEAT_URL: z.url().optional().or(z.literal('')),
    /** Nur in Test-Releases (-broken): /health meldet absichtlich einen Fehler. */
    FK_SELFTEST_BROKEN: z.string().optional(),
    /** Nur Browser-Tests (Playwright): Mails im Speicher statt verschicken, abrufbar für den Test. */
    FK_E2E: z.string().optional(),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.FK_E2E !== '1', {
    message: 'FK_E2E ist in Produktion verboten',
    path: ['FK_E2E'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.SMTP_HOST, {
    message: 'SMTP_HOST ist in Produktion Pflicht',
    path: ['SMTP_HOST'],
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const res = schema.safeParse(source);
  if (!res.success) {
    const lines = res.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Ungültige Konfiguration:\n${lines.join('\n')}`);
  }
  return res.data;
}
