import type { APIRoute } from 'astro';
import { handle } from '../../../../lib/http';
import { listMatchItems } from '../../../../lib/integration';

export const GET: APIRoute = () => handle(() => ({ matches: listMatchItems() }));
