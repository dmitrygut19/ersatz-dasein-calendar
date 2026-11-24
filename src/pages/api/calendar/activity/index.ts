import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../../lib/http';
import { recordPublicActivity } from '../../../../lib/calendar';

export const POST: APIRoute = ({ request }) => handle(async () => recordPublicActivity(await readJson(request)));
