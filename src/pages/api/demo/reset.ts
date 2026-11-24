import type { APIRoute } from 'astro';
import { publicDemoEnabled } from '../../../lib/public-demo';
import { resetDemoImports } from '../../../lib/db';
import { handle, HttpError } from '../../../lib/http';

export const POST: APIRoute = () => handle(() => {
  if (!publicDemoEnabled()) throw new HttpError(404, 'Не найдено.');
  resetDemoImports();
  return { ok: true };
});
