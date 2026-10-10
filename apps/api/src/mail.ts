import nodemailer from 'nodemailer';
import type { Env } from './env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** HTML-Version (Vorlage aus mail-templates.ts); die Text-Version geht immer mit. */
  html?: string;
}

/** Absender: Anzeigename aus MAIL_FROM_NAME, Adresse aus SMTP_FROM („Name <adresse>“ oder nur Adresse). */
export function senderOf(env: Pick<Env, 'SMTP_FROM' | 'MAIL_FROM_NAME'>): string {
  const addr = env.SMTP_FROM.match(/<([^>]+)>/)?.[1] ?? env.SMTP_FROM.trim();
  return `"${env.MAIL_FROM_NAME.replace(/"/g, '')}" <${addr}>`;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Browser-Tests (FK_E2E=1, nie in Produktion): verschickte Mails zum Abrufen. */
export const e2eOutbox: Mail[] = [];

/** SMTP aus der .env. Ohne SMTP_HOST (nur Entwicklung) landen Mails im Log. */
export function createMailer(env: Env): Mailer {
  if (!env.SMTP_HOST) {
    return {
      async send(mail) {
        if (env.FK_E2E === '1' && env.NODE_ENV !== 'production') e2eOutbox.push(mail);
        console.info(`[mail] an ${mail.to}: ${mail.subject}\n${mail.text}`);
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: senderOf(env), ...mail });
    },
  };
}

export { magicLinkMail } from './mail-templates';
