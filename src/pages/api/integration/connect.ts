import type { APIRoute } from 'astro';
import { handle, readJson, HttpError } from '../../../lib/http';
import { connectICal } from '../../../lib/integration';

// Both providers connect via a read-only iCal subscription, without OAuth or passwords.
export const POST: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request) as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(422, 'Укажите календарь и ссылку iCal.');
  if (body.provider !== undefined && body.provider !== 'google' && body.provider !== 'yandex') throw new HttpError(422, 'Выберите провайдера: Google или Яндекс.');
  return { integration: await connectICal(body.provider === 'yandex' ? 'yandex' : 'google', body.url) };
});
