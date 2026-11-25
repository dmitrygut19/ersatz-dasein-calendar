import { defineMiddleware } from 'astro:middleware';
import { isAdmin, localExperimentEnabled } from './lib/auth';
import { ensureSyncScheduler } from './lib/sync-scheduler';
import { json } from './lib/http';
import { adminOpen, remoteAllowed } from './lib/deployment-mode';

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function hostName(value: string | null) {
  const first = value?.split(',')[0].trim().toLowerCase();
  if (!first) return null;
  return first.startsWith('[') ? first.slice(0, first.indexOf(']') + 1) : first.split(':')[0];
}

function loopbackAddress(value: string) {
  const address = value.trim().toLowerCase();
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

// Astro rewrites Request.url to localhost when Host is not in security.allowedDomains,
// so url.hostname cannot tell local from remote requests. Judge by the raw headers
// and the client address instead. This rejects requests addressed to a public name
// (e.g. through a proxy); it is not a network barrier — bind HOST=127.0.0.1 for that.
function localRequest(context: { request: Request; url: URL; clientAddress: string }) {
  const { request, url } = context;
  const names = [request.headers.get('x-forwarded-host'), request.headers.get('host')].map(hostName).filter(Boolean) as string[];
  if (!names.length) names.push(url.hostname);
  if (!names.every(name => LOOPBACK_NAMES.has(name))) return false;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor && !forwardedFor.split(',').every(loopbackAddress)) return false;
  let client = '';
  try { client = context.clientAddress; } catch { /* adapter without client address */ }
  return !client || loopbackAddress(client);
}

function denied(pathname: string, status: number, message: string) {
  if (pathname.startsWith('/api')) return json({ message }, status);
  const text = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>Нет доступа</title></head><body><p>${text}</p></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  ensureSyncScheduler();
  const guarded = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api');
  if (!guarded) return next();
  if (!remoteAllowed() && !localRequest(context)) {
    return denied(url.pathname, 403, 'Админка доступна только с localhost. Для сервера задайте CALENDAR_ALLOW_REMOTE=1 (см. README, раздел «Развёртывание»).');
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    // Behind proxies (e.g. Render) the request URL arrives as http://localhost:<port>;
    // rebuild the public origin from forwarded proto + Host header instead.
    const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1);
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
    if (request.headers.get('origin') !== `${proto}://${host}`) {
      return json({ message: 'Недопустимый источник запроса.' }, 403);
    }
  }
  const sessionRoute = url.pathname === '/api/local-session';
  // Public participant surface: calendar read and activity ingest (see INTEGRATION.md).
  const publicApi = (url.pathname === '/api/calendar' && ['GET', 'HEAD'].includes(request.method))
    || (url.pathname.startsWith('/api/calendar/covers/') && ['GET', 'HEAD'].includes(request.method))
    || (url.pathname.startsWith('/api/calendar/events/') && ['GET', 'HEAD'].includes(request.method))
    || (url.pathname === '/api/calendar/activity' && request.method === 'POST');
  if (sessionRoute && !localExperimentEnabled()) {
    return json({ message: 'Локальный тестовый доступ выключен.' }, 401);
  }
  if (!sessionRoute && !publicApi && !adminOpen() && !isAdmin(request)) {
    return denied(url.pathname, 401, 'Нет доступа: админка закрыта. Войдите по ссылке <адрес-приложения>/#<значение CALENDAR_EXPERIMENT_TOKEN> или откройте админку настройкой CALENDAR_ADMIN_OPEN=1 (см. README, раздел «Развёртывание»).');
  }
  async function respond() {
    const response = await next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  return respond();
});
