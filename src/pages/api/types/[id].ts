import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { saveType, deleteType } from '../../../lib/types';

export const PUT: APIRoute = ({ request, params }) => handle(async () => ({ type: saveType(await readJson(request), params.id!) }));
export const DELETE: APIRoute = ({ params }) => handle(() => deleteType(params.id!));
