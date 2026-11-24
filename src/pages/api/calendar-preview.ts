import type { APIRoute } from 'astro';
import { handle, HttpError } from '../../lib/http';
import { publicCalendar } from '../../lib/calendar';

// Protected by the usual /api middleware; anonymous only in the isolated demo.
export const GET: APIRoute = ({ url }) => handle(() => {
  const degree = url.searchParams.get('degree') ?? '';
  if (!['', 'I', 'II', 'III'].includes(degree)) throw new HttpError(422, 'Проверьте градус.');
  return { account: null, demoLoginAllowed: false, events: publicCalendar(
    url.searchParams.get('from') ?? undefined, url.searchParams.get('to') ?? undefined,
    null, false, degree,
  ) };
});
