CREATE TABLE event_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  recognition_words TEXT NOT NULL DEFAULT '',
  access_label TEXT NOT NULL DEFAULT '',
  tier TEXT,
  degree TEXT,
  points INTEGER,
  venue TEXT NOT NULL DEFAULT '',
  cover_path TEXT,
  theme TEXT NOT NULL DEFAULT 'ordinary',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE event_type_usage (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type_id TEXT NOT NULL,
  FOREIGN KEY (event_type_id) REFERENCES event_types(id) ON DELETE RESTRICT
);

CREATE TABLE calendar_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
