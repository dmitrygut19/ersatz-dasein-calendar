// Google Calendar API adapter. OAuth app credentials come from the environment;
// without them the connect endpoint refuses with an explanatory error.
import { HttpError } from './http';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

export type GoogleTokens = { accessToken: string; refreshToken: string | null; expiresAt: number | null };
export type ExternalEvent = {
  sourceUrl?: string; allDay?: boolean; endDate?: string; noEnd?: boolean;
  externalId: string;
  title: string;
  description: string;
  url: string;
  venue: string;
  date: string;
  start: string;
  end: string;
  status: 'confirmed' | 'cancelled';
};

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function requireGoogle() {
  if (!googleConfigured()) {
    throw new HttpError(409, 'Google OAuth не настроен на сервере. Задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.');
  }
}

export function redirectUri(origin: string) {
  return `${origin}/api/integration/google/callback`;
}

export function authUrl(origin: string, state: string) {
  requireGoogle();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, 'Google отклонил обмен кода авторизации. Начните подключение заново.');
  }
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(code: string, origin: string): Promise<GoogleTokens> {
  requireGoogle();
  const data = await tokenRequest({
    code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri(origin), grant_type: 'authorization_code',
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  };
}

export async function refreshAccessToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  if (!tokens.refreshToken) return tokens;
  const data = await tokenRequest({
    refresh_token: tokens.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token',
  });
  return {
    accessToken: data.access_token, refreshToken: tokens.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : tokens.expiresAt,
  };
}

async function apiGet(path: string, accessToken: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401 || response.status === 403) throw new HttpError(502, 'Доступ к Google-календарю отозван. Подключите календарь заново.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, 'Google-календарь временно недоступен. Повторите синхронизацию позже.');
  return data;
}

function clock(value: { date?: string; dateTime?: string } | undefined): { date: string; time: string } | null {
  if (!value) return null;
  if (value.date) return { date: value.date, time: '00:00' };
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.dateTime ?? '');
  return match ? { date: match[1], time: match[2] } : null;
}

export async function listCalendars(tokens: GoogleTokens) {
  const data = await apiGet('/users/me/calendarList', tokens.accessToken) as { items?: { id: string; summary?: string; primary?: boolean }[] };
  return (data.items ?? []).map(calendar => ({ id: calendar.id, summary: calendar.summary ?? calendar.id, primary: Boolean(calendar.primary) }));
}

export async function listEvents(tokens: GoogleTokens, calendarId: string, timeMin: Date, timeMax: Date): Promise<ExternalEvent[]> {
  const params = new URLSearchParams({
    singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false',
    timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
    maxResults: '2500', fields: 'items(id,summary,description,location,status,start,end)',
  });
  const data = await apiGet(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, tokens.accessToken) as {
    items?: { id: string; summary?: string; description?: string; location?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[];
  };
  const result: ExternalEvent[] = [];
  for (const item of data.items ?? []) {
    const start = clock(item.start), end = clock(item.end);
    if (!start || !end) continue;
    result.push({
      externalId: item.id,
      title: (item.summary ?? 'Без названия').trim() || 'Без названия',
      description: item.description ?? '',
      url: '', venue: item.location ?? '',
      date: start.date, start: start.time,
      end: end.date > start.date ? '23:59' : end.time,
      status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
    });
  }
  return result;
}
