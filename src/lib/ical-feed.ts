import { createHash } from 'node:crypto';
import { HttpError } from './http';
import { parseICS } from './caldav';

export type FeedProvider = 'google' | 'yandex';
const LIMIT = 5 * 1024 * 1024;
const YANDEX_HOSTS = new Set(['calendar.yandex.ru', 'calendar.yandex.com', 'calendar.360.yandex.ru', 'calendar.360.yandex.com']);

export function validateFeedUrl(value: unknown, provider: FeedProvider) {
  const message = provider === 'google'
    ? 'Вставьте закрытый адрес в формате iCal из настроек Google Календаря.'
    : 'Вставьте ссылку iCal из раздела «Экспорт» в настройках Яндекс.Календаря.';
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new HttpError(422, message);
  let url: URL;
  try { url = new URL(value.trim().replace(/^webcal:/i, 'https:')); } catch { throw new HttpError(422, message); }
  const validHost = provider === 'google'
    ? ['calendar.google.com', 'www.google.com'].includes(url.hostname) && /^\/calendar\/ical\/.+\.ics$/.test(url.pathname)
    : YANDEX_HOSTS.has(url.hostname) && url.pathname === '/export/ics.xml';
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || !validHost) throw new HttpError(422, message);
  return url.href;
}

export function feedKey(url: string, provider: FeedProvider) {
  return `ical:${provider}:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
}

export async function fetchICalFeed(value: unknown, provider: FeedProvider, from: Date, to: Date) {
  const originalUrl = validateFeedUrl(value, provider);
  let url = originalUrl;
  const signal = AbortSignal.timeout(20_000);
  let response: Response | undefined;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(url, { redirect: 'manual', signal, headers: { Accept: 'text/calendar, application/ics;q=0.9' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error('redirect');
      url = validateFeedUrl(new URL(location, url).href, provider);
    }
    if (!response?.ok) throw new Error('unavailable');
    if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('too large');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new Error('too large'); }
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
    if (!/^BEGIN:VCALENDAR\s*$/im.test(text) || !/^END:VCALENDAR\s*$/im.test(text)) throw new Error('not a calendar');
    const events = parseICS(text, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), { stableIds: true, strict: true });
    const summary = text.match(/^X-WR-CALNAME(?:;[^:]*)?:(.*)$/im)?.[1]?.trim().slice(0, 160);
    return { events, calendarSummary: summary || (provider === 'google' ? 'Google Календарь' : 'Яндекс Календарь'), key: feedKey(originalUrl, provider), url: originalUrl };
  } catch {
    // Never expose a secret URL, redirect target, provider body or network error.
    throw new HttpError(502, 'Не удалось прочитать календарь по ссылке iCal. Проверьте, что скопирована ссылка для экспорта, и повторите подключение. Сохранённые события не изменены.');
  }
}
