import type { PublicEvent } from './calendar';

// Stable topic IDs, independent of access, degree and the event's custom appearance.
// Colours are sampled from the confirmed original lodge covers (design/tokens.json).
const lodgeTokens:Record<string,string>={
  'tech-priesthood':'lodge-technopriests',
  priesthood:'lodge-sequencers',
  gambling:'lodge-gambling',
  mercenaries:'lodge-ship',capitalists:'lodge-ship',
  atemporal:'lodge-atemporal',
  students:'lodge-students-comrades',comrades:'lodge-students-comrades',
};
export function mobileEventColor(event:Pick<PublicEvent,'topicLodgeId'|'typeName'|'communityEvent'>):string{
  if(event.topicLodgeId)return lodgeTokens[event.topicLodgeId]??'gray-700';
  // Onboarding is shared, but deliberately quieter than other community meetings.
  if(/^онбординг(?:[-\s]|$)|^onboarding(?:[-\s]|$)/iu.test(event.typeName??''))return 'gray-700';
  return event.communityEvent?'copper-600':'gray-700';
}
