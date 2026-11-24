import type { APIRoute } from 'astro';
import { handle } from '../../../lib/http';
import { getDb } from '../../../lib/db';
import { lodges } from '../../../lib/db/schema';
export const GET: APIRoute = () => handle(() => ({ lodges: getDb().select().from(lodges).all() }));
