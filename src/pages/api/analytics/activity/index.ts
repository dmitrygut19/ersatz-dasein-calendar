import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../../lib/http';
import { recordActivity } from '../../../../lib/analytics';

// Ingest endpoint for the participant side (calendar app / Telegram bot later).
export const POST: APIRoute = ({ request }) => handle(async () => recordActivity(await readJson(request)));
