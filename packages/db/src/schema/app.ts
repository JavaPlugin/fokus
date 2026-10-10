import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

/** Globale Einstellungen der Instanz. Genau eine Zeile (id = 1). */
export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    setupCompleted: boolean('setup_completed').notNull().default(false),
    registrationMode: text('registration_mode', { enum: ['invite', 'open'] })
      .notNull()
      .default('invite'),
    /** Testversionen (-broken, -test) im Admin-Panel anbieten. */
    showTestReleases: boolean('show_test_releases').notNull().default(false),
    /** Angaben für Impressum und Datenschutz, im Admin-Panel gepflegt (öffentlich sichtbar). */
    legal: jsonb('legal')
      .$type<{ name: string; address: string; email: string }>()
      .notNull()
      .default({ name: '', address: '', email: '' }),
    /** Schlüsselpaar für Web Push, erzeugt die API beim ersten Bedarf. */
    vapid: jsonb('vapid').$type<{ publicKey: string; privateKey: string }>(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('app_settings_single_row', sql`${t.id} = 1`)],
);

/** Einladung zur Registrierung. Gespeichert wird nur der SHA-256-Hash des Tokens. */
export const invite = pgTable('invite', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  email: text('email'),
  createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bearbeitete Texte einer E-Mail-Vorlage. Fehlt die Zeile, gelten die Standardtexte im Code. */
export const emailTemplate = pgTable('email_template', {
  key: text('key').primaryKey(),
  fields: jsonb('fields').$type<Record<string, string>>().notNull(),
  updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Frühere Stände einer Vorlage (die API behält die letzten 10). */
export const emailTemplateVersion = pgTable('email_template_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  fields: jsonb('fields').$type<Record<string, string>>().notNull(),
  updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Protokoll der Admin-Aktionen (wer, was, wann). Keine Finanzdaten, nur Aktion und Ziel. */
export const adminAudit = pgTable('admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen) als Markdown, versioniert. Öffentlich
 * lesbar, global (kein user_id, kein RLS). Die letzten 10 Versionen je Text bleiben.
 */
export const legalText = pgTable(
  'legal_text',
  {
    key: text('key').notNull(),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    /** „Stand“ (YYYY-MM-DD), vom Admin gesetzt. */
    stand: text('stand'),
    createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.version] })],
);
