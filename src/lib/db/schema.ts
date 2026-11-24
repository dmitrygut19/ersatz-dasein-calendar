import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Appearance } from '../appearance';
import type { EventSettings } from '../event-settings';

export const coverImages = sqliteTable('cover_images', {
  id: text('id').primaryKey(), mime: text('mime').notNull(), content: blob('content', { mode: 'buffer' }).notNull(),
});

export const eventTypes = sqliteTable("event_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  recognitionWords: text("recognition_words").notNull().default(""),
  accessLabel: text("access_label").notNull().default(""),
  tier: text("tier"),
  degree: text("degree"),
  points: integer("points"),
  venue: text("venue").notNull().default(""),
  venueUrl: text("venue_url").notNull().default(""),
  coverPath: text("cover_path"),
  theme: text("theme").notNull().default("ordinary"),
  appearance: text('appearance', { mode: 'json' }).$type<Appearance>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const eventTypeUsage = sqliteTable("event_type_usage", {
  eventId: text("event_id").primaryKey(),
  eventTypeId: text("event_type_id")
    .notNull()
    .references(() => eventTypes.id, { onDelete: "restrict" }),
});

export const calendarSettings = sqliteTable("calendar_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const events = sqliteTable("events", {
  sourceMetadata: text('source_metadata', { mode: 'json' }).$type<{ sourceUrl?: string; allDay?: boolean; endDate?: string; noEnd?: boolean }>(),
  createKey: text('create_key'),
  settings: text('settings', { mode: 'json' }).$type<EventSettings>(),
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  url: text("url").notNull().default(""),
  venue: text("venue").notNull().default(""),
  startDate: text("start_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  timezone: text("timezone").notNull().default("Europe/Moscow"),
  repeatRule: text("repeat_rule"),
  source: text("source").notNull().default("manual"),
  externalId: text("external_id"),
  externalCalendarId: text("external_calendar_id"),
  status: text("status").notNull().default("confirmed"),
  typeId: text("type_id").references(() => eventTypes.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const occurrenceOverrides = sqliteTable("event_occurrence_overrides", {
  settings: text('settings', { mode: 'json' }).$type<EventSettings>(),
  appearance: text('appearance', { mode: 'json' }).$type<Appearance>(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  originalDate: text("original_date").notNull(),
  status: text("status").notNull().default("ok"),
  date: text("date"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  coverPath: text("cover_path"),
  accessLabel: text("access_label"),
  points: integer("points"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const externalSources = sqliteTable("external_sources", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  calendarId: text("calendar_id").notNull().default(""),
  calendarSummary: text("calendar_summary").notNull().default(""),
  status: text("status").notNull().default("connected"),
  tokens: text("tokens").notNull().default("{}"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  lastSyncError: text("last_sync_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const importMatches = sqliteTable("import_matches", {
  externalId: text("external_id").primaryKey(),
  externalTitle: text("external_title").notNull(),
  externalDate: text("external_date").notNull(),
  externalStart: text("external_start").notNull().default(""),
  externalEnd: text("external_end").notNull().default(""),
  manualEventId: text("manual_event_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  nick: text("nick").notNull().default(""),
  tier: text("tier"),
  degree: text("degree"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const participantActivity = sqliteTable("participant_activity", {
  id: text("id").primaryKey(),
  participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  kind: text("kind").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const participantReminders = sqliteTable("participant_reminders", {
  participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  enabled: integer("enabled").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const participantGroups = sqliteTable("participant_groups", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => participantGroups.id, { onDelete: "cascade" }),
  participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const lodges = sqliteTable('lodges', {
  id: text('id').primaryKey(), name: text('name').notNull().unique(),
  entryConditions: text('entry_conditions'), entryUrl: text('entry_url'), entryAction: text('entry_action'),
  iconUrl: text('icon_url'), groupId: text('group_id').references(() => participantGroups.id, { onDelete: 'restrict' }),
});

export const typeSuggestions = sqliteTable("type_suggestions", {
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  suggestedTypeId: text("suggested_type_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const typeSkips = sqliteTable("type_skips", {
  eventId: text("event_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type EventType = typeof eventTypes.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type OccurrenceOverride = typeof occurrenceOverrides.$inferSelect;
