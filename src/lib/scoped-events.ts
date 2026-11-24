import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { events, occurrenceOverrides, lodges, eventTypes } from './db/schema';
import { getOccurrence, parseOccurrenceId } from './events';
import { HttpError } from './http';
import { validateAppearance } from './appearance';
import { validCover } from './covers';
import { shiftDate, validDate, normalizedAppearance, type EventSettings } from './event-settings';

export function validateSettings(raw: Record<string, unknown>): EventSettings {
  const result: EventSettings = {};
  for (const key of ['allowedDegrees', 'affiliationDegrees'] as const) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value !== null && (!Array.isArray(value) || !value.length || value.some(degree => !['I','II','III'].includes(degree)))) throw new HttpError(422, 'Укажите точные градусы I–III или наследование.');
    result[key] = value === null ? null : [...new Set(value as string[])];
  }
  if ('requiresAuth' in raw) {
    if (typeof raw.requiresAuth !== 'boolean') throw new HttpError(422, 'Проверьте необходимость авторизации.');
    result.requiresAuth = raw.requiresAuth;
  }
  if ('affiliationDegree' in raw) {
    if (![null, '', 'I', 'II', 'III'].includes(raw.affiliationDegree as string | null)) throw new HttpError(422, 'Выберите градус принадлежности I–III или без градуса.');
    result.affiliationDegree = raw.affiliationDegree as string || null;
  }
  if ('communityEvent' in raw) {
    if (typeof raw.communityEvent !== 'boolean') throw new HttpError(422, 'Проверьте общую принадлежность события.');
    result.communityEvent = raw.communityEvent;
  }
  if ('degree' in raw) {
    if (![null, '', 'I', 'II', 'III'].includes(raw.degree as string | null)) throw new HttpError(422, 'Выберите градус I–III, любой градус или наследование.');
    result.degree = raw.degree as string | null;
  }
  const known = new Set(getDb().select({ id: lodges.id }).from(lodges).all().map(row => row.id));
  if ('topicLodgeId' in raw) {
    if (raw.topicLodgeId !== null && !known.has(raw.topicLodgeId as string)) throw new HttpError(422, 'Тематическая ложа не найдена.');
    result.topicLodgeId = raw.topicLodgeId as string | null;
  }
  if ('audienceLodgeIds' in raw) {
    if (!Array.isArray(raw.audienceLodgeIds) || raw.audienceLodgeIds.some(id => typeof id !== 'string' || !known.has(id))) throw new HttpError(422, 'Проверьте ложи аудитории.');
    result.audienceLodgeIds = [...new Set(raw.audienceLodgeIds as string[])];
  }
  if ('coverPath' in raw) {
    if (raw.coverPath !== null && raw.coverPath !== '' && (typeof raw.coverPath !== 'string' || !validCover(raw.coverPath))) throw new HttpError(422, 'Выберите доступную обложку.');
    result.coverPath = raw.coverPath === null ? '' : raw.coverPath as string || null;
  }
  if ('appearance' in raw) result.appearance = validateAppearance(raw.appearance) ?? null;
  if ('accessLabel' in raw) {
    if (raw.accessLabel !== null && (typeof raw.accessLabel !== 'string' || raw.accessLabel.length > 120)) throw new HttpError(422, 'Проверьте доступ участников.');
    result.accessLabel = raw.accessLabel as string | null || null;
  }
  if ('points' in raw) {
    if (raw.points !== null && (typeof raw.points !== 'number' || !Number.isSafeInteger(raw.points) || raw.points < 0)) throw new HttpError(422, 'Проверьте баллы.');
    result.points = raw.points as number | null;
  }
  return result;
}

