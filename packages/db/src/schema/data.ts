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
import { sql } from 'drizzle-orm';
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
    week?: ({ from: string; to: string } | null)[];
    baselineScroll?: number;
    streakGoal?: number;
    redirectBonus?: number;
    redirectSpend?: number;
  }>(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Aufgabe: die eine Sache in FOKUS. Art (Arbeit, Pause, Social), Dauer in ganzen Minuten, Wann
 * (automatisch geplant, feste Zeit oder später) und optional eine Wiederholung. Bei Wiederholung
 * ist `status` immer „open“: erledigt wird nur das Vorkommen (task_occurrence).
 */
export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: owner(),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['work', 'pause', 'social'] })
      .notNull()
      .default('work'),
    minutes: integer('minutes').notNull().default(30),
    schedule: text('schedule', { enum: ['auto', 'fixed', 'later'] })
      .notNull()
      .default('later'),
    /** Feste Zeit (Beginn); bei Wiederholung zählt nur die Uhrzeit (Berlin) */
    fixedAt: timestamp('fixed_at', { withTimezone: true, mode: 'date' }),
    due: date('due', { mode: 'string' }),
    /** { freq: 'daily' | 'weekdays' | 'weekly', days?: 0–6[] } */
    recurrence: jsonb('recurrence').$type<{
      freq: 'daily' | 'weekdays' | 'weekly';
      days?: number[];
    }>(),
    /** Tag, ab dem eine Wiederholung gilt (feste Zeit: deren Tag, sonst Anlegetag) */
    anchor: date('anchor', { mode: 'string' })
      .notNull()
      .default(sql`current_date`),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('task_user_status').on(t.userId, t.status)],
);

/**
 * Ein Vorkommen einer wiederkehrenden Aufgabe an einem Tag: erledigt, übersprungen („nur diese
 * löschen“) oder abgeändert („nur diese bearbeiten“: Titel, Dauer, Uhrzeit).
 */
export const taskOccurrence = pgTable(
  'task_occurrence',
  {
    userId: owner(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    doneAt: timestamp('done_at', { withTimezone: true, mode: 'date' }),
    skipped: boolean('skipped').notNull().default(false),
    title: text('title'),
    minutes: integer('minutes'),
    /** „HH:MM“ (Berlin), nur bei fester Zeit */
    time: text('time'),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.day] })],
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
