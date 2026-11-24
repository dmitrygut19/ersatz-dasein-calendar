import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { createEvent, getOccurrence, listOccurrences, occurrenceIdOf, upcomingWindow } from '../../../lib/events';
import { googleCalendarUrl } from '../../../lib/calendar-share';

export const GET: APIRoute = ({ url }) => handle(() => {
  const from = url.searchParams.get('from') ?? upcomingWindow().from;
  const to = url.searchParams.get('to') ?? upcomingWindow().to;
  return { events: listOccurrences(from, to) };
});
export const POST: APIRoute = ({ request }) => handle(async () => {
  const event = createEvent(await readJson(request));
  return { event, calendarUrl: googleCalendarUrl(getOccurrence(occurrenceIdOf(event, event.startDate))) };
});
