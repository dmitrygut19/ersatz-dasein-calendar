import { externalSeriesId } from './external-event-defaults';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { eventTypes, eventTypeUsage, events, occurrenceOverrides, type EventRow } from './db/schema';
import { HttpError } from './http';
import { validateAppearance, type Appearance } from './appearance';
import { validCover } from './covers';
import { expandDates, parseRule, repeatLabel, validateRule, type RepeatRule } from './recurrence';
import { shiftDate, validDate } from './event-settings';
import { validateSettings, updateScopedEvent } from './scoped-events';

export type OccurrenceDto = {
  sourceCalendarId: string | null;
  sourceSeriesId: string | null;
  id: string;
  eventId: string;
  title: string;
  date: string;
  start: string;
  end: string;
  description: string;
  url: string;
  ownUrl: string;
  sourceUrl: string; allDay: boolean; endDate: string | null; noEnd: boolean; timezone: string; requiresAuth: boolean;
  venue: string;
  typeId: string | null;
  typeName: string | null;
  typeTier: string | null;
  typeDegree: string | null;
  allowedDegrees: string[] | null;
  affiliationDegrees: string[] | null;
  affiliationDegree: string | null; communityEvent: boolean;
  degreeOverride: boolean;
  topicLodgeId: string | null;
  audienceLodgeIds: string[];
  typeTheme: string | null;
  appearance: Appearance | null;
  appearanceOverride: boolean;
  accessOverride: boolean;
  pointsOverride: boolean;
  source: 'manual' | 'google' | 'yandex';
  access: string;
  points: number;
  cover: string | null;
  repeat: string;
  repeatRule: RepeatRule | null;
  status: 'scheduled' | 'cancelled';
  series: boolean;
};

