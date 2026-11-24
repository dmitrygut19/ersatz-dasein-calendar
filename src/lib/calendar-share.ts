import type { OccurrenceDto } from './events';
import { shiftDate } from './event-settings';

type CalendarEvent = Pick<OccurrenceDto, 'title' | 'date' | 'start' | 'end' | 'description' | 'url' | 'venue'> & Partial<Pick<OccurrenceDto, 'allDay' | 'endDate'>>;

function localTimestamp(date: string, time: string) {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

export function googleCalendarUrl(event: CalendarEvent) {
  const description = [event.description, event.url ? `Ссылка на событие: ${event.url}` : ''].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: event.allDay ? `${event.date.replaceAll('-','')}/${(event.endDate || shiftDate(event.date,1)).replaceAll('-','')}` : `${localTimestamp(event.date, event.start)}/${localTimestamp(event.endDate || (event.end < event.start ? shiftDate(event.date,1) : event.date), event.end)}`,
    ctz: 'Europe/Moscow',
    details: description,
    location: event.venue,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
