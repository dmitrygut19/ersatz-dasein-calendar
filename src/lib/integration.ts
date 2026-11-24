// Integration state machine and external import (Google via OAuth, Yandex via CalDAV).
// One external source row at a time; connecting another provider replaces the previous one.
// Import rules: upsert by external id (no duplicates), skip-status matches expire on the next
// sync, manual events are never overwritten silently — matches wait for an explicit decision.
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, importGeneration } from './db';
import { calendarSettings, events, eventTypeUsage, externalSources, importMatches, occurrenceOverrides } from './db/schema';
import { HttpError } from './http';
import { authUrl, exchangeCode, listCalendars, listEvents, refreshAccessToken, requireGoogle, type ExternalEvent, type GoogleTokens } from './google';
import { fetchYandexEvents, validateCreds, type YandexCreds } from './caldav';
import { refreshSuggestions, clearSkips } from './recognition';
import { syncSchedulerStatus } from './sync-scheduler';
import { fetchICalFeed, validateFeedUrl, type FeedProvider } from './ical-feed';
import { externalEventDefault, type ExternalEventDefault } from './external-event-defaults';
import { lockedFeedUrl } from './deployment-mode';

const SYNC_BACK_MS = 190 * 24 * 3600 * 1000;
const SYNC_FORWARD_MS = 370 * 24 * 3600 * 1000;

function setting(key: string) {
  return getDb().select().from(calendarSettings).where(eq(calendarSettings.key, key)).get()?.value ?? null;
}
function setSetting(key: string, value: string | null) {
  const db = getDb();
  if (value === null) db.delete(calendarSettings).where(eq(calendarSettings.key, key)).run();
  else db.insert(calendarSettings).values({ key, value }).onConflictDoUpdate({ target: calendarSettings.key, set: { value } }).run();
}

function sourceRow() {
  return getDb().select().from(externalSources).all().at(0) ?? null;
}

export function getStatus() {
  const source = sourceRow();
  const pendingMatches = getDb().select().from(importMatches).all().filter(match => match.status === 'pending').length;
  const state = source ? source.status : (setting('manual_mode') === '1' ? 'manual' : 'none');
  return {
    state,
    provider: source?.provider ?? 'google',
    calendarSummary: source?.calendarSummary ?? '',
    lastSyncAt: source?.lastSyncAt ?? null,
    lastSyncError: source?.lastSyncError ?? null,
    pendingMatches,
    scheduler: syncSchedulerStatus(),
    connectionMethod: source?.calendarId.startsWith('ical:') ? 'ical' : source?.provider === 'yandex' ? 'caldav' : 'oauth',
  };
}

export type IntegrationStatus = ReturnType<typeof getStatus>;
export type Provider = 'google' | 'yandex';

export async function connectICal(provider: FeedProvider, value: unknown) {
  const db = getDb(), generation = importGeneration(db);
  const url = validateFeedUrl(value, provider);
  if (lockedFeedUrl() && url !== lockedFeedUrl()) throw new HttpError(422, 'Этот общий стенд подключён к публичному календарю сообщества. Личный источник здесь подключать нельзя.');
  // Check the new feed before replacing a working connection.
  const probe = await fetchICalFeed(url, provider, new Date(Date.now() - SYNC_BACK_MS), new Date(Date.now() + SYNC_FORWARD_MS));
  if (importGeneration(db) !== generation) throw new HttpError(409, 'Временное подключение сброшено при обновлении страницы. Подключите календарь заново.');
  saveSource(provider, probe.key, probe.calendarSummary, { feedUrl: url });
  return syncNow(probe.events);
}

export function startConnect(origin: string) {
  if (lockedFeedUrl()) throw new HttpError(422, 'На общем стенде используется публичный iCal календаря сообщества.');
  requireGoogle();
  const state = randomBytes(16).toString('hex');
  setSetting('oauth_state', state);
  setSetting('oauth_state_expires', String(Date.now() + 10 * 60_000));
  return { authUrl: authUrl(origin, state) };
}

