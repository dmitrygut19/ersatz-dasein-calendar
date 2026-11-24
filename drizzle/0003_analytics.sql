CREATE TABLE participants (
  id TEXT PRIMARY KEY NOT NULL,
  telegram_id TEXT UNIQUE,
  nick TEXT NOT NULL DEFAULT '',
  tier TEXT,
  degree TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE participant_activity (
  id TEXT PRIMARY KEY NOT NULL,
  participant_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE INDEX idx_participant_activity_key ON participant_activity (event_key, participant_id);

CREATE TABLE participant_reminders (
  participant_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (participant_id, event_key),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);
