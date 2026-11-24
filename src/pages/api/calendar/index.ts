import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { lodges } from '../../../lib/db/schema';
import { handle } from '../../../lib/http';
import { publicCalendar, publicAccount } from '../../../lib/calendar';
import { isAdmin } from '../../../lib/auth';
import { publicDemoEnabled } from '../../../lib/public-demo';
import { cardReviewEnabled, reviewParticipant } from '../../../lib/card-review';

export const GET: APIRoute = ({ url, request }) => handle(() => {
  // Until Telegram is connected, only the existing admin session authenticates
  // an operator. A device id or query parameter is never proof of login.
  const authenticated = isAdmin(request);
  const participant = cardReviewEnabled() ? reviewParticipant(url.searchParams.get('reviewProfile')) : authenticated ? url.searchParams.get('participant') : null;
  const demoLoginAllowed = publicDemoEnabled() || cardReviewEnabled();
  const demoMember = demoLoginAllowed && url.searchParams.get('demoMember') === '1';
  return {
    lodges: getDb().select({id:lodges.id,name:lodges.name,iconUrl:lodges.iconUrl}).from(lodges).all()
      // Review-only audience fixtures are not real thematic directory entries.
      .filter(row => !cardReviewEnabled() || !row.id.startsWith('card-review-')),
    demoLoginAllowed,
    cardReview: cardReviewEnabled(),
    account: demoMember ? { nick: '@nickname', degree: 'II' } : publicAccount(participant),
    events: publicCalendar(
      url.searchParams.get('from') ?? undefined,
      url.searchParams.get('to') ?? undefined,
      participant,
      demoMember,
    ),
  };
});
