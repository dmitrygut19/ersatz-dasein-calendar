import { defaultAppearance, buttonDefaults, type Appearance } from './appearance';

export function normalizedAppearance(value: Appearance | null | undefined, theme?: string | null): Appearance {
  const base = value ?? defaultAppearance(theme);
  const button = buttonDefaults(base.theme);
  return { ...base, coverMode: base.coverMode ?? 'illustration', buttonBackground: base.buttonBackground ?? button.background, buttonText: base.buttonText ?? button.text, buttonAccent: base.buttonAccent ?? button.accent };
}

// Series defaults and sparse release overrides. null degree means type inheritance;
// empty degree explicitly admits every degree. Topic never grants membership.
export type EventSettings = {
  allowedDegrees?: string[] | null;
  affiliationDegrees?: string[] | null;
  affiliationDegree?: string | null; communityEvent?: boolean;
  requiresAuth?: boolean;
  title?: string; description?: string; url?: string;
  degree?: string | null; topicLodgeId?: string | null; audienceLodgeIds?: string[];
  dateOffset?: number; coverPath?: string | null; appearance?: Appearance | null;
  accessLabel?: string | null; points?: number | null;
};
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && shiftDate(date, 0) === date;
}
