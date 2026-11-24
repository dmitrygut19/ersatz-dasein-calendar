import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { events, eventTypes, eventTypeUsage, calendarSettings, typeSuggestions } from './db/schema';
import { externalSeriesId, type ExternalEventDefault } from './external-event-defaults';
import { HttpError } from './http';

// Only explicitly submitted, still-untyped records are changed. No title matching.
export function assignUntypedEvents(raw: unknown) {
  const body = raw as { eventIds?: unknown; typeId?: unknown };
  if (!Array.isArray(body?.eventIds) || !body.eventIds.length || body.eventIds.length > 1000 || body.eventIds.some(id => typeof id !== 'string' || !id)) throw new HttpError(422, 'Укажите события без типа.');
  if (typeof body.typeId !== 'string' || !body.typeId) throw new HttpError(422, 'Выберите тип.');
  const ids = [...new Set(body.eventIds as string[])], typeId = body.typeId;
  const db = getDb();
  if (!db.select().from(eventTypes).where(eq(eventTypes.id, typeId)).get()) throw new HttpError(422, 'Выбранный тип события не найден.');
  return db.transaction(tx => {
    const rows = ids.map(id => tx.select().from(events).where(eq(events.id,id)).get());
    if (rows.some(row => !row)) throw new HttpError(404, 'Одно из событий больше не существует. Обновите список.');
    const setting = tx.select().from(calendarSettings).where(eq(calendarSettings.key,'external_event_defaults')).get();
    const rules = JSON.parse(setting?.value ?? '[]') as ExternalEventDefault[];
    const now = new Date(); let assigned = 0, rulesChanged = false;
    for (const row of rows) {
      if (!row || row.typeId) continue;
      tx.update(events).set({typeId,updatedAt:now}).where(eq(events.id,row.id)).run();
      tx.delete(eventTypeUsage).where(eq(eventTypeUsage.eventId,row.id)).run();
      tx.insert(eventTypeUsage).values({eventId:row.id,eventTypeId:typeId}).run();
      tx.delete(typeSuggestions).where(eq(typeSuggestions.eventId,row.id)).run();
      assigned++;
      if (row.source !== 'manual' && row.externalCalendarId?.startsWith('ical:') && row.externalId) {
        const seriesId = externalSeriesId(row.externalId);
        const rule = rules.find(item => item.calendarId === row.externalCalendarId && item.seriesId === seriesId);
        if (rule) rule.typeId = typeId;
        else rules.push({calendarId:row.externalCalendarId,seriesId,typeId,settings:{}});
        rulesChanged = true;
      }
    }
    if (rulesChanged) tx.insert(calendarSettings).values({key:'external_event_defaults',value:JSON.stringify(rules)}).onConflictDoUpdate({target:calendarSettings.key,set:{value:JSON.stringify(rules)}}).run();
    return {assigned};
  });
}
