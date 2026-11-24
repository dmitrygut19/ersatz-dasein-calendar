// Analytics over participant activity. Metrics are per release (occurrence) and count
// distinct participants; repeats of the same action never inflate numbers. Periods filter
// by the event's own date, not the activity timestamp (dashboard-design.md).
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { participantActivity, participantReminders, participants } from './db/schema';
import { HttpError } from './http';
import { listOccurrences } from './events';

const ACTIVITY_KINDS = ['view', 'open', 'reminder_on', 'reminder_off'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type Period = 'all' | 'month' | '3months';

export function periodRange(period: Period): { from: string; to: string } {
  const fmt = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const to = new Date();
  const from = new Date();
  if (period === 'month') from.setMonth(from.getMonth() - 1);
  else if (period === '3months') from.setMonth(from.getMonth() - 3);
  else if (period !== 'all') throw new HttpError(422, 'Выберите допустимый период.');
  if (period === 'all') from.setFullYear(from.getFullYear() - 5);
  return { from: fmt(from), to: fmt(to) };
}

export function parsePeriod(value: string | null | undefined): Period {
  return value === 'all' || value === 'month' || value === '3months' ? value : '3months';
}

// ---- Ingest (used by the participant side / bot later; admin can seed test data) ----

export function recordActivity(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются поля активности.');
  const raw = input as Record<string, unknown>;
  const kind = String(raw.kind ?? '') as ActivityKind;
  if (!ACTIVITY_KINDS.includes(kind)) throw new HttpError(422, 'Допустимые действия: view, open, reminder_on, reminder_off.');
  const eventKey = typeof raw.eventKey === 'string' ? raw.eventKey.trim() : '';
  if (!eventKey || eventKey.length > 160) throw new HttpError(422, 'Укажите событие (eventKey).');
  const telegramId = raw.telegramId === undefined || raw.telegramId === null ? null : String(raw.telegramId).trim();
  const participantId = raw.participantId === undefined || raw.participantId === null ? null : String(raw.participantId).trim();
  if (!telegramId && !participantId) throw new HttpError(422, 'Укажите telegramId или participantId.');
  const db = getDb(), now = new Date();
  let participant = telegramId
    ? db.select().from(participants).where(eq(participants.telegramId, telegramId)).get()
    : participantId
      ? db.select().from(participants).where(eq(participants.id, participantId)).get()
      : undefined;
  if (!participant && participantId) throw new HttpError(404, 'Участник не найден.');
  if (!participant) {
    const nick = typeof raw.nick === 'string' && raw.nick.trim() ? raw.nick.trim().slice(0, 64) : `@user_${telegramId}`;
    participant = db.insert(participants).values({
      id: randomUUID(), telegramId, nick, tier: null, degree: null, createdAt: now, updatedAt: now,
    }).returning().get();
  }
  db.insert(participantActivity).values({ id: randomUUID(), participantId: participant.id, eventKey, kind, createdAt: now }).run();
  if (kind === 'reminder_on' || kind === 'reminder_off') {
    db.insert(participantReminders).values({
      participantId: participant.id, eventKey, enabled: kind === 'reminder_on' ? 1 : 0, updatedAt: now,
    }).onConflictDoUpdate({
      target: [participantReminders.participantId, participantReminders.eventKey],
      set: { enabled: kind === 'reminder_on' ? 1 : 0, updatedAt: now },
    }).run();
  }
  return { participant };
}

// ---- Releases (left panel) ----

export function listReleases(typeId: string | null, period: Period) {
  const { from, to } = periodRange(period);
  const db = getDb();
  const occurrences = listOccurrences(from, to).filter(item => !typeId || item.typeId === typeId);
  return occurrences.map(item => ({ ...item, metrics: releaseMetrics(item.id) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
}

export function releaseMetrics(eventKey: string) {
  const db = getDb();
  const viewed = db.get<{ count: number }>(sql`
    SELECT COUNT(DISTINCT participant_id) AS count FROM participant_activity
    WHERE event_key = ${eventKey} AND kind = 'view'`)?.count ?? 0;
  const opened = db.get<{ count: number }>(sql`
    SELECT COUNT(DISTINCT participant_id) AS count FROM participant_activity
    WHERE event_key = ${eventKey} AND kind = 'open'`)?.count ?? 0;
  const reminders = db.get<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM participant_reminders
    WHERE event_key = ${eventKey} AND enabled = 1`)?.count ?? 0;
  return { viewed, opened, reminders };
}

// ---- Participants table ----

export type ParticipantFilter = {
  search?: string; tier?: string; degree?: string;
  action?: 'all' | 'opened' | 'viewed'; reminder?: 'all' | 'on' | 'off';
  page?: number; pageSize?: number;
};

export function listParticipants(eventKey: string, filter: ParticipantFilter) {
  if (!eventKey) throw new HttpError(422, 'Укажите событие (eventKey).');
  const db = getDb();
  const pageSize = Math.min(Math.max(filter.pageSize ?? 8, 1), 50);
  const page = Math.max(filter.page ?? 1, 1);
  const where: ReturnType<typeof sql>[] = [sql`a.event_key = ${eventKey}`];
  if (filter.search?.trim()) where.push(sql`p.nick LIKE ${'%' + filter.search.trim() + '%'}`);
  if (filter.tier) where.push(sql`p.tier = ${filter.tier}`);
  if (filter.degree) where.push(sql`p.degree = ${filter.degree}`);
  const having: ReturnType<typeof sql>[] = [];
  if (filter.action === 'opened') having.push(sql`opened = 1`);
  if (filter.action === 'viewed') having.push(sql`opened = 0`);
  if (filter.reminder === 'on') having.push(sql`reminder = 1`);
  if (filter.reminder === 'off') having.push(sql`reminder = 0`);
  const whereSql = sql.join(where, sql` AND `);
  const havingSql = having.length ? sql`HAVING ${sql.join(having, sql` AND `)}` : sql``;
  const aggregates = sql`
      MAX(a.created_at) AS lastActivity,
      MAX(CASE WHEN a.kind = 'open' THEN 1 ELSE 0 END) AS opened,
      COALESCE(MAX(r.enabled), 0) AS reminder`;
  const grouped = sql`
    FROM participant_activity a
    JOIN participants p ON p.id = a.participant_id
    LEFT JOIN participant_reminders r ON r.participant_id = p.id AND r.event_key = a.event_key
    WHERE ${whereSql}
    GROUP BY p.id
    ${havingSql}`;
  const total = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM (SELECT p.id AS id, ${aggregates} ${grouped})`)?.count ?? 0;
  const rows = db.all<{ id: string; nick: string; tier: string | null; degree: string | null; lastActivity: number; opened: number; reminder: number }>(sql`
    SELECT p.id, p.nick, p.tier, p.degree, ${aggregates}
    ${grouped}
    ORDER BY lastActivity DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  return {
    total,
    page,
    pageSize,
    metrics: releaseMetrics(eventKey),
    participants: rows.map(row => ({
      id: row.id, nick: row.nick, tier: row.tier, degree: row.degree,
      action: row.opened ? 'Перешёл' : 'Посмотрел',
      reminder: Boolean(row.reminder),
      lastActivity: new Date(row.lastActivity).toISOString(),
    })),
  };
}

// ---- Profile ----

const EVENT_DATE = sql`
  CASE WHEN instr(a.event_key, '@') > 0
    THEN substr(a.event_key, instr(a.event_key, '@') + 1)
    ELSE (SELECT e.start_date FROM events e WHERE e.id = a.event_key)
  END`;

export function participantProfile(id: string, period: Period) {
  const { from, to } = periodRange(period);
  const db = getDb();
  const participant = db.select().from(participants).where(eq(participants.id, id)).get();
  if (!participant) throw new HttpError(404, 'Участник не найден.');
  const metrics = {
    viewed: db.get<{ count: number }>(sql`
      SELECT COUNT(DISTINCT a.event_key) AS count FROM participant_activity a
      WHERE a.participant_id = ${id} AND a.kind = 'view' AND ${EVENT_DATE} BETWEEN ${from} AND ${to}`)?.count ?? 0,
    opened: db.get<{ count: number }>(sql`
      SELECT COUNT(DISTINCT a.event_key) AS count FROM participant_activity a
      WHERE a.participant_id = ${id} AND a.kind = 'open' AND ${EVENT_DATE} BETWEEN ${from} AND ${to}`)?.count ?? 0,
    reminders: db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM participant_reminders r
      WHERE r.participant_id = ${id} AND r.enabled = 1 AND
        (CASE WHEN instr(r.event_key, '@') > 0
          THEN substr(r.event_key, instr(r.event_key, '@') + 1)
          ELSE (SELECT e.start_date FROM events e WHERE e.id = r.event_key) END) BETWEEN ${from} AND ${to}`)?.count ?? 0,
  };
  const history = db.all<{ eventKey: string; eventDate: string | null; title: string | null; viewed: number; opened: number; reminder: number | null; lastActivity: number }>(sql`
    SELECT a.event_key AS eventKey,
      ${EVENT_DATE} AS eventDate,
      (SELECT e.title FROM events e WHERE e.id = CASE WHEN instr(a.event_key, '@') > 0
        THEN substr(a.event_key, 1, instr(a.event_key, '@') - 1) ELSE a.event_key END) AS title,
      MAX(CASE WHEN a.kind = 'view' THEN 1 ELSE 0 END) AS viewed,
      MAX(CASE WHEN a.kind = 'open' THEN 1 ELSE 0 END) AS opened,
      (SELECT r.enabled FROM participant_reminders r WHERE r.participant_id = a.participant_id AND r.event_key = a.event_key) AS reminder,
      MAX(a.created_at) AS lastActivity
    FROM participant_activity a
    WHERE a.participant_id = ${id}
    GROUP BY a.event_key
    HAVING eventDate BETWEEN ${from} AND ${to}
    ORDER BY eventDate DESC`);
  return { participant, metrics, history };
}
