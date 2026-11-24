// Yandex CalDAV client. Auth is the account login plus an app password
// (Yandex ID → Security → App passwords). Events are parsed from ICS; RRULE
// recurrences are expanded locally into occurrences keyed by uid@date.
import { HttpError } from './http';
import { expandDates, type RepeatRule } from './recurrence';
import type { ExternalEvent } from './google';
import { expandICalDates } from './ical-recurrence';
import { isCalendarSourceUrl, participationUrl } from './participation-url';

const CALDAV_BASE = 'https://caldav.yandex.ru';
export type YandexCreds = { login: string; password: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateCreds(input: unknown): YandexCreds {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Ожидаются логин и пароль приложения.');
  const raw = input as Record<string, unknown>;
  const login = typeof raw.login === 'string' ? raw.login.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password.trim() : '';
  if (!login || login.length > 120) throw new HttpError(422, 'Введите логин Яндекс-аккаунта.');
  if (!password || password.length > 120) throw new HttpError(422, 'Введите пароль приложения (Яндекс ID → Безопасность → Пароли приложений).');
  return { login, password };
}

function auth(creds: YandexCreds) {
  return 'Basic ' + Buffer.from(`${creds.login}:${creds.password}`).toString('base64');
}

async function dav(request: { method: string; path: string; creds: YandexCreds; body?: string; stage: string }) {
  let response: Response;
  try {
    response = await fetch(`${CALDAV_BASE}${request.path}`, {
      method: request.method,
      headers: { Authorization: auth(request.creds), 'Content-Type': 'application/xml; charset=utf-8', Depth: '1', 'User-Agent': 'CommunityCalendar/1.0' },
      body: request.body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(502, 'Не удалось соединиться с Яндекс-календарём. Проверьте интернет на сервере и повторите.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(502, `Яндекс отклонил вход (${request.stage}, код ${response.status}). Проверьте: логин — полный email, пароль — именно пароль приложения для «Календаря», двухфакторная защита включена.`);
  }
  if (response.status === 404) throw new HttpError(502, `Адрес не найден (${request.stage}). Проверьте логин Яндекс-аккаунта.`);
  if (!response.ok) throw new HttpError(502, `Яндекс-календарь вернул ошибку ${response.status} (${request.stage}). Повторите позже.`);
  return response.text();
}

async function findCalendar(creds: YandexCreds): Promise<{ path: string; summary: string }> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`;
  const xml = await dav({ method: 'PROPFIND', path: `/calendars/${creds.login}/`, creds, body, stage: 'проверка доступа' });
  // Yandex answers with uppercase prefixes (<D:response>), unprefixed DAV elements
  // (<href>) and attributes on any element — all of that is handled below.
  const responses = xml.split(/<\/?[a-zA-Z]+:response(?:\s[^>]*)?>/).filter(chunk => /<(?:[a-zA-Z]+:)?href(?:[\s>])/.test(chunk));
  for (const chunk of responses) {
    if (!/<[a-zA-Z]+:calendar[ />]/.test(chunk)) continue;
    const href = /<(?:[a-zA-Z]+:)?href(?:\s[^>]*)?>([^<]+)<\/(?:[a-zA-Z]+:)?href>/.exec(chunk)?.[1];
    if (!href) continue;
    const summary = /<(?:[a-zA-Z]+:)?displayname(?:\s[^>]*)?>([^<]*)<\/(?:[a-zA-Z]+:)?displayname>/.exec(chunk)?.[1]?.trim();
    return { path: href.endsWith('/') ? href : `${href}/`, summary: summary || 'Яндекс Календарь' };
  }
  // Diagnostic: show what Yandex actually returned so parsing can be fixed precisely.
  const snippet = xml.replace(/\s+/g, ' ').slice(0, 1500);
  throw new HttpError(502, `В Яндекс-аккаунте не найдено календарей по протоколу CalDAV. Ответ сервера: ${snippet}${xml.length > 1500 ? '…' : ''}`);
}

const toUtc = (value: Date) => `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, '0')}${String(value.getUTCDate()).padStart(2, '0')}T${String(value.getUTCHours()).padStart(2, '0')}${String(value.getUTCMinutes()).padStart(2, '0')}${String(value.getUTCSeconds()).padStart(2, '0')}Z`;

export async function fetchYandexEvents(creds: YandexCreds, timeMin: Date, timeMax: Date): Promise<{ events: ExternalEvent[]; calendarSummary: string }> {
  const calendar = await findCalendar(creds);
  const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${toUtc(timeMin)}" end="${toUtc(timeMax)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const xml = await dav({ method: 'REPORT', path: calendar.path, creds, body, stage: 'чтение событий' });
  const blobs = [...xml.matchAll(/<[a-zA-Z]+:calendar-data[^>]*>([\s\S]*?)<\/[a-zA-Z]+:calendar-data>/g)].map(match => match[1]);
  const events = blobs.flatMap(blob => parseICS(unescapeXml(blob), timeMin.toISOString().slice(0, 10), timeMax.toISOString().slice(0, 10)));
  return { events, calendarSummary: calendar.summary };
}

function unescapeXml(value: string) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

// ---- ICS parsing ----

const WEEKDAY_INDEX: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

function unfold(raw: string): string[] {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() && !lines.length) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

type Stamp = { date: string; time: string; allDay: boolean; sourceDate?: string; sourceTime?: string; zone?: string };

function zonedStamp(date: string, time: string, zone: string): Stamp {
  const target = Date.parse(`${date}T${time}:00Z`);
  const formatter = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const values = (instant: number, timeZone: string) => {
    const parts = formatter(timeZone).formatToParts(new Date(instant));
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  };
  let instant = target;
  for (let pass = 0; pass < 3; pass++) {
    const represented = values(instant, zone);
    const delta = target - Date.parse(`${represented.date}T${represented.time}:00Z`);
    if (!delta) break;
    instant += delta;
  }
  return { ...values(instant, 'Europe/Moscow'), allDay: false, sourceDate: date, sourceTime: time, zone };
}

function parseStamp(value: string, params: string, defaultZone = ''): Stamp | null {
  if (/VALUE=DATE(?!-TIME)/.test(params) || /^\d{8}$/.test(value)) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, time: '00:00', allDay: true } : null;
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, , z] = match;
  const zone = z === 'Z' ? 'UTC' : /TZID="?([^;"\s]+)"?/.exec(params)?.[1] || defaultZone;
  if (zone) return zonedStamp(`${y}-${mo}-${d}`, `${h}:${mi}`, zone);
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false };
}

function parseRRule(value: string): RepeatRule | null {
  const fields = Object.fromEntries(value.split(';').map(pair => pair.split('=') as [string, string]));
  const freq = ({ DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' } as Record<string, RepeatRule['freq']>)[fields.FREQ];
  if (!freq) return null;
  const interval = Math.max(1, Number(fields.INTERVAL) || 1);
  const until = fields.UNTIL ? parseStamp(fields.UNTIL, '')?.date ?? null : null;
  const count = fields.COUNT ? Math.max(1, Number(fields.COUNT) || 0) : null;
  const byWeekday = fields.BYDAY ? fields.BYDAY.split(',').map(day => WEEKDAY_INDEX[day.replace(/^[-+]\d+/, '')]).filter(day => day !== undefined) : [];
  return { freq, interval, byWeekday: freq === 'weekly' ? byWeekday : [], until, count };
}

type VEvent = {
  uid: string; summary: string; description: string; location: string; url: string; status: 'confirmed' | 'cancelled';
  start: Stamp; end: Stamp | null; rule: RepeatRule | null; exdates: Set<string>; recurrenceId: string | null; ruleText: string; rdates: Set<string>; conference: string[]; richDescription: string;
};

function parseVEvent(lines: string[], defaultZone = ''): VEvent | null {
  let uid = '', summary = '', description = '', location = '', url = '', ruleText = '', rrule: RepeatRule | null = null, recurrenceId: string | null = null;
  let recurrenceStamp: Stamp | null = null;
  let status: 'confirmed' | 'cancelled' = 'confirmed';
  let start: Stamp | null = null, end: Stamp | null = null;
  const exdates = new Set<string>();
  const rdates = new Set<string>();
  const conference: string[] = [];
  let richDescription = '';
  const unescapeText = (value: string) => value.replace(/\\([nN,;\\])/g, (_, char: string) => /[nN]/.test(char) ? '\n' : char);
  for (const line of lines) {
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const name = line.slice(0, sep).split(';')[0].toUpperCase();
    const params = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    switch (name) {
      case 'UID': uid = value; break;
      case 'SUMMARY': summary = unescapeText(value); break;
      case 'DESCRIPTION': description = unescapeText(value); break;
      case 'LOCATION': location = unescapeText(value); break;
      case 'URL': url = unescapeText(value); break;
      case 'CONFERENCE': case 'X-GOOGLE-CONFERENCE': conference.push(unescapeText(value)); break;
      case 'X-ALT-DESC': richDescription = unescapeText(value); break;
      case 'STATUS': status = value.toUpperCase() === 'CANCELLED' ? 'cancelled' : 'confirmed'; break;
      case 'DTSTART': start = parseStamp(value, params, defaultZone); break;
      case 'DTEND': end = parseStamp(value, params, defaultZone); break;
      case 'RRULE': ruleText = value; rrule = parseRRule(value); break;
      case 'EXDATE': for (const item of value.split(',')) { const stamp = parseStamp(item, params, defaultZone); if (stamp) exdates.add(stamp.sourceDate ?? stamp.date); } break;
      case 'RDATE': for (const item of value.split(',')) { const stamp = parseStamp(item, params, defaultZone); if (!stamp) throw new Error('Unsupported recurrence date'); rdates.add(stamp.sourceDate ?? stamp.date); } break;
      case 'RECURRENCE-ID': { recurrenceStamp = parseStamp(value, params, defaultZone); recurrenceId = recurrenceStamp?.sourceDate ?? recurrenceStamp?.date ?? null; break; }
    }
  }
  if (!start && status === 'cancelled') start = recurrenceStamp;
  if (!uid || !start) return null;
  return { uid, summary, description, location, url, status, start, end, rule: rrule, exdates, recurrenceId, ruleText, rdates, conference, richDescription };
}

function toExternal(event: VEvent, date: string, start: Stamp, end: Stamp | null, externalId = `${event.uid}@${date}`): ExternalEvent {
  const endTime = end ? end.time : start.time;
  return {
    externalId,
    sourceUrl: isCalendarSourceUrl(event.url) ? event.url : '',
    allDay: start.allDay, endDate: end?.date, noEnd: !end && !start.allDay,
    title: event.summary || 'Без названия',
    description: event.description, url: participationUrl(...event.conference, event.url, event.location, event.description, event.richDescription, event.summary), venue: event.location,
    date, start: start.time, end: endTime,
    status: event.status,
  };
}
function bumpHour(time: string) { const [h, m] = time.split(':').map(Number); return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

// Expands a calendar blob into concrete occurrences in [from, to].
export function parseICS(ics: string, from: string, to: string, options: { stableIds?: boolean; strict?: boolean } = {}): ExternalEvent[] {
  const lines = unfold(ics);
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') current = [];
    else if (upper === 'END:VEVENT') { if (current) blocks.push(current); current = null; }
    else if (current) current.push(line);
  }
  const defaultZone = ics.match(/^X-WR-TIMEZONE:(.+)$/m)?.[1]?.trim() ?? '';
  const parsed = blocks.map(lines => parseVEvent(lines, defaultZone)).filter((event): event is VEvent => Boolean(event));
  if (options.strict && (current !== null || blocks.length !== (ics.match(/^BEGIN:VEVENT\s*$/gm)?.length ?? 0) || parsed.length !== blocks.length || parsed.some(event => event.ruleText && !event.rule))) throw new Error('Incomplete calendar');
  const masters = parsed.filter(event => !event.recurrenceId);
  const exceptions = new Map(parsed.filter(event => event.recurrenceId).map(event => [`${event.uid}@${event.recurrenceId}`, event]));
  const result: ExternalEvent[] = [];
  const covered = new Set<string>();
  for (const master of masters) {
    if (!master.rule && !master.rdates.size) {
      if (master.start.date < from || master.start.date > to) continue;
      const id = `${master.uid}@${master.start.date}`;
      covered.add(id);
      const exception = exceptions.get(id);
      const externalId = options.stableIds ? master.uid : id;
      result.push(exception ? toExternal(exception, exception.start.date, exception.start, exception.end, externalId) : toExternal(master, master.start.date, master.start, master.end, externalId));
      continue;
    }
    const firstDate = master.start.sourceDate ?? master.start.date;
    const dates = master.rule ? (options.strict
      ? expandICalDates(firstDate, master.ruleText, from, to)
      : expandDates(firstDate, master.rule, from, to)) : [firstDate];
    for (const date of [...new Set([...dates, ...master.rdates])].sort()) {
      if (master.exdates.has(date)) continue;
      const id = `${master.uid}@${date}`;
      covered.add(id);
      const exception = exceptions.get(id);
      let start = master.start, end = master.end;
      if (start.allDay) {
        start = { ...start, date };
        if (end) {
          const duration = Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${master.start.date}T00:00:00Z`);
          end = { ...end, date: new Date(Date.parse(`${date}T00:00:00Z`) + duration).toISOString().slice(0,10) };
        }
      }
      if (start.zone && start.sourceTime) start = zonedStamp(date, start.sourceTime, start.zone);
      if (end?.zone && end.sourceTime) {
        const offset = Date.parse(`${end.sourceDate}T00:00:00Z`) - Date.parse(`${master.start.sourceDate}T00:00:00Z`);
        const endDate = new Date(Date.parse(`${date}T00:00:00Z`) + offset).toISOString().slice(0, 10);
        end = zonedStamp(endDate, end.sourceTime, end.zone);
      }
      result.push(exception ? toExternal(exception, exception.start.date, exception.start, exception.end, id) : toExternal(master, start.zone ? start.date : date, start, end, id));
    }
  }
  for (const [id, event] of exceptions) {
    if (covered.has(id) || event.start.date < from || event.start.date > to) continue;
    result.push(toExternal(event, event.start.date, event.start, event.end, options.stableIds ? id : undefined));
  }
  return result.filter(event => event.date >= from && event.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function validDateRange(value: string) { return DATE.test(value); }
