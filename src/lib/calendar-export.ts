import type { OccurrenceDto } from './events';
import { shiftDate } from './event-settings';

const encoder = new TextEncoder();

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldLine(line: string) {
  const lines: string[] = [];
  let current = '';
  for (const character of line) {
    if (current && encoder.encode(current + character).length > 75) {
      lines.push(current);
      current = ' ' + character;
    } else current += character;
  }
  lines.push(current);
  return lines.join('\r\n');
}

function localTimestamp(date: string, time: string) {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

function utcTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function eventCalendarFile(event: OccurrenceDto, now = new Date()) {
  const description = [event.description, event.url ? `Ссылка на событие: ${event.url}` : ''].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ersatz//Community Calendar//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Moscow',
    'X-LIC-LOCATION:Europe/Moscow',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0300',
    'TZOFFSETTO:+0300',
    'TZNAME:MSK',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.id)}@community-calendar`,
    `DTSTAMP:${utcTimestamp(now)}`,
    event.allDay ? `DTSTART;VALUE=DATE:${event.date.replaceAll('-','')}` : `DTSTART;TZID=Europe/Moscow:${localTimestamp(event.date, event.start)}`,
    ...(event.noEnd ? [] : [event.allDay ? `DTEND;VALUE=DATE:${(event.endDate || shiftDate(event.date,1)).replaceAll('-','')}` : `DTEND;TZID=Europe/Moscow:${localTimestamp(event.endDate || (event.end < event.start ? shiftDate(event.date,1) : event.date), event.end)}`]),
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(event.venue)}`,
    `URL:${escapeText(event.url)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
