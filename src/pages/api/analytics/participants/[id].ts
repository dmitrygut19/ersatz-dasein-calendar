import type { APIRoute } from 'astro';
import { handle } from '../../../../lib/http';
import { parsePeriod, participantProfile } from '../../../../lib/analytics';

export const GET: APIRoute = ({ url, params }) => handle(() => ({
  profile: participantProfile(params.id!, parsePeriod(url.searchParams.get('period'))),
}));
