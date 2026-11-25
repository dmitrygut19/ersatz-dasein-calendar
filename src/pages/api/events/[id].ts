import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { deleteEvent, updateEvent } from '../../../lib/events';
import { editGoogleEvent, splitGoogleChanges } from '../../../lib/integration';

// Occurrence ids contain '@' (eventId@date); the segment arrives percent-encoded.
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export const PUT: APIRoute = ({ request, params }) => handle(async () => {
  const id = decode(params.id!);
  const body = await readJson(request) as Record<string, unknown>;
  // Title, description, link, date and time of an imported Google event belong to Google:
  // they are written there first (fails without write access), app settings follow as before.
  const split = splitGoogleChanges(id, body);
  if (split) {
    const written = await editGoogleEvent(id, split.scope, split.schedule);
    if (!Object.keys(split.rest).length) return { event: written };
    return { event: updateEvent(id, { ...body, changes: split.rest }) };
  }
  return { event: updateEvent(id, body) };
});
export const DELETE: APIRoute = ({ params }) => handle(() => deleteEvent(decode(params.id!)));
