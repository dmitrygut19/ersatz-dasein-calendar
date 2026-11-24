import type { EventSettings } from './event-settings';
export type ExternalEventDefault = { calendarId: string; seriesId: string; typeId: string; settings: EventSettings };
export const externalSeriesId = (id: string) => id.replace(/@\d{4}-\d{2}-\d{2}$/, '');
// Explicit assignments follow the provider UID, including renamed or moved series.
export function externalEventDefault(rules: ExternalEventDefault[], calendarId: string, id: string) {
  return rules.find(rule => rule.calendarId === calendarId && rule.seriesId === externalSeriesId(id));
}
