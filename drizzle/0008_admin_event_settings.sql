ALTER TABLE events ADD COLUMN settings TEXT;
ALTER TABLE events ADD COLUMN create_key TEXT;
CREATE UNIQUE INDEX events_create_key ON events(create_key) WHERE create_key IS NOT NULL;
ALTER TABLE event_occurrence_overrides ADD COLUMN settings TEXT;
CREATE TABLE lodges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  group_id TEXT REFERENCES participant_groups(id) ON DELETE RESTRICT
);
INSERT INTO lodges(id,name) VALUES
 ('priesthood','Жречество'),('tech-priesthood','Техножречество'),('gambling','Гемблинг'),
 ('atemporal','Атемпораль'),('mercenaries','Наймиты'),('raubritters','Раубриттеры'),
 ('capitalists','Капиталисты'),('students','Студенты'),('comrades','Камрады');
-- Freeze the effective legacy URL once, before removing manual type fallback.
-- Own event URLs and per-release settings always win. Migration ledger makes re-entry safe.
UPDATE events SET url = (SELECT venue_url FROM event_types WHERE id = events.type_id)
 WHERE source = 'manual' AND url = ''
 AND EXISTS (SELECT 1 FROM event_types WHERE id = events.type_id AND venue_url != '');
