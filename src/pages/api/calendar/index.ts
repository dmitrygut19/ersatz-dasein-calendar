import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { lodges } from '../../../lib/db/schema';
import { handle } from '../../../lib/http';
import { publicCalendar, publicAccount } from '../../../lib/calendar';
import { isAdmin } from '../../../lib/auth';

export const GET: APIRoute = ({ url, request }) => handle(() => {
  // Until Telegram is connected, only the existing admin session authenticates
  // an operator. A device id or query parameter is never proof of login.
  const authenticated = isAdmin(request);
  const participant = authenticated ? url.searchParams.get('participant') : null;
  return {
    lodges: getDb().select({id:lodges.id,name:lodges.name,iconUrl:lodges.iconUrl}).from(lodges).all(),
    account: publicAccount(participant),
    events: publicCalendar(
      url.searchParams.get('from') ?? undefined,
      url.searchParams.get('to') ?? undefined,
      participant,
    ),
  };
});
