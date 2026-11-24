import { defineMiddleware } from 'astro:middleware';
import { isAdmin, localExperimentEnabled } from './lib/auth';
import { ensureSyncScheduler } from './lib/sync-scheduler';
import { json } from './lib/http';
import { adminOpen, remoteAllowed } from './lib/deployment-mode';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  ensureSyncScheduler();
  const guarded = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api');
  if (!guarded) return next();
  if (!remoteAllowed() && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return json({ message: 'Админка доступна только локально.' }, 403);
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
    return json({ message: 'Нет доступа. Откройте адрес, выданный локальным запуском.' }, 401);
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
