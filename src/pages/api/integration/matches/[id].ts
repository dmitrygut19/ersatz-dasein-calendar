import type { APIRoute } from 'astro';
import { handle, readJson, HttpError } from '../../../../lib/http';
import { resolveMatch } from '../../../../lib/integration';

export const POST: APIRoute = ({ request, params }) => handle(async () => {
  const body = await readJson(request) as Record<string, unknown>;
  const action = String(body?.action ?? '');
  if (!['link', 'import', 'skip'].includes(action)) throw new HttpError(422, 'Выберите действие: связать, импортировать отдельно или пропустить.');
  const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
  return resolveMatch(decode(params.id!), action as 'link' | 'import' | 'skip');
});
