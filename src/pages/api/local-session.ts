import type { APIRoute } from 'astro';
import { validToken } from '../../lib/auth';
import { handle, HttpError, readJson } from '../../lib/http';
import { requestOrigin } from '../../lib/request-origin';

export const POST: APIRoute = async ({ request, cookies }) => handle(async () => {
  const body = await readJson(request);
  if (!validToken(body?.token)) throw new HttpError(401, 'Неверный тестовый доступ.');
  // Secure whenever the browser reached the app over HTTPS (directly or via a proxy);
  // plain-HTTP trial installs keep working without it.
  const secure = requestOrigin(request).startsWith('https:');
  cookies.set('calendar_experiment', body.token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8, secure,
  });
  return { ok: true };
});
