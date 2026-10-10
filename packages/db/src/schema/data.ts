// Fachdaten eines Nutzers. Jede Tabelle hat user_id und ist per Row Level Security geschützt
// (Migration 0001_rls). Zugriff aus der API nur über withUser().
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

export const owner = () =>
  uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' });

/** Einstellungen, eine Zeile pro Nutzer. */
export const userSettings = pgTable('user_settings', {
  userId: owner().primaryKey(),
  /** Einführung beim ersten Anmelden: erreichter Schritt und ob abgeschlossen. */
  onboarding: jsonb('onboarding').$type<{ step: number; done: boolean }>(),
  /** Benachrichtigungen: Kanal und Arten (Standard siehe API). */
  notify: jsonb('notify').$type<{
    channel: 'app' | 'email' | 'both';
    focus: boolean;
    social: boolean;
    recap: boolean;
  }>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Web-Push-Abos (ein Gerät = ein Abo; meldet sich jemand anderes auf dem Gerät an, bekommt er ein eigenes). */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    endpoint: text('endpoint').notNull(),
    userId: owner(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.endpoint] })],
);

/** Gesendete Benachrichtigungen: pro Ereignis (Schlüssel) höchstens einmal. */
export const notificationLog = pgTable(
  'notification_log',
  {
    userId: owner(),
    key: text('key').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/**
 * Persönliche API-Schlüssel (Kurzbefehle, Apple Pay). Gespeichert nur als
 * SHA-256; `prefix` (erste Zeichen) zum Wiedererkennen. Rechte z. B. transactions:create.
 * Nachschlagen über den Hash nur im Kontext app.key_lookup (Policy in 0017).
 */
export const apiKey = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('api_key_hash').on(t.hash), index('api_key_user').on(t.userId)],
);

/**
 * Webhooks: Ereignisse (Fokus-Block gestartet/beendet) an eigene URLs, signiert per
 * HMAC mit `secret`. `allowPrivate` nur, wenn ein Admin ihn angelegt hat (Heimnetz, http).
 */
export const webhook = pgTable('webhook', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: owner(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: text('events').array().notNull(),
  allowPrivate: boolean('allow_private').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Zustellungen mit Wiederholung (1 min, 10 min, 1 h), danach „failed“. */
export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhook.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: ['pending', 'ok', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAt: timestamp('next_at', { withTimezone: true }).notNull().defaultNow(),
    lastStatus: integer('last_status'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('webhook_delivery_due').on(t.status, t.nextAt)],
);
