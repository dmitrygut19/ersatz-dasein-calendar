import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { eventTypes, eventTypeUsage } from './db/schema';
import { HttpError } from './http';
import { validateAppearance } from './appearance';
import { validCover } from './covers';

export const covers = ['/assets/panel/a5ff5.png', '/assets/panel/2a38c.png', '/assets/panel/6713c.png'];
// Limits and enums retained from calendar-app/src/lib/event-types.ts.
export function validate(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются поля типа события.');
  const raw = input as Record<string, unknown>;
  const string = (key: string, max: number, fallback = '') => {
    const value = raw[key] ?? fallback;
    if (typeof value !== 'string' || value.length > max) throw new HttpError(422, `Проверьте поле «${key}».`);
    return value.trim();
  };
  const name = string('name', 80);
  if (!name) throw new HttpError(422, 'Введите название типа.');
  const tier = string('tier', 3), degree = string('degree', 3);
  if (![tier, degree].every(x => ['', 'I', 'II', 'III'].includes(x))) throw new HttpError(422, 'Выберите допустимый тир и градус.');
  const points = raw.points ?? null;
  if (points !== null && (typeof points !== 'number' || !Number.isSafeInteger(points) || points < 0)) {
    throw new HttpError(422, 'Баллы должны быть целым неотрицательным числом.');
  }
  const theme = string('theme', 20, 'ordinary');
  if (!['ordinary', 'arena', 'saturnalia'].includes(theme)) throw new HttpError(422, 'Выберите тему оформления.');
  const venue = string('venue', 120);
  if (!['', 'Discord', 'YouTube', 'Jitsi'].includes(venue)) throw new HttpError(422, 'Выберите площадку: Discord, YouTube или Jitsi.');
  const venueUrl = string('venueUrl', 300);
  if (venueUrl && !/^https?:\/\//.test(venueUrl)) throw new HttpError(422, 'Введите ссылку на площадку, начинающуюся с https:// или http://.');
  const coverPath = string('coverPath', 160);
  if (coverPath && !validCover(coverPath)) throw new HttpError(422, 'Выберите доступную обложку или загрузите изображение.');
  const appearance = raw.appearance === undefined ? undefined : validateAppearance(raw.appearance);
  if (appearance && appearance.theme !== theme) throw new HttpError(422, 'Тема не совпадает с оформлением.');
  return { name, tier: tier || null, degree: degree || null, points, theme, coverPath: coverPath || null,
    recognitionWords: string('recognitionWords', 240), accessLabel: string('accessLabel', 120), venue, venueUrl,
    ...(appearance === undefined ? {} : { appearance }) };
}

export function listTypes() {
  const db = getDb();
  const usages = new Set(db.select().from(eventTypeUsage).all().map(x => x.eventTypeId));
  return db.select().from(eventTypes).orderBy(asc(eventTypes.createdAt), asc(eventTypes.id)).all()
    .map(type => ({ ...type, inUse: usages.has(type.id) }));
}
export function saveType(input: unknown, id?: string) {
  const values = validate(input), db = getDb(), now = new Date();
  if (id) {
    const saved = db.update(eventTypes).set({ ...values, updatedAt: now }).where(eq(eventTypes.id, id)).returning().get();
    if (!saved) throw new HttpError(404, 'Тип события уже удалён или не найден.');
    return saved;
  }
  return db.insert(eventTypes).values({ ...values, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get()!;
}
export function deleteType(id: string) {
  return getDb().transaction(tx => {
    if (!tx.select().from(eventTypes).where(eq(eventTypes.id, id)).get()) throw new HttpError(404, 'Тип события не найден.');
    if (tx.select().from(eventTypeUsage).where(eq(eventTypeUsage.eventTypeId, id)).get()) {
      throw new HttpError(409, 'На этот тип ссылается событие. Сначала переназначьте его на другой тип.');
    }
    tx.delete(eventTypes).where(eq(eventTypes.id, id)).run();
    return { ok: true };
  });
}