// Explicit sparse patch: scope is never inferred from a title or a route suffix.
// Recurrence dates remain stable keys; shifting a series changes its schedule offset.
export function updateScopedEvent(id: string, input: unknown) {
  const raw = input as Record<string, unknown>;
  if (!['occurrence', 'series'].includes(String(raw.scope)) || !raw.changes || typeof raw.changes !== 'object' || Array.isArray(raw.changes)) throw new HttpError(422, 'Выберите область изменения.');
  const patch = raw.changes as Record<string, unknown>;
  const allowed = ['title','description','url','date','start','end','degree','allowedDegrees','affiliationDegree','affiliationDegrees','communityEvent','topicLodgeId','audienceLodgeIds','coverPath','appearance','accessLabel','points'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new HttpError(422, 'Неподдерживаемое поле изменения.');
  const current = getOccurrence(id);
  const { eventId, date: parsedDate } = parseOccurrenceId(id);
  const db = getDb(), now = new Date();
  const event = db.select().from(events).where(eq(events.id, eventId)).get()!;
  const originalDate = parsedDate ?? event.startDate;
  if (event.source !== 'manual' && ['title','description','url','date','start','end'].some(key => key in patch)) throw new HttpError(409, 'Дата, время, описание и ссылка изменяются в календаре-источнике.');
  const settings = validateSettings(patch);
  let appearancePatch: Partial<NonNullable<EventSettings['appearance']>> | null = null;
  if (settings.appearance) {
    const before = normalizedAppearance(current.appearance, current.typeTheme);
    const after = normalizedAppearance(settings.appearance);
    appearancePatch = Object.fromEntries(Object.entries(after).filter(([key,value]) => value !== before[key as keyof typeof before]));
    if (!Object.keys(appearancePatch).length) delete settings.appearance;
  }
  for (const [key, limit] of [['title',120],['description',2000],['url',300]] as const) {
    if (!(key in patch)) continue;
    if (typeof patch[key] !== 'string' || patch[key].length > limit || (key === 'title' && !patch[key].trim())) throw new HttpError(422, `Проверьте поле «${key}».`);
    settings[key] = patch[key].trim();
  }
  if (settings.url && !/^https?:\/\//.test(settings.url)) throw new HttpError(422, 'Введите ссылку http:// или https://.');
  if ('date' in patch && (typeof patch.date !== 'string' || !validDate(patch.date))) throw new HttpError(422, 'Проверьте дату.');
  for (const key of ['start','end']) if (key in patch && (typeof patch[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch[key]))) throw new HttpError(422, 'Проверьте время.');
  // Only a time edit can create a zero interval; all-day imports are stored as 00:00–00:00.
  const timeEdit = 'start' in patch || 'end' in patch;
  if (timeEdit && (patch.start ?? current.start) === (patch.end ?? current.end)) throw new HttpError(422, 'Начало и конец не должны совпадать.');
  if (!Object.keys(patch).length) return event;
  return db.transaction(tx => {
    const overrides = tx.select().from(occurrenceOverrides).where(eq(occurrenceOverrides.eventId, eventId)).all();
    if (raw.scope === 'series') {
      if (timeEdit && (patch.start ?? event.startTime) === (patch.end ?? event.endTime)) throw new HttpError(422, 'Изменение создаёт нулевой интервал серии.');
      const delta = 'date' in patch ? Math.round((Date.parse(`${patch.date}T12:00Z`) - Date.parse(`${current.date}T12:00Z`)) / 86400000) : 0;
      const defaults = { ...event.settings, ...settings };
      if (settings.appearance && appearancePatch) {
        const type = event.typeId ? tx.select().from(eventTypes).where(eq(eventTypes.id,event.typeId)).get() : null;
        defaults.appearance = { ...normalizedAppearance(event.settings?.appearance ?? type?.appearance, type?.theme), ...appearancePatch };
      }
      const metadata: Partial<typeof events.$inferInsert> = {};
      for (const key of ['title','description','url'] as const) if (key in settings) {
        metadata[key] = settings[key]; delete defaults[key];
      }
      if (delta) defaults.dateOffset = (event.settings?.dateOffset ?? 0) + delta;
      // An edit changes only the selected fields; other release customisations survive.
      for (const row of overrides) {
        const individual = { ...row.settings };
        for (const key of Object.keys(settings)) delete individual[key as keyof EventSettings];
        const changed: Partial<typeof occurrenceOverrides.$inferInsert> = { settings: individual, updatedAt: now };
        if (settings.appearance && appearancePatch && row.appearance) changed.appearance = { ...row.appearance, ...appearancePatch };
        if (delta && row.date) changed.date = shiftDate(row.date, delta);
        if ('start' in patch) changed.startTime = patch.start as string;
        if ('end' in patch) changed.endTime = patch.end as string;
        for (const key of ['coverPath','appearance','accessLabel','points'] as const) if (key in settings && (key !== 'appearance' || settings.appearance === null)) Object.assign(changed, { [key]: null });
        const effectiveStart = changed.startTime ?? row.startTime ?? event.startTime;
        const effectiveEnd = changed.endTime ?? row.endTime ?? event.endTime;
        if (timeEdit && effectiveStart === effectiveEnd) throw new HttpError(422, 'Изменение создаёт нулевой интервал одного из выпусков.');
        tx.update(occurrenceOverrides).set(changed).where(and(eq(occurrenceOverrides.eventId,eventId),eq(occurrenceOverrides.originalDate,row.originalDate))).run();
      }
      const saved = tx.update(events).set({ ...metadata, settings: defaults, updatedAt: now,
        ...('start' in patch ? { startTime: patch.start as string } : {}),
        ...('end' in patch ? { endTime: patch.end as string } : {}),
      }).where(eq(events.id,eventId)).returning().get()!;
      return saved;
    }
    const existing = overrides.find(row => row.originalDate === originalDate);
    const schedule = ['date','start','end'].some(key => key in patch);
    const values = { settings: { ...existing?.settings, ...settings }, updatedAt: now,
      ...(schedule ? { status: 'moved', date: (patch.date ?? current.date) as string, startTime: (patch.start ?? current.start) as string, endTime: (patch.end ?? current.end) as string } : {}),
      // Legacy columns own these fields on a release.
      ...('coverPath' in settings ? { coverPath: settings.coverPath } : {}),
      ...('appearance' in settings ? { appearance: settings.appearance } : {}),
      ...('accessLabel' in settings ? { accessLabel: settings.accessLabel } : {}),
      ...('points' in settings ? { points: settings.points } : {}),
    };
    tx.insert(occurrenceOverrides).values({ eventId, originalDate, createdAt: now, ...values }).onConflictDoUpdate({ target: [occurrenceOverrides.eventId,occurrenceOverrides.originalDate], set: values }).run();
    return event;
  });
}
