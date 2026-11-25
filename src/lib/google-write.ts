// Write-back of event fields to the source Google Calendar through a service account.
// The iCal feed is read-only, so edits go through the Calendar API; the calendar owner
// must share the calendar with the service account ("Make changes to events").
// No extra dependency: the service-account JWT is signed with node:crypto.
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { HttpError } from './http';
import { adminOpen } from './deployment-mode';

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };
type GoogleEvent = { id: string; status?: string; recurringEventId?: string; recurrence?: string[]; start?: GoogleTime; end?: GoogleTime; originalStartTime?: GoogleTime };

export type ScheduleChanges = { title?: string; description?: string; url?: string; date?: string; start?: string; end?: string };
export const SCHEDULE_KEYS = ['title', 'description', 'url', 'date', 'start', 'end'] as const;

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = () => process.env.CALENDAR_TIMEZONE || 'Europe/Moscow';

function serviceAccount(): ServiceAccount | null {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (file && existsSync(file) ? readFileSync(file, 'utf8') : '');
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ServiceAccount>;
    return typeof value.client_email === 'string' && typeof value.private_key === 'string' ? value as ServiceAccount : null;
  } catch { return null; }
}

/** Calendar ID from a Google iCal URL: /calendar/ical/<id>/(public|private-…)/basic.ics */
export function calendarIdFromFeed(url: string | undefined | null) {
  const match = url?.match(/\/calendar\/ical\/([^/]+)\/(?:public|private-[^/]+)\/[^/]+\.ics(?:$|\?)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function googleWriteStatus(feedUrl?: string | null) {
  const account = serviceAccount();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || calendarIdFromFeed(feedUrl);
  if (!account) return { enabled: false as const, reason: 'Запись в Google не настроена: нет ключа сервисного аккаунта (GOOGLE_SERVICE_ACCOUNT_FILE).' };
  if (!calendarId) return { enabled: false as const, reason: 'Не удалось определить календарь Google по ссылке iCal (задайте GOOGLE_CALENDAR_ID).' };
  if (adminOpen()) return { enabled: false as const, reason: 'Запись в Google включается только при закрытой админке (CALENDAR_ADMIN_OPEN=0).' };
  return { enabled: true as const, reason: null, calendarId, account: account.client_email };
}

let cachedToken: { token: string; expires: number; email: string } | null = null;
async function accessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.email === account.client_email && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 })}`;
  let signature: string;
  try { signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url'); }
  catch { throw new HttpError(500, 'Ключ сервисного аккаунта Google повреждён.'); }
  const response = await fetch(tokenUri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response?.ok) throw new HttpError(502, 'Google не выдал доступ сервисному аккаунту. Проверьте ключ и что Calendar API включён.');
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new HttpError(502, 'Google не выдал доступ сервисному аккаунту.');
  cachedToken = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000, email: account.client_email };
  return cachedToken.token;
}

async function google<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const account = serviceAccount();
  if (!account) throw new HttpError(409, 'Запись в Google не настроена.');
  const response = await fetch(API + path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) throw new HttpError(502, 'Google Календарь не ответил. Изменения не сохранены.');
  if (response.status === 403 || response.status === 401) throw new HttpError(403, 'Нет прав на изменение календаря Google: владелец должен выдать сервисному аккаунту право «Вносить изменения в мероприятия».');
  if (response.status === 404) throw new HttpError(404, 'Событие не найдено в Google Календаре. Обновите календарь и попробуйте снова.');
  if (!response.ok) throw new HttpError(502, 'Google Календарь отклонил изменение. Изменения не сохранены.');
  return await response.json() as T;
}

/** Local import id "<uid>" or "<uid>@YYYY-MM-DD" (recurring instance keyed by its original date). */
export function parseImportId(localId: string) {
  const match = localId.match(/^(.*)@(\d{4}-\d{2}-\d{2})$/);
  return match ? { uid: match[1], originalDate: match[2] } : { uid: localId, originalDate: null };
}

const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayOf = (time?: GoogleTime) => time?.date ?? time?.dateTime?.slice(0, 10) ?? null;

async function findEvent(calendarId: string, uid: string, originalDate: string | null, series: boolean): Promise<GoogleEvent> {
  const cal = encodeURIComponent(calendarId);
  const found = await google<{ items?: GoogleEvent[] }>(`/calendars/${cal}/events?iCalUID=${encodeURIComponent(uid)}&showDeleted=false&maxResults=50`);
  const items = (found.items ?? []).filter(item => item.status !== 'cancelled');
  const master = items.find(item => item.recurrence?.length) ?? items.find(item => !item.recurringEventId) ?? items[0];
  if (!master) throw new HttpError(404, 'Событие не найдено в Google Календаре. Обновите календарь и попробуйте снова.');
  if (series || !originalDate || !master.recurrence?.length) return master;
  const timeMin = `${shiftDay(originalDate, -2)}T00:00:00Z`, timeMax = `${shiftDay(originalDate, 3)}T00:00:00Z`;
  const instances = await google<{ items?: GoogleEvent[] }>(`/calendars/${cal}/events/${encodeURIComponent(master.id)}/instances?timeMin=${timeMin}&timeMax=${timeMax}&showDeleted=false`);
  const instance = (instances.items ?? []).find(item => dayOf(item.originalStartTime) === originalDate)
    ?? items.find(item => item.recurringEventId && dayOf(item.originalStartTime) === originalDate);
  if (!instance) throw new HttpError(404, 'Выпуск не найден в Google Календаре. Обновите календарь и попробуйте снова.');
  return instance;
}

/** Writes the changed fields to Google. Returns whether the event stays all-day. */
export async function writeGoogleEvent(feedUrl: string | null, localId: string, scope: 'occurrence' | 'series', changes: ScheduleChanges,
  current: { date: string; start: string; end: string; allDay: boolean; endDate?: string | null }) {
  const status = googleWriteStatus(feedUrl);
  if (!status.enabled) throw new HttpError(409, status.reason);
  const { uid, originalDate } = parseImportId(localId);
  const timeChange = 'date' in changes || 'start' in changes || 'end' in changes;
  if (scope === 'series' && timeChange) throw new HttpError(422, 'Дату и время меняйте для отдельного выпуска или в самом Google Календаре.');
  const target = await findEvent(status.calendarId, uid, originalDate, scope === 'series');
  const patch: Record<string, unknown> = {};
  if ('title' in changes) patch.summary = changes.title;
  if ('description' in changes) patch.description = changes.description;
  if ('url' in changes) patch.location = changes.url;
  let allDay = current.allDay;
  if (timeChange) {
    const date = changes.date ?? current.date, start = changes.start ?? current.start, end = changes.end ?? current.end;
    allDay = current.allDay && start === '00:00' && end === '00:00';
    if (allDay) {
      const span = current.endDate ? Math.max(1, Math.round((Date.parse(`${current.endDate}T12:00:00Z`) - Date.parse(`${current.date}T12:00:00Z`)) / 86_400_000)) : 1;
      patch.start = { date }; patch.end = { date: shiftDay(date, span) };
    } else {
      const endDate = end <= start ? shiftDay(date, 1) : date;
      patch.start = { dateTime: `${date}T${start}:00`, timeZone: TIMEZONE() };
      patch.end = { dateTime: `${endDate}T${end}:00`, timeZone: TIMEZONE() };
    }
  }
  if (!Object.keys(patch).length) return { allDay };
  await google(`/calendars/${encodeURIComponent(status.calendarId)}/events/${encodeURIComponent(target.id)}?sendUpdates=none`, { method: 'PATCH', body: patch });
  return { allDay };
}
