// Fachdaten eines Nutzers. Jede Tabelle hat user_id und ist per Row Level Security geschützt
// (Migration 0001_rls). Zugriff aus der API nur über withUser().
import {
  boolean,
  date,
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
  /** Planung: eigene Werte über den Standardwerten aus packages/core (PlanSettings). */
  plan: jsonb('plan').$type<{
    focusMinutes?: number;
    pauseMinutes?: number;
    creditPerHour?: number;
    dailyLimit?: number;
    workStart?: string;
    workEnd?: string;
    baselineScroll?: number;
    streakGoal?: number;
    redirectBonus?: number;
    redirectSpend?: number;
    peaks?: { from: string; to: string }[];
  }>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Aufgabe. Dauer in ganzen Minuten; `mini` = 2-Minuten-Aufgabe für Lücken und „Umleiten“. */
export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    title: text('title').notNull(),
    minutes: integer('minutes').notNull().default(25),
    heavy: boolean('heavy').notNull().default(false),
    mini: boolean('mini').notNull().default(false),
    due: date('due', { mode: 'string' }),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('task_user_status').on(t.userId, t.status)],
);

/** Kalender-Abo (ICS-Adresse von Google, Apple …). Termine kommen als belegte Blöcke. */
export const calendarFeed = pgTable(
  'calendar_feed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('calendar_feed_user').on(t.userId)],
);

/** Energie am Morgen (niedrig, normal, hoch), ein Eintrag pro Tag. */
export const energyDay = pgTable(
  'energy_day',
  {
    userId: owner(),
    day: date('day', { mode: 'string' }).notNull(),
    level: text('level', { enum: ['low', 'normal', 'high'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Zeitblock im Kalender: Fokus, Pause, Social-Slot oder Termin. */
export const timeBlock = pgTable(
  'time_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    kind: text('kind', { enum: ['focus', 'pause', 'social', 'event'] }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    minutes: integer('minutes').notNull(),
    title: text('title').notNull().default(''),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['planned', 'running', 'done', 'skipped'] })
      .notNull()
      .default('planned'),
    /** plan = von der Planung erzeugt (wird beim Neuplanen ersetzt), manual = selbst angelegt */
    source: text('source', { enum: ['plan', 'manual', 'calendar'] })
      .notNull()
      .default('manual'),
    /** Kalender-Abo und Kennung des Termins darin (nur bei source = calendar) */
    feedId: uuid('feed_id').references(() => calendarFeed.id, { onDelete: 'cascade' }),
    extId: text('ext_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('time_block_user_start').on(t.userId, t.startsAt),
    unique('time_block_feed_ext').on(t.userId, t.feedId, t.extId),
  ],
);

/** Ein Fokus-Durchgang (Timer). `focusedMinutes` = tatsächlich gearbeitet. */
export const focusSession = pgTable(
  'focus_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    blockId: uuid('block_id').references(() => timeBlock.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    plannedMinutes: integer('planned_minutes').notNull(),
    focusedMinutes: integer('focused_minutes').notNull().default(0),
    status: text('status', { enum: ['running', 'done', 'abandoned'] })
      .notNull()
      .default('running'),
  },
  (t) => [index('focus_session_user_start').on(t.userId, t.startedAt)],
);

/** Scroll-Guthaben als Buch: Plus = verdient, Minus = ausgegeben. */
export const creditEntry = pgTable(
  'credit_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    minutes: integer('minutes').notNull(),
    reason: text('reason', { enum: ['focus', 'social', 'redirect', 'adjust'] }).notNull(),
    sessionId: uuid('session_id').references(() => focusSession.id, { onDelete: 'set null' }),
    blockId: uuid('block_id').references(() => timeBlock.id, { onDelete: 'set null' }),
  },
  (t) => [index('credit_entry_user_at').on(t.userId, t.at)],
);

/** Schnell notiert, FOKUS plant später ein (wird zur Aufgabe). */
export const inboxItem = pgTable(
  'inbox_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    text: text('text').notNull(),
    status: text('status', { enum: ['open', 'planned', 'dismissed'] })
      .notNull()
      .default('open'),
    taskId: uuid('task_id').references(() => task.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('inbox_item_user_status').on(t.userId, t.status)],
);

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

/**
 * Fokus-Partner: gemeinsamer Fokus-Block. `user_id` = Besitzer. Mitglieder sehen den Raum nur über
 * die API (Mitgliedschaft in focus_room_member, eigene Zeile je Mitglied); die API liest dann im
 * Admin-Kontext. Eingeladen wird über einen Link, gespeichert ist nur der SHA-256 des Tokens.
 */
export const focusRoom = pgTable('focus_room', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: owner(),
  title: text('title').notNull().default(''),
  minutes: integer('minutes').notNull(),
  inviteHash: text('invite_hash').notNull().unique(),
  status: text('status', { enum: ['open', 'closed'] })
    .notNull()
    .default('open'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

/** Eine Person im Raum (auch der Besitzer). Nur Name und Zustand sind für andere sichtbar. */
export const focusRoomMember = pgTable(
  'focus_room_member',
  {
    userId: owner(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => focusRoom.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    state: text('state', { enum: ['focus', 'pause'] })
      .notNull()
      .default('focus'),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roomId] })],
);
