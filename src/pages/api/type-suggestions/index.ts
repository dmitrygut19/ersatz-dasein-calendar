import type { APIRoute } from 'astro';
import { handle } from '../../../lib/http';
import { listSuggestions } from '../../../lib/recognition';

export const GET: APIRoute = () => handle(() => ({ suggestions: listSuggestions() }));
