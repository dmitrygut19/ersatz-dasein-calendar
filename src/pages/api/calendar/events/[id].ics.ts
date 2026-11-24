import type { APIRoute } from 'astro';
import { eventCalendarFile } from '../../../../lib/calendar-export';
import { getOccurrence } from '../../../../lib/events';
import { HttpError } from '../../../../lib/http';
import { publicCalendar } from '../../../../lib/calendar';
import { isAdmin } from '../../../../lib/auth';

const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export const GET: APIRoute = ({ params, request, url }) => {
  try {
    const event = getOccurrence(decode(params.id ?? ''));
    const participant = isAdmin(request) ? url.searchParams.get('participant') : null;
    const allowed = publicCalendar(event.date,event.date,participant).find(item => item.id === event.id)?.canFollow;
    if (!allowed) return new Response(null, {status:403});
    return new Response(eventCalendarFile(event), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${event.date}.ics"`,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return new Response(null, { status: error.status });
    throw error;
  }
};
