// Calendar wall dates are Moscow dates, independent of the browser's time zone.
export const calendarTimeZone = 'Europe/Moscow';
export function calendarDate(now: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: calendarTimeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
}
export function calendarWeek(now: Date) {
  const date = new Date(`${calendarDate(now)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}
export function eventStart(event: {date:string; start:string}) {
  return Date.parse(`${event.date}T${event.start}:00+03:00`);
}
type Candidate = { id:string; date:string; start:string; url:string; canFollow:boolean; status?:string };
export function nearestWeekEvent<T extends Candidate>(events: T[], now: Date): T | null {
  const {from, to} = calendarWeek(now);
  return events.filter(event => {
    if (!event.canFollow || (event.status && event.status !== 'scheduled') || event.date < from || event.date > to || eventStart(event) <= now.getTime()) return false;
    try { return ['https:', 'http:'].includes(new URL(event.url).protocol); } catch { return false; }
  }).sort((a, b) => eventStart(a) - eventStart(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}
