import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { createGroup, listGroups } from '../../../lib/groups';

export const GET: APIRoute = () => handle(() => ({ groups: listGroups() }));
export const POST: APIRoute = ({ request }) => handle(async () => createGroup(await readJson(request)));
