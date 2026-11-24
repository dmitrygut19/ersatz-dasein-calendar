import type { APIRoute } from 'astro';
import { handle, HttpError } from '../../../lib/http';
import { syncNow } from '../../../lib/integration';
import { sharedCalendarEnabled } from '../../../lib/shared-calendar';
export const POST: APIRoute = () => handle(async () => {
  if (!sharedCalendarEnabled()) throw new HttpError(404, 'Источник не найден.');
  return { integration: await syncNow() };
});
