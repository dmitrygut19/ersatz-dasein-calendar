CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  repeat_rule TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  external_calendar_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  type_id TEXT REFERENCES event_types(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE event_occurrence_overrides (
  event_id TEXT NOT NULL,
  original_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  cover_path TEXT,
  access_label TEXT,
  points INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, original_date),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE external_sources (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT '',
  calendar_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connected',
  tokens TEXT NOT NULL DEFAULT '{}',
  last_sync_at INTEGER,
  last_sync_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE import_matches (
  external_id TEXT PRIMARY KEY NOT NULL,
  external_title TEXT NOT NULL,
  external_date TEXT NOT NULL,
  external_start TEXT NOT NULL DEFAULT '',
  external_end TEXT NOT NULL DEFAULT '',
  manual_event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
