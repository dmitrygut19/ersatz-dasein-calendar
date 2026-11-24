import type { APIRoute } from 'astro';
import { validToken } from '../../lib/auth';
import { handle, HttpError, readJson } from '../../lib/http';

export const POST: APIRoute = async ({ request, cookies }) => handle(async () => {
  const body = await readJson(request);
  if (!validToken(body?.token)) throw new HttpError(401, 'Неверный тестовый доступ.');
  cookies.set('calendar_experiment', body.token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
  });
  return { ok: true };
});
