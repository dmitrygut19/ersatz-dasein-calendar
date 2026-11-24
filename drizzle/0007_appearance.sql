ALTER TABLE event_types ADD COLUMN appearance TEXT;
ALTER TABLE event_occurrence_overrides ADD COLUMN appearance TEXT;
CREATE TABLE cover_images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, content BLOB NOT NULL);
