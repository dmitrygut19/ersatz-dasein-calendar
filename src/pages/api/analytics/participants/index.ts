import type { APIRoute } from 'astro';
import { handle } from '../../../../lib/http';
import { listParticipants } from '../../../../lib/analytics';

export const GET: APIRoute = ({ url }) => handle(() => {
  const params = url.searchParams;
  const action = params.get('action');
  const reminder = params.get('reminder');
  return listParticipants(params.get('eventKey') ?? '', {
    search: params.get('search') ?? undefined,
    tier: params.get('tier') || undefined,
    degree: params.get('degree') || undefined,
    action: action === 'opened' || action === 'viewed' ? action : 'all',
    reminder: reminder === 'on' || reminder === 'off' ? reminder : 'all',
    page: Number(params.get('page')) || 1,
    pageSize: Number(params.get('pageSize')) || 8,
  });
});