type EventInput = {
  title: string; description: string; url: string; venue: string;
  date: string; start: string; end: string; typeId: string | null; repeatRule: RepeatRule | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateEvent(input: unknown): EventInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются поля события.');
  const raw = input as Record<string, unknown>;
  const string = (key: string, max: number, fallback = '') => {
    const value = raw[key] ?? fallback;
    if (typeof value !== 'string' || value.length > max) throw new HttpError(422, `Проверьте поле «${key}».`);
    return value.trim();
  };
  const title = string('title', 120);
  if (!title) throw new HttpError(422, 'Введите название события.');
  const date = string('date', 10);
  if (!validDate(date)) throw new HttpError(422, 'Проверьте дату события.');
  const start = string('start', 5), end = string('end', 5);
  if (!TIME.test(start) || !TIME.test(end)) throw new HttpError(422, 'Проверьте время начала и окончания.');
  if (end <= start) throw new HttpError(422, 'Время окончания должно быть позже начала.');
  const url = string('url', 300);
  if (url && !/^https?:\/\//.test(url)) throw new HttpError(422, 'Введите ссылку, начинающуюся с https:// или http://.');
  const typeId = string('typeId', 64) || null;
  if (typeId && !getDb().select({ id: eventTypes.id }).from(eventTypes).where(eq(eventTypes.id, typeId)).get()) {
    throw new HttpError(422, 'Выбранный тип события не найден.');
  }
  return { title, date, start, end, url, typeId, description: string('description', 2000), venue: string('venue', 120), repeatRule: validateRule(raw.repeatRule) };
}

export function occurrenceIdOf(event: EventRow, date: string) {
  return event.repeatRule ? `${event.id}@${date}` : event.id;
}
export function parseOccurrenceId(value: string) {
  const at = value.lastIndexOf('@');
  return at < 0 ? { eventId: value, date: null as string | null } : { eventId: value.slice(0, at), date: value.slice(at + 1) };
}

function dto(event: EventRow, type: typeof eventTypes.$inferSelect | undefined, date: string, start: string, end: string, override: typeof occurrenceOverrides.$inferSelect | undefined, originalDate = date): OccurrenceDto {
  const rule = parseRule(event.repeatRule);
  const settings = { ...event.settings, ...override?.settings };
  const restoreTypeCover = override?.settings && 'coverPath' in override.settings && override.settings.coverPath === null;
  const restoreTypeAppearance = override?.settings && 'appearance' in override.settings && override.settings.appearance === null;
  const cover = restoreTypeCover ? type?.coverPath ?? null : override?.coverPath ?? event.settings?.coverPath ?? type?.coverPath ?? null;
  const appearance = restoreTypeAppearance ? null : override?.appearance ?? event.settings?.appearance;
  return {
    // A moved release keeps the identity of its original scheduled date.
    // Admin settings/deletion and an open public card must address that release.
    id: occurrenceIdOf(event, override?.originalDate ?? originalDate),
    eventId: event.id,
    sourceCalendarId: event.externalCalendarId,
    sourceSeriesId: event.source !== 'manual' && event.externalCalendarId?.startsWith('ical:') && event.externalId && /@\d{4}-\d{2}-\d{2}$/.test(event.externalId) ? externalSeriesId(event.externalId) : null,
    title: settings.title ?? event.title,
    date,
    start, end,
    description: settings.description ?? event.description,
    url: settings.url ?? (event.url || type?.venueUrl || ''),
    ownUrl: settings.url ?? event.url,
    sourceUrl: event.sourceMetadata?.sourceUrl ?? '', allDay: event.sourceMetadata?.allDay ?? false,
    endDate: event.sourceMetadata?.endDate ?? null, noEnd: event.sourceMetadata?.noEnd ?? false, timezone: event.timezone, requiresAuth: settings.requiresAuth === true,
    venue: event.venue || (type?.venue ?? ''),
    typeId: event.typeId,
    typeName: type?.name ?? null,
    typeTier: type?.tier ?? null,
    typeDegree: settings.degree ?? type?.degree ?? null,
    allowedDegrees: settings.allowedDegrees ?? null,
    affiliationDegrees: settings.affiliationDegrees ?? null,
    degreeOverride: settings.degree != null,
    affiliationDegree: settings.affiliationDegree ?? null, communityEvent: settings.communityEvent === true && !settings.topicLodgeId,
    topicLodgeId: settings.topicLodgeId ?? null,
    audienceLodgeIds: settings.audienceLodgeIds ?? [],
    typeTheme: appearance?.theme ?? type?.theme ?? null,
    appearance: appearance ? { ...(type?.appearance ?? {}), ...appearance } : type?.appearance ?? null,
    appearanceOverride: Boolean(override?.appearance),
    accessOverride: override?.accessLabel != null || event.settings?.accessLabel != null,
    pointsOverride: override?.points != null || event.settings?.points != null,
    source: event.source === 'manual' ? 'manual' : (event.source as 'google' | 'yandex'),
    access: override?.accessLabel ?? event.settings?.accessLabel ?? type?.accessLabel ?? 'Все',
    points: override?.points ?? event.settings?.points ?? type?.points ?? 0,
    cover: cover === '' ? null : cover,
    repeat: repeatLabel(event.startDate, rule),
    repeatRule: rule,
    status: override?.status === 'cancelled' || event.status === 'cancelled' ? 'cancelled' : 'scheduled',
    series: Boolean(rule),
  };
}

export function listOccurrences(from: string, to: string) {
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(422, 'Проверьте диапазон дат.');
  const db = getDb();
  const types = new Map(db.select().from(eventTypes).all().map(type => [type.id, type]));
  const rows = db.select().from(events).orderBy(asc(events.startDate), asc(events.id)).all();
  const result: OccurrenceDto[] = [];
  for (const event of rows) {
    const type = event.typeId ? types.get(event.typeId) : undefined;
    const rule = parseRule(event.repeatRule);
    if (!rule) {
      const override = db.select().from(occurrenceOverrides)
        .where(and(eq(occurrenceOverrides.eventId, event.id), eq(occurrenceOverrides.originalDate, event.startDate))).get();
      const date = override?.status === 'moved' && override.date ? override.date : shiftDate(event.startDate, event.settings?.dateOffset ?? 0);
      if (date < from || date > to) continue;
      const item = dto(event, type, date, override?.startTime ?? event.startTime, override?.endTime ?? event.endTime, override, event.startDate);
      if (item.status !== 'cancelled') result.push(item);
      continue;
    }
    const overrides = new Map(
      db.select().from(occurrenceOverrides).where(eq(occurrenceOverrides.eventId, event.id)).all().map(row => [row.originalDate, row]),
    );
    const offset = event.settings?.dateOffset ?? 0;
    const originalDates = new Set(expandDates(event.startDate, rule, shiftDate(from, -offset), shiftDate(to, -offset)));
    // A release can move into this window from an original date outside it.
    for (const [originalDate, override] of overrides) {
      if (override.status === 'moved' && override.date && override.date >= from && override.date <= to) originalDates.add(originalDate);
    }
    for (const originalDate of originalDates) {
      const override = overrides.get(originalDate);
      const date = override?.status === 'moved' && override.date ? override.date : shiftDate(originalDate, offset);
      if (date < from || date > to) continue;
      const item = dto(event, type, date, override?.startTime ?? event.startTime, override?.endTime ?? event.endTime, override, originalDate);
      if (item.status === 'cancelled') continue;
      result.push(item);
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

export function getOccurrence(id: string) {
  const { eventId, date: originalDate } = parseOccurrenceId(id);
  const event = getEvent(eventId);
  const scheduledDate = originalDate ?? event.startDate;
  const override = getDb().select().from(occurrenceOverrides)
    .where(and(eq(occurrenceOverrides.eventId, eventId), eq(occurrenceOverrides.originalDate, scheduledDate))).get();
  const date = override?.status === 'moved' && override.date ? override.date : shiftDate(scheduledDate, event.settings?.dateOffset ?? 0);
  const occurrence = listOccurrences(date, date).find(item => item.id === id);
  if (!occurrence) throw new HttpError(404, 'Событие уже удалено или не найдено.');
  return occurrence;
}

function syncUsage(db: ReturnType<typeof getDb>, event: EventRow) {
  db.delete(eventTypeUsage).where(eq(eventTypeUsage.eventId, event.id)).run();
  if (event.typeId) db.insert(eventTypeUsage).values({ eventId: event.id, eventTypeId: event.typeId }).run();
}

export function createEvent(input: unknown) {
  const values = validateEvent(input), db = getDb(), now = new Date();
  const settings = validateSettings(input as Record<string, unknown>);
  const createKey = (input as Record<string,unknown>).requestId ?? null;
  if (createKey !== null && (typeof createKey !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(createKey))) throw new HttpError(422, 'Проверьте ключ отправки события.');
  return db.transaction(tx => {
    if (createKey) {
      const existing = tx.select().from(events).where(eq(events.createKey,createKey as string)).get();
      if (existing) {
        if (existing.title !== values.title || existing.description !== values.description || existing.url !== values.url || existing.startDate !== values.date || existing.startTime !== values.start || existing.endTime !== values.end || existing.typeId !== values.typeId || existing.repeatRule !== (values.repeatRule ? JSON.stringify(values.repeatRule) : null) || JSON.stringify(existing.settings) !== JSON.stringify(settings)) throw new HttpError(409, 'Это событие уже сохранено. Откройте его из списка для дальнейших изменений.');
        return existing;
      }
    }
    const saved = tx.insert(events).values({
      createKey: createKey as string | null,
      id: randomUUID(), title: values.title, description: values.description, url: values.url, venue: values.venue,
      startDate: values.date, startTime: values.start, endTime: values.end,
      repeatRule: values.repeatRule ? JSON.stringify(values.repeatRule) : null,
      source: 'manual', status: 'confirmed', typeId: values.typeId, settings, createdAt: now, updatedAt: now,
    }).returning().get()!;
    if (values.typeId) tx.insert(eventTypeUsage).values({ eventId: saved.id, eventTypeId: values.typeId }).run();
    return saved;
  });
}

function getEvent(id: string) {
  const event = getDb().select().from(events).where(eq(events.id, id)).get();
  if (!event) throw new HttpError(404, 'Событие уже удалено или не найдено.');
  return event;
}

export function updateEvent(id: string, input: unknown) {
  if (input && typeof input === 'object' && 'scope' in input) return updateScopedEvent(id, input);
  const { eventId, date: parsedDate } = parseOccurrenceId(id);
  const event = getEvent(eventId);
  const db = getDb(), now = new Date();
  const external = event.source !== 'manual';
  // События без повтора адресуются как отдельный выпуск: индивидуальные
  // доступ/баллы/обложка хранятся для них в переопределениях на дату начала.
  const date = parsedDate ?? (parseRule(event.repeatRule) ? null : event.startDate);
  if (external && !date) throw new HttpError(409, 'Внешнее событие меняется в календаре-источнике.');
  if (!date || (!external && !parsedDate && input && typeof input === 'object' && 'title' in input)) {
    // Series edit (manual only): the whole definition is owned by the admin form.
    const values = validateEvent(input);
    return db.transaction(tx => {
      const saved = tx.update(events).set({
        title: values.title, description: values.description, url: values.url, venue: values.venue,
        startDate: values.date, startTime: values.start, endTime: values.end,
        repeatRule: values.repeatRule ? JSON.stringify(values.repeatRule) : null,
        typeId: values.typeId, updatedAt: now,
      }).where(eq(events.id, eventId)).returning().get()!;
      if (!parseRule(event.repeatRule) && !values.repeatRule) {
        // Moving the definition of a one-off event keeps its individual settings,
        // while the newly edited schedule replaces any old schedule override.
        tx.update(occurrenceOverrides).set({ originalDate: values.date, status: 'ok', date: null, startTime: null, endTime: null, updatedAt: now })
          .where(and(eq(occurrenceOverrides.eventId, eventId), eq(occurrenceOverrides.originalDate, event.startDate))).run();
      }
      tx.delete(eventTypeUsage).where(eq(eventTypeUsage.eventId, eventId)).run();
      if (values.typeId) tx.insert(eventTypeUsage).values({ eventId, eventTypeId: values.typeId }).run();
      return saved;
    });
  }
  // Single release: date/time become a move override; access/points/cover are per-release settings.
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются поля настроек выпуска.');
  const raw = input as Record<string, unknown>;
  if (external && ['title','description','url','venue','typeId','repeatRule'].some(key => raw[key] !== undefined)) {
    throw new HttpError(409, 'Внешнее событие меняется в календаре-источнике.');
  }
  const string = (key: string, max: number, fallback = '') => {
    const value = raw[key] ?? fallback;
    if (typeof value !== 'string' || value.length > max) throw new HttpError(422, `Проверьте поле «${key}».`);
    return value.trim();
  };
  const existing = db.select().from(occurrenceOverrides)
    .where(and(eq(occurrenceOverrides.eventId, eventId), eq(occurrenceOverrides.originalDate, date))).get();
  const newDate = string('date', 10) || null;
  if (newDate && (!DATE.test(newDate) || Number.isNaN(Date.parse(`${newDate}T12:00:00`)))) throw new HttpError(422, 'Проверьте дату выпуска.');
  const start = string('start', 5), end = string('end', 5);
  if ((start && !TIME.test(start)) || (end && !TIME.test(end))) throw new HttpError(422, 'Проверьте время выпуска.');
  if (start && end && end === start) throw new HttpError(422, 'Начало и конец не должны совпадать.');
  const currentStart = existing?.startTime ?? event.startTime;
  const currentEnd = existing?.endTime ?? event.endTime;
  if (external && ((newDate && newDate !== date) || (start && start !== currentStart) || (end && end !== currentEnd))) {
    throw new HttpError(409, 'Дата и время внешнего события меняются в календаре-источнике.');
  }
  const accessLabel = raw.accessLabel === undefined ? undefined : string('accessLabel', 120);
  // null explicitly removes the cover; empty string restores type inheritance.
  const coverPath = raw.coverPath === undefined ? undefined : raw.coverPath === null ? '' : string('coverPath', 160) || null;
  if (coverPath && !validCover(coverPath)) throw new HttpError(422, 'Выберите доступную обложку.');
  const appearance = raw.appearance === undefined ? undefined : validateAppearance(raw.appearance);
  const points = raw.points === undefined ? undefined : raw.points;
  if (points !== undefined && points !== null && (typeof points !== 'number' || !Number.isSafeInteger(points) || points < 0)) throw new HttpError(422, 'Баллы должны быть целым неотрицательным числом.');
  const moved = Boolean((newDate && newDate !== date) || start || end);
  const targetDate = newDate ?? date;
  if (!moved && accessLabel === undefined && coverPath === undefined && points === undefined && appearance === undefined && !existing) {
    return event; // nothing to store
  }
  const status = moved ? 'moved' : (existing?.status ?? 'ok');
  const values = {
    status,
    date: moved ? targetDate : (status === 'ok' ? null : existing?.date ?? null),
    startTime: moved ? (start || existing?.startTime || event.startTime) : existing?.startTime ?? null,
    endTime: moved ? (end || existing?.endTime || event.endTime) : existing?.endTime ?? null,
    coverPath: coverPath === undefined ? (existing?.coverPath ?? null) : coverPath,
    appearance: appearance === undefined ? (existing?.appearance ?? null) : appearance,
    accessLabel: accessLabel === undefined ? (existing?.accessLabel ?? null) : accessLabel || null,
    points: points === undefined ? (existing?.points ?? null) : points,
    updatedAt: now,
  };
  db.insert(occurrenceOverrides).values({ eventId, originalDate: date, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [occurrenceOverrides.eventId, occurrenceOverrides.originalDate], set: values }).run();
  return getEvent(eventId);
}

// Assign a type to any event (works for external ones too — the type is ours,
// sync never detaches it). Used by the recognition review queue and the access screen.
export function setEventType(eventId: string, typeId: string | null) {
  const db = getDb(), now = new Date();
  const event = getEvent(eventId);
  if (typeId && !db.select({ id: eventTypes.id }).from(eventTypes).where(eq(eventTypes.id, typeId)).get()) {
    throw new HttpError(422, 'Выбранный тип события не найден.');
  }
  db.transaction(tx => {
    tx.update(events).set({ typeId, updatedAt: now }).where(eq(events.id, eventId)).run();
    tx.delete(eventTypeUsage).where(eq(eventTypeUsage.eventId, eventId)).run();
    if (typeId) tx.insert(eventTypeUsage).values({ eventId, eventTypeId: typeId }).run();
  });
  return event;
}

export function deleteEvent(id: string) {  const { eventId, date } = parseOccurrenceId(id);
  const event = getEvent(eventId);
  if (event.source !== 'manual') throw new HttpError(409, 'Внешнее событие удаляется в календаре-источнике.');
  const db = getDb(), now = new Date();
  if (!date) {
    return db.transaction(tx => {
      tx.delete(eventTypeUsage).where(eq(eventTypeUsage.eventId, eventId)).run();
      tx.delete(events).where(eq(events.id, eventId)).run();
      return { ok: true };
    });
  }
  if (!parseRule(event.repeatRule)) throw new HttpError(422, 'У события без повторов нет отдельных выпусков.');
  db.insert(occurrenceOverrides).values({
    eventId, originalDate: date, status: 'cancelled', date: null, startTime: null, endTime: null,
    coverPath: null, accessLabel: null, points: null, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [occurrenceOverrides.eventId, occurrenceOverrides.originalDate],
    set: { status: 'cancelled', date: null, startTime: null, endTime: null, updatedAt: now },
  }).run();
  return { ok: true };
}

export function upcomingWindow() {
  const from = new Date();
  from.setDate(from.getDate() - 62);
  const to = new Date();
  to.setDate(to.getDate() + 186);
  const fmt = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { from: fmt(from), to: fmt(to) };
}
