// Date-level iCalendar rules. Time-zone conversion happens per occurrence.
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY = 86_400_000;

export function expandICalDates(start: string, rule: string, from: string, to: string) {
  const fields = Object.fromEntries(rule.split(';').map(pair => pair.split('='))) as Record<string, string>;
  const allowed = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST'];
  if (Object.keys(fields).some(key => !allowed.includes(key)) || !['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(fields.FREQ)) throw new Error('Unsupported recurrence');
  const interval = Number(fields.INTERVAL ?? 1), count = Number(fields.COUNT ?? Infinity);
  if (!Number.isInteger(interval) || interval < 1 || (fields.COUNT !== undefined && (!Number.isInteger(count) || count < 1))) throw new Error('Invalid recurrence');
  const first = new Date(`${start}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(end) || end - first.getTime() > 200_000 * DAY) throw new Error('Invalid recurrence window');
  const until = fields.UNTIL?.slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') ?? to;
  const numbers = (key: string) => fields[key]?.split(',').map(Number) ?? [];
  const monthDays = numbers('BYMONTHDAY'), months = numbers('BYMONTH'), positions = numbers('BYSETPOS');
  if (monthDays.some(n=>!Number.isInteger(n)||!n||Math.abs(n)>31) || months.some(n=>!Number.isInteger(n)||n<1||n>12) || positions.some(n=>!Number.isInteger(n)||!n||Math.abs(n)>31)) throw new Error('Invalid recurrence filter');
  if (positions.length && !['MONTHLY','YEARLY'].includes(fields.FREQ)) throw new Error('Unsupported recurrence position');
  if (positions.length && fields.FREQ==='YEARLY' && months.length!==1) throw new Error('Unsupported yearly position');
  const byDay = fields.BYDAY?.split(',').map(value => {
    const match = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(value);
    if (!match) throw new Error('Invalid weekday');
    const ordinal = match[1] ? Number(match[1]) : 0;
    if ((match[1] && !ordinal) || (ordinal && (!['MONTHLY','YEARLY'].includes(fields.FREQ) || Math.abs(ordinal)>5 || (fields.FREQ==='YEARLY'&&!months.length)))) throw new Error('Unsupported weekday ordinal');
    return { ordinal, weekday: DAYS.indexOf(match[2]) };
  }) ?? [];
  const weekStart = fields.WKST ? DAYS.indexOf(fields.WKST) : 1;
  if (weekStart < 0) throw new Error('Invalid week start');
  const relativeWeekday = (date: Date) => (date.getUTCDay()-weekStart+7)%7;
  const startWeek = first.getTime()-relativeWeekday(first)*DAY;
  function matchesDay(date: Date) {
    const day = date.getUTCDate(), days = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    if (monthDays.length && !monthDays.some(n=>day===(n>0?n:days+n+1))) return false;
    if (byDay.length && !byDay.some(({ordinal,weekday})=>date.getUTCDay()===weekday && (!ordinal || (ordinal>0 ? Math.floor((day-1)/7)+1===ordinal : -(Math.floor((days-day)/7)+1)===ordinal)))) return false;
    return true;
  }
  const result: string[] = [];
  let seen = 0;
  for (let stamp=first.getTime();stamp<=end;stamp+=DAY) {
    const date=new Date(stamp), value=date.toISOString().slice(0,10);
    if (value>until || seen>=count) break;
    const monthDiff=(date.getUTCFullYear()-first.getUTCFullYear())*12+date.getUTCMonth()-first.getUTCMonth();
    if (fields.FREQ==='DAILY' && (stamp-first.getTime())/DAY%interval) continue;
    if (fields.FREQ==='WEEKLY' && (Math.floor((stamp-startWeek)/(7*DAY))%interval || (!byDay.length && date.getUTCDay()!==first.getUTCDay()))) continue;
    if (fields.FREQ==='MONTHLY' && monthDiff%interval) continue;
    if (fields.FREQ==='YEARLY' && ((date.getUTCFullYear()-first.getUTCFullYear())%interval || (!months.length&&!byDay.length&&!monthDays.length&&date.getUTCMonth()!==first.getUTCMonth()))) continue;
    if (months.length&&!months.includes(date.getUTCMonth()+1)) continue;
    if (!matchesDay(date)) continue;
    if (['MONTHLY','YEARLY'].includes(fields.FREQ)&&!monthDays.length&&!byDay.length&&date.getUTCDate()!==first.getUTCDate()) continue;
    if (positions.length) {
      const days=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
      const candidates=Array.from({length:days},(_,i)=>new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),i+1))).filter(matchesDay);
      if (!positions.some(n=>candidates[n>0?n-1:candidates.length+n]?.getTime()===stamp)) continue;
    }
    seen++;
    if (value>=from) result.push(value);
  }
  return result;
}