export async function finishConnect(code: string, state: string, origin: string) {
  requireGoogle();
  if (!state || setting('oauth_state') !== state) throw new HttpError(400, 'Подтверждение не совпадает с начатым подключением. Начните заново.');
  const expires = Number(setting('oauth_state_expires'));
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new HttpError(400, 'Время подключения истекло. Начните заново.');
  setSetting('oauth_state', null);
  setSetting('oauth_state_expires', null);
  const tokens = await exchangeCode(code, origin);
  const calendars = await listCalendars(tokens);
  const primary = calendars.find(calendar => calendar.primary) ?? calendars[0];
  if (!primary) throw new HttpError(502, 'В Google-аккаунте нет доступных календарей.');
  saveSource('google', primary.id, primary.summary, tokens as unknown as Record<string, unknown>);
  try {
    await syncNow();
  } catch {
    // A failed first sync must not block entry: status 'error' with intact tokens invites a retry.
  }
  return getStatus();
}

export async function connectYandex(input: unknown) {
  if (lockedFeedUrl()) throw new HttpError(422, 'На общем стенде используется публичный iCal календаря сообщества.');
  const creds = validateCreds(input);
  // Validate the credentials and discover the calendar before storing anything.
  const probe = await fetchYandexEvents(creds, new Date(Date.now() - 24 * 3600 * 1000), new Date(Date.now() + 48 * 3600 * 1000));
  saveSource('yandex', creds.login, probe.calendarSummary, creds as unknown as Record<string, unknown>);
  try {
    await syncNow();
  } catch {
    // Same rule as Google: a failed first sync keeps the entry open with a retry.
  }
  return getStatus();
}

function saveSource(provider: Provider, calendarId: string, calendarSummary: string, tokens: Record<string, unknown>) {
  const db = getDb(), now = new Date();
  const previous = sourceRow();
  db.transaction(tx => {
    tx.delete(externalSources).run();
    if (!previous || previous.provider !== provider || previous.calendarId !== calendarId) tx.delete(importMatches).run();
    tx.insert(externalSources).values({
      id: randomUUID(), provider, calendarId, calendarSummary,
      status: 'connected', tokens: JSON.stringify(tokens), createdAt: now, updatedAt: now,
    }).run();
  });
}

function parseTokens(raw: string): GoogleTokens {
  try { return JSON.parse(raw) as GoogleTokens; } catch { return { accessToken: '', refreshToken: null, expiresAt: null }; }
}

export function disconnect() {
  const db = getDb();
  // Imported events stay in the product (decision); only the connection and tokens go away.
  db.delete(externalSources).run();
  db.delete(importMatches).where(eq(importMatches.status, 'skip')).run();
  setSetting('manual_mode', '1');
  return getStatus();
}
export function setManualMode() { setSetting('manual_mode', '1'); return getStatus(); }

