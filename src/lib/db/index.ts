import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

// Never opens the Next.js database. Call lazily after the access guard.
let database: ReturnType<typeof open> | undefined;
const importGenerations = new WeakMap<object, number>();
function open() {
  const file = path.resolve(process.env.CALENDAR_DATABASE_PATH ?? 'data/experiment.sqlite');
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
  return db;
}
function baseDb() { return database ??= open(); }
export function getDb() { return baseDb(); }

export function importGeneration(db = getDb()) { return importGenerations.get(db) ?? 0; }

