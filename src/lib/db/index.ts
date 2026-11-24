import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { publicDemoEnabled } from '../public-demo';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sharedCalendarEnabled } from '../shared-calendar';

// Never opens the Next.js database. Call lazily after the access guard.
let database: ReturnType<typeof open> | undefined;
let sharedDatabase: ReturnType<typeof open> | undefined;
const requestDatabase = new AsyncLocalStorage<ReturnType<typeof open>>();
const importGenerations = new WeakMap<object, number>();
function open() {
  const file = sharedCalendarEnabled()
    ? path.resolve(process.env.CALENDAR_SHARED_DATABASE_PATH ?? 'data/shared-community/calendar.sqlite')
    : publicDemoEnabled()
    ? path.resolve(process.env.CALENDAR_PUBLIC_DEMO_DIRECTORY ?? 'data/public-demo', 'calendar.sqlite')
    : path.resolve(process.env.CALENDAR_DATABASE_PATH ?? 'data/experiment.sqlite');
  const original = path.resolve('../calendar-app/data/calendar.sqlite');
  if (file === original || file.includes(`${path.sep}calendar-app${path.sep}`)) {
    throw new Error('The experiment cannot use the calendar-app database.');
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  for (const name of ['0001_event_types.sql', '0002_events_integration.sql', '0003_analytics.sql', '0004_groups.sql', '0005_type_suggestions.sql', '0006_venue_url.sql', '0007_appearance.sql', '0008_admin_event_settings.sql', '0009_event_card.sql']) {
    if (!sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name)) {
      const sql = readFileSync(path.resolve('drizzle', name), 'utf8');
      sqlite.transaction(() => {
        sqlite.exec(sql);
        sqlite.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, Date.now());
      })();
    }
  }
  const db = drizzle(sqlite, { schema });
  if (publicDemoEnabled() && !sharedCalendarEnabled()) resetDemoImports(db);
  return db;
}
function baseDb() { return database ??= open(); }
export function getDb() { return sharedCalendarEnabled() ? sharedDatabase ??= open() : requestDatabase.getStore() ?? baseDb(); }

export function createDemoDatabase() {
  if (!publicDemoEnabled()) throw new Error('Private review databases are demo-only.');
  const snapshot = baseDb().$client.serialize();
  // SQLite deserialize cannot use WAL headers; the snapshot already includes its pages.
  // See sqlite.org/c3ref/deserialize.html (file-format bytes 18 and 19).
  snapshot[18] = 1;
  snapshot[19] = 1;
  const sqlite = new Database(snapshot);
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function withDemoDatabase<T>(db: ReturnType<typeof open>, action: () => T): T {
  return requestDatabase.run(db, action);
}

export function importGeneration(db = getDb()) { return importGenerations.get(db) ?? 0; }

export function resetDemoImports(db = getDb()) {
  if (!publicDemoEnabled()) throw new Error('Demo reset is not available in the application.');
  if (sharedCalendarEnabled()) return;
  db.$client.transaction(() => {
    // Clear only imported copies and their connection; manual demo work is retained.
    for (const table of ['participant_activity', 'participant_reminders']) {
      db.$client.exec(`DELETE FROM ${table} WHERE EXISTS (SELECT 1 FROM events e WHERE e.source != 'manual' AND (event_key = e.id OR event_key LIKE e.id || '@%'))`);
    }
    db.$client.exec("DELETE FROM event_type_usage WHERE event_id IN (SELECT id FROM events WHERE source != 'manual')");
    db.$client.exec("DELETE FROM events WHERE source != 'manual'");
    db.$client.exec('DELETE FROM external_sources; DELETE FROM import_matches; DELETE FROM type_suggestions; DELETE FROM type_skips;');
    db.$client.exec("DELETE FROM calendar_settings WHERE key IN ('oauth_state', 'oauth_state_expires'); INSERT INTO calendar_settings (key,value) VALUES ('manual_mode','1') ON CONFLICT(key) DO UPDATE SET value='1'");
  })();
  importGenerations.set(db, importGeneration(db) + 1);
}
