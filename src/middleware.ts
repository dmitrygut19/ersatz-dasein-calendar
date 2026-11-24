import { defineMiddleware } from 'astro:middleware';
import { isAdmin, localExperimentEnabled } from './lib/auth';
import { ensureSyncScheduler } from './lib/sync-scheduler';
import { json } from './lib/http';
import { publicDemoEnabled } from './lib/public-demo';
import { withDemoDatabase } from './lib/db';
import { demoSession, resetDemoSession, DEMO_COOKIE } from './lib/demo-session';
import { getStatus, syncNow } from './lib/integration';
import { sharedCalendarEnabled, sharedCalendarConfigured, withSharedCalendar } from './lib/shared-calendar';

export const onRequest = defineMiddleware((context, next) => {
  const path = context.url.pathname;
  const publicCalendar = path === '/calendar' || path === '/api/calendar' || path.startsWith('/api/calendar/');
  // The published admin and its APIs edit the same imported records that the
  // public calendar reads. Do not route it into the old browser demo database.
  const admin = path.startsWith('/admin') || path.startsWith('/api/');
  return sharedCalendarConfigured() && (publicCalendar || admin)
    ? withSharedCalendar(() => respondRequest(context,next)) : respondRequest(context,next);
});
const respondRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const demo = publicDemoEnabled();
  const shared = sharedCalendarEnabled();
  if (!demo || shared) ensureSyncScheduler();
  const guarded = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api');
  const calendarPage = url.pathname === '/calendar';
  if (!guarded && !(demo && calendarPage)) return next();
  if (process.env.CALENDAR_DEMO_REMOTE !== '1' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return json({ message: 'Эксперимент доступен только локально.' }, 403);
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
  if (!sessionRoute && !publicApi && !demo && !isAdmin(request)) {
    return json({ message: 'Нет доступа. Откройте адрес, выданный локальным запуском.' }, 401);
  }
  async function respond() {
    const response = await next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  if (!demo || shared) return respond();
  const session = demoSession(context.cookies.get(DEMO_COOKIE)?.value);
  const secure = (request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0,-1)) === 'https';
  context.cookies.set(DEMO_COOKIE, session.id, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 60 });
  session.active++;
  try {
    return await withDemoDatabase(session.db, async () => {
      // Full admin document loads reset imports before any child component can read them.
      if (request.method === 'GET' && url.pathname.startsWith('/admin')) resetDemoSession(session);
      // Private demo sources update only while this browser is requesting its own data.
      const interval = Number(process.env.CALENDAR_SYNC_INTERVAL_MS ?? 60_000);
      if (request.method === 'GET' && ['/api/integration','/api/events','/api/calendar','/api/calendar-preview'].includes(url.pathname) && interval > 0 && Date.now()-session.lastSyncAttempt >= interval) {
        const status = getStatus();
        if (status.lastSyncAt && Date.now()-new Date(status.lastSyncAt).getTime() >= interval) {
          session.lastSyncAttempt = Date.now();
          try { await syncNow(); } catch { /* the API exposes the retained data and error status */ }
        }
      }
      return respond();
    });
  } finally { session.active--; }
});
