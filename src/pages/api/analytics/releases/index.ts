import type { APIRoute } from 'astro';
import { handle } from '../../../../lib/http';
import { listReleases, parsePeriod } from '../../../../lib/analytics';

export const GET: APIRoute = ({ url }) => handle(() => ({
  releases: listReleases(url.searchParams.get('typeId') || null, parsePeriod(url.searchParams.get('period'))),
}));
