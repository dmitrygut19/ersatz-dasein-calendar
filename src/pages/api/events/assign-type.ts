import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { assignUntypedEvents } from '../../../lib/assign-untyped-events';
export const POST: APIRoute = ({request}) => handle(async () => assignUntypedEvents(await readJson(request)));
