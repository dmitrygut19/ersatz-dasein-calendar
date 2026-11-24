import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { listTypes, saveType } from '../../../lib/types';

export const GET: APIRoute = () => handle(() => ({ types: listTypes() }));
export const POST: APIRoute = ({ request }) => handle(async () => ({ type: saveType(await readJson(request)) }));
