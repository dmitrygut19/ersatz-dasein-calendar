import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { disconnect, getStatus, setManualMode, syncNow } from '../../../lib/integration';

export const GET: APIRoute = () => handle(() => ({ integration: getStatus() }));
export const POST: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request) as Record<string, unknown>;
  const action = String(body?.action ?? '');
  if (action === 'disconnect') return { integration: disconnect() };
  if (action === 'manual') return { integration: setManualMode() };
  if (action === 'sync') return { integration: await syncNow() };
  return { integration: getStatus() };
});
