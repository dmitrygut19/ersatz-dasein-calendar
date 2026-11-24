import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { deleteEvent, updateEvent } from '../../../lib/events';

// Occurrence ids contain '@' (eventId@date); the segment arrives percent-encoded.
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export const PUT: APIRoute = ({ request, params }) => handle(async () => ({ event: updateEvent(decode(params.id!), await readJson(request)) }));
export const DELETE: APIRoute = ({ params }) => handle(() => deleteEvent(decode(params.id!)));
