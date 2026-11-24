// The launcher uses a dedicated database. Never allow impersonation on a remote host.
import path from 'node:path';
export const cardReviewEnabled = () => process.env.CALENDAR_CARD_REVIEW === '1' && process.env.CALENDAR_DEMO_REMOTE !== '1'
  && ['artifacts/event-card-review/review.sqlite','artifacts/mobile-calendar-review/review.sqlite'].some(file => path.resolve(process.env.CALENDAR_DATABASE_PATH ?? '') === path.resolve(file));
export function reviewParticipant(profile:string|null):string|null {
  // Profile review belongs only to the separately launched mobile trial.
  const mobile=path.resolve(process.env.CALENDAR_DATABASE_PATH??'')===path.resolve('artifacts/mobile-calendar-review/review.sqlite');
  return mobile&&cardReviewEnabled()&&profile&&['I','II','I-member','II-member'].includes(profile)?`card-review-${profile}`:null;
}
