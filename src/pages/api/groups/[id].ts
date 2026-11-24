import type { APIRoute } from 'astro';
import { handle } from '../../../lib/http';
import { deleteGroup } from '../../../lib/groups';

export const DELETE: APIRoute = ({ params }) => handle(() => deleteGroup(params.id!));
