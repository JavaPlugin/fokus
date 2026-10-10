import { passkey } from '@better-auth/passkey';
import { account, passkey as passkeyTable, session, user, verification, type Db } from '@fokus/db';
import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, magicLink } from 'better-auth/plugins';
import type { Env } from './env';
import { magicLinkMail, type Mailer } from './mail';

export function createAuth(db: Db, env: Env, mailer: Mailer) {
  const publicUrl = new URL(env.PUBLIC_URL);
  return betterAuth({
    appName: 'FOKUS',
    baseURL: env.API_URL ?? env.PUBLIC_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user,
        session,
        account,
        verification,
        passkey: passkeyTable,
      },
    }),
    // Kein Passwort-Login. Nutzer entstehen nur über Setup, Einladung oder offene Registrierung.
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: publicUrl.protocol === 'https:',
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    rateLimit: { enabled: env.NODE_ENV !== 'test', window: 60, max: 30 },
    telemetry: { enabled: false },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        storeToken: 'hashed',
        // disableSignUp greift erst beim Einlösen. Damit niemand über uns Mails an fremde
        // Adressen schicken kann, geht der Link nur an bestehende Nutzer (Antwort bleibt gleich).
        sendMagicLink: async ({ email, url }) => {
          const [known] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, email.toLowerCase()));
          if (known) await mailer.send(magicLinkMail(email, url));
        },
      }),
      passkey({ rpID: publicUrl.hostname, rpName: 'FOKUS', origin: env.PUBLIC_URL }),
      admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
