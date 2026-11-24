CREATE TABLE participant_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, participant_id),
  FOREIGN KEY (group_id) REFERENCES participant_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);
