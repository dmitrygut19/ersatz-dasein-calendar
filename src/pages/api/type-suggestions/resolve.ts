import type { APIRoute } from 'astro';
import { handle, readJson, HttpError } from '../../../lib/http';
import { setEventType } from '../../../lib/events';
import { dropSuggestions, skipTypeSuggestions } from '../../../lib/recognition';

// Resolve a suggestion: accept a type (suggested or any other), or skip until the next sync.
export const POST: APIRoute = ({ request }) => handle(async () => {
  const body = await readJson(request) as Record<string, unknown>;
  const eventId = String(body?.eventId ?? '');
  const action = String(body?.action ?? '');
  if (!eventId) throw new HttpError(422, 'Укажите событие.');
  if (action === 'accept' || action === 'other') {
    const typeId = String(body?.typeId ?? '');
    if (!typeId) throw new HttpError(422, 'Укажите тип события.');
    setEventType(eventId, typeId);
  } else if (action === 'skip') {
    skipTypeSuggestions(eventId);
    return { ok: true };
  } else {
    throw new HttpError(422, 'Действие: accept, other или skip.');
  }
  dropSuggestions(eventId);
  return { ok: true };
});
