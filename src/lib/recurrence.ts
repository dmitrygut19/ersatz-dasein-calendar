// Local-date recurrence expansion. Dates are 'YYYY-MM-DD' strings in the event's original zone;
// time fields stay 'HH:MM'. Mirrors Google-style rules for the supported MVP modes.
import { HttpError } from './http';

export type RepeatRule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday: number[]; // 0 = Monday … 6 = Sunday (weekly only)
  until: string | null; // inclusive local date
  count: number | null; // total occurrences including the first one
};

export function parseRule(raw: string | null | undefined): RepeatRule | null {
  if (!raw) return null;
  try {
    const rule = JSON.parse(raw) as Partial<RepeatRule>;
    if (!rule || typeof rule !== 'object') return null;
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(String(rule.freq))) return null;
    return {
      freq: rule.freq as RepeatRule['freq'],
      interval: Math.max(1, Number(rule.interval) || 1),
      byWeekday: Array.isArray(rule.byWeekday) ? rule.byWeekday.filter(x => Number.isInteger(x) && x >= 0 && x <= 6) : [],
      until: typeof rule.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rule.until) ? rule.until : null,
      count: Number.isInteger(rule.count) && (rule.count as number) > 0 ? (rule.count as number) : null,
    };
  } catch {
    return null;
  }
}

export function validateRule(input: unknown): RepeatRule | null {
  if (input === null || input === undefined || input === '') return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Проверьте настройки повторов.');
  const raw = input as Record<string, unknown>;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(String(raw.freq))) throw new HttpError(422, 'Выберите допустимый режим повторов.');
  const interval = raw.interval ?? 1;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1 || interval > 99) throw new HttpError(422, 'Интервал повторов — целое число от 1 до 99.');
  const byWeekday = Array.isArray(raw.byWeekday) ? raw.byWeekday : [];
  if (!byWeekday.every(x => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6)) throw new HttpError(422, 'Выберите дни недели повтора.');
  const until = raw.until ?? null;
  if (until !== null && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until))) throw new HttpError(422, 'Проверьте дату окончания повторов.');
  const count = raw.count ?? null;
  if (count !== null && (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 500)) throw new HttpError(422, 'Число повторений — целое число от 1 до 500.');
  if (raw.freq === 'weekly' && (byWeekday as unknown[]).length === 0) throw new HttpError(422, 'Выберите хотя бы один день недели.');
  return { freq: raw.freq as RepeatRule['freq'], interval, byWeekday: byWeekday as number[], until, count };
}

function toParts(date: string) { return date.split('-').map(Number) as [number, number, number]; }
function fromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function addDays(date: string, days: number) {
  const [year, month, day] = toParts(date);
  const value = new Date(year, month - 1, day + days);
  return fromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}
function addMonthsClamped(date: string, months: number) {
  const [year, month, day] = toParts(date);
  const target = new Date(year, month - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return fromParts(target.getFullYear(), target.getMonth() + 1, Math.min(day, last));
}
const weekdayOf = (date: string) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
const WEEKDAYS_RU = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const MONTHLY_RU = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

// Emits local dates of occurrences in [from, to]; stops early once count/until are exhausted.
export function expandDates(startDate: string, rule: RepeatRule, from: string, to: string): string[] {
  const result: string[] = [];
  const push = (date: string, seen: number) => {
    if (rule.until && date > rule.until) return false;
    if (rule.count && seen >= rule.count) return false;
    if (date >= from && date <= to) result.push(date);
    return true;
  };
  if (rule.freq === 'daily') {
    let seen = 0, date = startDate, guard = 0;
    while (date <= to && guard++ < 4000) { if (!push(date, seen)) break; seen += 1; date = addDays(date, rule.interval); }
  } else if (rule.freq === 'weekly') {
    const anchorWeekday = weekdayOf(startDate);
    const days = [...rule.byWeekday].sort((a, b) => a - b);
    // Occurrences on/before the anchor day of the first week belong to the series start.
    let seen = 0, weekStart = addDays(startDate, -anchorWeekday), guard = 0;
    while (weekStart <= to && guard++ < 1000) {
      let weekDone = true;
      for (const day of days) {
        const date = addDays(weekStart, day);
        if (date < startDate) continue;
        if (!push(date, seen)) return result;
        seen += 1; weekDone = false;
      }
      if (weekDone && days.every(day => addDays(weekStart, day) < startDate)) return result;
      weekStart = addDays(weekStart, 7 * rule.interval);
    }
  } else {
    const step = rule.freq === 'yearly' ? rule.interval * 12 : rule.interval;
    let seen = 0, guard = 0;
    while (guard++ < 1000) {
      const date = addMonthsClamped(startDate, seen * step);
      if (date > to) break;
      if (!push(date, seen)) break;
      seen += 1;
    }
  }
  return result;
}

export function repeatLabel(startDate: string, rule: RepeatRule | null): string {
  if (!rule) return 'Не повторять';
  const unit = { daily: ['день', 'дня', 'дней'], weekly: ['неделю', 'недели', 'недель'], monthly: ['месяц', 'месяца', 'месяцев'], yearly: ['год', 'года', 'лет'] }[rule.freq];
  const plural = (n: number, forms: string[]) => forms[n % 10 === 1 && n % 100 !== 11 ? 0 : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 1 : 2];
  let label = rule.interval === 1
    ? { daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц', yearly: 'Каждый год' }[rule.freq]
    : `Каждые ${rule.interval} ${plural(rule.interval, unit)}`;
  if (rule.freq === 'weekly' && rule.byWeekday.length) label += ` по ${rule.byWeekday.map(day => WEEKDAYS_RU[day]).join(', ')}`;
  if (rule.freq === 'monthly' && rule.interval === 1) {
    const [y, m, d] = toParts(startDate);
    label = `Каждый месяц ${d}-го`;
    const last = new Date(y, m, 0).getDate();
    if (d + 7 > last) label = `Каждый месяц в последний ${MONTHLY_RU[weekdayOf(startDate)]}`;
  }
  if (rule.until) { const [y, m, d] = toParts(rule.until); label += ` (до ${d}.${m}.${y})`; }
  else if (rule.count) label += ` (${rule.count} повторений)`;
  return label;
}
