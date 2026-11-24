export type CalendarFilters = { lodges: string[]; degree: string };
export type AffiliatedEvent = { topicLodgeId: string | null; communityEvent: boolean; affiliationDegree: string | null; affiliationDegrees?: string[] | null };
export const COMMUNITY = '__community';
// The current model has one thematic lodge per event. Access requirements are
// deliberately absent here; an unknown affiliation is never a community event.
export function matchesCalendarFilters(event: AffiliatedEvent, filters: CalendarFilters) {
  return (!filters.lodges.length || filters.lodges.some(id => id === COMMUNITY ? event.communityEvent : event.topicLodgeId === id))
    && (filters.degree === 'Все' || (event.affiliationDegrees?.length ? event.affiliationDegrees.includes(filters.degree) : event.affiliationDegree === filters.degree));
}