const normalize = (value: string) => value.toLowerCase().replace(/[«»"']/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
function titlesMatch(a: string, b: string) {
  const left = normalize(a), right = normalize(b);
  return left === right || (left.length >= 4 && right.includes(left)) || (right.length >= 4 && left.includes(right));
}

const syncs = new Map<string, Promise<IntegrationStatus>>();
export function syncNow(preloaded?: ExternalEvent[]): Promise<IntegrationStatus> {
  const id = sourceRow()?.id;
  if (!id) return Promise.reject(new HttpError(409, 'Внешний календарь не подключён.'));
  const active = syncs.get(id);
  if (active) return active;
  const pending = runSync(preloaded).finally(() => syncs.delete(id));
  syncs.set(id, pending);
  return pending;
}

async function runSync(preloaded?: ExternalEvent[]) {
  const source = sourceRow();
  if (!source) throw new HttpError(409, 'Внешний календарь не подключён.');
  const db = getDb(), now = new Date(), provider = source.provider as Provider;
  const timeMin = new Date(Date.now() - SYNC_BACK_MS);
  const timeMax = new Date(Date.now() + SYNC_FORWARD_MS);
  let incoming: ExternalEvent[] = [];
  let storedTokens = source.tokens;
  db.update(externalSources).set({ status: 'syncing', updatedAt: now }).where(eq(externalSources.id, source.id)).run();
  try {
    if (source.calendarId.startsWith('ical:')) {
      const { feedUrl } = JSON.parse(source.tokens || '{}') as { feedUrl?: string };
      const feedEvents = preloaded ?? (await fetchICalFeed(feedUrl, provider, timeMin, timeMax)).events;
      incoming = feedEvents.map(event => ({ ...event, externalId: `${source.calendarId}:${event.externalId}` }));
    } else if (provider === 'yandex') {
      const creds = JSON.parse(source.tokens || '{}') as YandexCreds;
      const fetched = await fetchYandexEvents(creds, timeMin, timeMax);
      incoming = fetched.events;
    } else {
      let tokens = parseTokens(source.tokens);
      if (!tokens.accessToken) throw new HttpError(409, 'Подключение не содержит токена. Подключите календарь заново.');
      if (tokens.expiresAt && tokens.expiresAt < Date.now() + 60_000) {
        tokens = await refreshAccessToken(tokens);
      }
      storedTokens = JSON.stringify(tokens);
      incoming = await listEvents(tokens, source.calendarId || 'primary', timeMin, timeMax);
    }
    if (sourceRow()?.id !== source.id) throw new HttpError(409, 'Подключение изменилось во время обновления. Повторите обновление текущего календаря.');
    upsertIncoming(incoming, provider, timeMin, timeMax, source.calendarId.startsWith('ical:') ? source.calendarId : provider);
    db.update(externalSources).set({ tokens: storedTokens, status: 'connected', lastSyncAt: now, lastSyncError: null, updatedAt: now }).where(eq(externalSources.id, source.id)).run();
  } catch (error) {
    db.update(externalSources).set({ status: 'error', lastSyncError: error instanceof Error ? error.message : 'Синхронизация не удалась.', updatedAt: now }).where(eq(externalSources.id, source.id)).run();
    throw error instanceof HttpError ? error : new HttpError(502, 'Синхронизация не удалась. Сохранённые данные не изменены.');
  }
  setSetting('manual_mode', null);
  clearSkips();
  refreshSuggestions();
  return getStatus();
}

function upsertIncoming(incoming: ExternalEvent[], provider: Provider, timeMin: Date, timeMax: Date, calendarId: string) {
  const db = getDb(), now = new Date();
  const defaults = JSON.parse(setting('external_event_defaults') ?? '[]') as ExternalEventDefault[];
  const matches = new Map(db.select().from(importMatches).all().map(match => [match.externalId, match]));
  // A skip decision lives only until the next import.
  db.delete(importMatches).where(eq(importMatches.status, 'skip')).run();
  const manual = db.select().from(events).where(eq(events.source, 'manual')).all();
  const seen = new Set<string>();
  db.transaction(tx => {
    for (const item of incoming) {
      const assigned = externalEventDefault(defaults, calendarId, item.externalId);
      const newId = randomUUID();
      seen.add(item.externalId);
      const existing = tx.select().from(events).where(eq(events.externalId, item.externalId)).get();
      if (existing) {
        // Each imported occurrence is stored as one event. Keep its internal settings
        // when the source moves it to a new date.
        if (existing.startDate !== item.date) {
          const old = and(eq(occurrenceOverrides.eventId, existing.id), eq(occurrenceOverrides.originalDate, existing.startDate));
          if (tx.select().from(occurrenceOverrides).where(old).get()) {
            tx.delete(occurrenceOverrides).where(and(eq(occurrenceOverrides.eventId, existing.id), eq(occurrenceOverrides.originalDate, item.date))).run();
            tx.update(occurrenceOverrides).set({ originalDate: item.date, updatedAt: now }).where(old).run();
          }
        }
        tx.update(events).set({
          title: item.title, description: item.description, url: item.url, venue: item.venue,
          sourceMetadata: { sourceUrl: item.sourceUrl, allDay: item.allDay, endDate: item.endDate, noEnd: item.noEnd },
          startDate: item.date, startTime: item.start, endTime: item.end, status: item.status, updatedAt: now,
        }).where(eq(events.id, existing.id)).run();
        continue;
      }
      const match = matches.get(item.externalId);
      if (match?.status === 'pending') continue; // waits for an explicit decision
      if (match?.status === 'import') {
        tx.insert(events).values({
          typeId: assigned?.typeId, settings: assigned?.settings,
          id: newId, title: item.title, description: item.description, url: item.url, venue: item.venue,
          sourceMetadata: { sourceUrl: item.sourceUrl, allDay: item.allDay, endDate: item.endDate, noEnd: item.noEnd },
          startDate: item.date, startTime: item.start, endTime: item.end,
          source: provider, externalId: item.externalId, externalCalendarId: calendarId,
          status: item.status, createdAt: now, updatedAt: now,
        }).run();
        if (assigned) tx.insert(eventTypeUsage).values({ eventId: newId, eventTypeId: assigned.typeId }).run();
        tx.delete(importMatches).where(eq(importMatches.externalId, item.externalId)).run();
        continue;
      }
      const linked = match?.status === 'link'
        ? tx.select().from(events).where(eq(events.id, match.manualEventId)).get()
        : undefined;
      if (match && !linked) continue;
      if (linked) {
        // Link: the external object becomes the schedule owner of the manual event.
        tx.update(events).set({
          source: provider, externalId: item.externalId, externalCalendarId: calendarId,
          title: item.title, description: item.description, url: item.url, venue: item.venue,
          sourceMetadata: { sourceUrl: item.sourceUrl, allDay: item.allDay, endDate: item.endDate, noEnd: item.noEnd },
          startDate: item.date, startTime: item.start, endTime: item.end, status: item.status, updatedAt: now,
        }).where(eq(events.id, linked.id)).run();
        tx.delete(importMatches).where(eq(importMatches.externalId, item.externalId)).run();
        continue;
      }
      const candidate = manual.find(event => event.startDate === item.date && titlesMatch(event.title, item.title));
      if (candidate) {
        tx.insert(importMatches).values({
          externalId: item.externalId, externalTitle: item.title, externalDate: item.date,
          externalStart: item.start, externalEnd: item.end, manualEventId: candidate.id,
          status: 'pending', createdAt: now, updatedAt: now,
        }).onConflictDoNothing().run();
        continue;
      }
      tx.insert(events).values({
        typeId: assigned?.typeId, settings: assigned?.settings,
        id: newId, title: item.title, description: item.description, url: item.url, venue: item.venue,
          sourceMetadata: { sourceUrl: item.sourceUrl, allDay: item.allDay, endDate: item.endDate, noEnd: item.noEnd },
        startDate: item.date, startTime: item.start, endTime: item.end,
        source: provider, externalId: item.externalId, externalCalendarId: calendarId,
        status: item.status, createdAt: now, updatedAt: now,
      }).run();
      if (assigned) tx.insert(eventTypeUsage).values({ eventId: newId, eventTypeId: assigned.typeId }).run();
    }
    // External events missing from the fetched window are treated as cancelled there.
    const from = timeMin.toISOString().slice(0, 10), to = timeMax.toISOString().slice(0, 10);
    for (const row of tx.select().from(events).where(eq(events.source, provider)).all()) {
      if (row.externalCalendarId === calendarId && row.startDate >= from && row.startDate <= to && row.externalId && !seen.has(row.externalId) && row.status !== 'cancelled') {
        tx.update(events).set({ status: 'cancelled', updatedAt: now }).where(eq(events.id, row.id)).run();
      }
    }
  });
}

export function listMatchItems() {
  const db = getDb();
  const rows = db.select().from(importMatches).all();
  const manual = new Map(db.select().from(events).all().map(event => [event.id, event]));
  return rows
    .filter(row => row.status === 'pending')
    .map(row => ({
      externalId: row.externalId, externalTitle: row.externalTitle, externalDate: row.externalDate,
      externalStart: row.externalStart, externalEnd: row.externalEnd,
      manualEventId: row.manualEventId,
      manualTitle: manual.get(row.manualEventId)?.title ?? 'Событие удалено',
      manualDate: manual.get(row.manualEventId)?.startDate ?? '',
    }))
    .sort((a, b) => a.externalDate.localeCompare(b.externalDate));
}

export function resolveMatch(externalId: string, action: 'link' | 'import' | 'skip') {
  const db = getDb(), now = new Date();
  const match = db.select().from(importMatches).where(eq(importMatches.externalId, externalId)).get();
  if (!match) throw new HttpError(404, 'Этот вариант совпадения уже разобран.');
  if (action === 'skip') {
    db.update(importMatches).set({ status: 'skip', updatedAt: now }).where(eq(importMatches.externalId, externalId)).run();
  } else if (action === 'link' || action === 'import') {
    // The actual merge/import happens inside the next sync, which owns the transaction.
    db.update(importMatches).set({ status: action, updatedAt: now }).where(eq(importMatches.externalId, externalId)).run();
  } else {
    throw new HttpError(422, 'Выберите действие: связать, импортировать отдельно или пропустить.');
  }
  return { ok: true, status: getStatus() };
}
