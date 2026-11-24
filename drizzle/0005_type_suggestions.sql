CREATE TABLE type_suggestions (
  event_id TEXT NOT NULL,
  suggested_type_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, suggested_type_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE type_skips (
  event_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
