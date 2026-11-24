// Type recognition for imported events (rules fixed 09.11.2026, decisions.md):
// any recognition word of a type matches the event title by root — a word of 4+
// letters matches when a title word starts with it, shorter words match exactly.
// The system only suggests; an admin confirms. Untyped external events are
// re-evaluated on every sync and on every read of the review queue.
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from './db';
import { eventTypes, events, typeSkips, typeSuggestions } from './db/schema';

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const titleWords = (value: string) => normalize(value).split(' ').filter(Boolean);
const recognitionWords = (value: string) => normalize(value).split(/[ ,;]+/).filter(Boolean);

function matches(title: string[], word: string) {
  if (word.length >= 4) return title.some(item => item.startsWith(word));
  return title.includes(word);
}

export function matchTypeIds(title: string, types: { id: string; recognitionWords: string }[]): string[] {
  const words = titleWords(title);
  if (!words.length) return [];
  return types
    .filter(type => recognitionWords(type.recognitionWords).some(word => matches(words, word)))
    .map(type => type.id);
}

// Rebuild suggestions for every external event without a type. Called after each
// sync and before rendering the review queue, so new/changed types apply to old events.
// Skipped events stay out of the queue until the next sync clears the skips.
export function refreshSuggestions() {
  const db = getDb(), now = new Date();
  const types = db.select({ id: eventTypes.id, recognitionWords: eventTypes.recognitionWords }).from(eventTypes).all();
  const skipped = new Set(db.select().from(typeSkips).all().map(row => row.eventId));
  const untyped = db.select().from(events).where(and(eq(events.source, 'google'), isNull(events.typeId))).all()
    .concat(db.select().from(events).where(and(eq(events.source, 'yandex'), isNull(events.typeId))).all())
    .filter(event => !skipped.has(event.id));
  db.transaction(tx => {
    for (const event of untyped) {
      tx.delete(typeSuggestions).where(eq(typeSuggestions.eventId, event.id)).run();
      for (const typeId of matchTypeIds(event.title, types).slice(0, 3)) {
        tx.insert(typeSuggestions).values({ eventId: event.id, suggestedTypeId: typeId, createdAt: now, updatedAt: now })
          .onConflictDoNothing().run();
      }
    }
    // Events that got a type (or were deleted) leave the queue and the skip list.
    const current = new Set(untyped.map(event => event.id));
    for (const row of tx.select().from(typeSuggestions).all()) {
      if (!current.has(row.eventId)) tx.delete(typeSuggestions).where(eq(typeSuggestions.eventId, row.eventId)).run();
    }
    for (const row of tx.select().from(typeSkips).all()) {
      if (!current.has(row.eventId)) tx.delete(typeSkips).where(eq(typeSkips.eventId, row.eventId)).run();
    }
  });
}

export function listSuggestions() {
  refreshSuggestions();
  const db = getDb();
  const rows = db.select().from(typeSuggestions).all();
  const eventById = new Map(db.select().from(events).all().map(event => [event.id, event]));
  const typeById = new Map(db.select().from(eventTypes).all().map(type => [type.id, type]));
  const grouped = new Map<string, { eventId: string; title: string; date: string; suggestions: { id: string; name: string }[] }>();
  for (const row of rows) {
    const event = eventById.get(row.eventId);
    const type = typeById.get(row.suggestedTypeId);
    if (!event || !type) continue;
    const entry = grouped.get(row.eventId) ?? { eventId: row.eventId, title: event.title, date: event.startDate, suggestions: [] };
    entry.suggestions.push({ id: type.id, name: type.name });
    grouped.set(row.eventId, entry);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function skipTypeSuggestions(eventId: string) {
  const db = getDb(), now = new Date();
  db.insert(typeSkips).values({ eventId, createdAt: now }).onConflictDoNothing().run();
  db.delete(typeSuggestions).where(eq(typeSuggestions.eventId, eventId)).run();
}

// Next import re-offers skipped events (skip decisions live only until the next sync).
export function clearSkips() {
  getDb().delete(typeSkips).run();
}

export function dropSuggestions(eventId: string) {
  getDb().delete(typeSuggestions).where(eq(typeSuggestions.eventId, eventId)).run();
}
