// Participant groups: named lists (e.g. «Участники Сатурналий») built by uploading
// a list of nicks. An event's access label matching a group name means "members only".
import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { groupMembers, participantGroups, participants } from './db/schema';
import { HttpError } from './http';

export const normalizeNick = (value: string) => value.trim().replace(/^@/, '').toLowerCase();

export function createGroup(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются название группы и список ников.');
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 120) throw new HttpError(422, 'Введите название группы.');
  if (name === 'Все') throw new HttpError(422, '«Все» — служебная метка, она не может быть группой.');
  const nicks = Array.isArray(raw.nicks) ? raw.nicks.filter(x => typeof x === 'string').map(x => (x as string).trim()).filter(Boolean).slice(0, 5000) : [];
  if (!nicks.length) throw new HttpError(422, 'Передайте хотя бы один ник.');
  const db = getDb(), now = new Date();
  if (db.select().from(participantGroups).where(eq(participantGroups.name, name)).get()) {
    throw new HttpError(409, 'Группа с таким названием уже есть. Удалите её или выберите другое название.');
  }
  const wanted = new Set(nicks.map(normalizeNick));
  const rows = db.select().from(participants).all();
  const byNick = new Map(rows.map(row => [normalizeNick(row.nick), row.id]));
  const matched = rows.filter(row => wanted.has(normalizeNick(row.nick)));
  const unmatched = nicks.filter(nick => !byNick.has(normalizeNick(nick)));
  const group = db.transaction(tx => {
    const created = tx.insert(participantGroups).values({ id: randomUUID(), name, createdAt: now, updatedAt: now }).returning().get();
    for (const row of matched) {
      tx.insert(groupMembers).values({ groupId: created.id, participantId: row.id, createdAt: now }).onConflictDoNothing().run();
    }
    return created;
  });
  return { group, matched: matched.length, unmatched };
}

export function listGroups() {
  const db = getDb();
  return db.select().from(participantGroups).orderBy(asc(participantGroups.name)).all().map(group => ({
    ...group,
    members: db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM group_members WHERE group_id = ${group.id}`)?.count ?? 0,
  }));
}

export function deleteGroup(id: string) {
  const db = getDb();
  if (!db.select().from(participantGroups).where(eq(participantGroups.id, id)).get()) throw new HttpError(404, 'Группа не найдена.');
  db.delete(participantGroups).where(eq(participantGroups.id, id)).run();
  return { ok: true };
}

export function isGroupMember(participantId: string, groupName: string) {
  return Boolean(getDb().get<{ one: number }>(sql`
    SELECT 1 AS one FROM group_members gm
    JOIN participant_groups g ON g.id = gm.group_id
    WHERE gm.participant_id = ${participantId} AND g.name = ${groupName}`)?.one);
}
