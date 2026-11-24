// Public calendar surface for participants. Visibility is always full; what access
// controls is the follow-through: a viewer below the required tier/degree, outside
// the access group, or unidentified sees the event but cannot follow the link.
// Rules fixed 09.11.2026 (decisions.md): no points; tier/degree come from Telegram;
// access labels are participant groups; revocation keeps visibility, blocks the link.
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { participants, lodges, participantGroups } from './db/schema';
import { listOccurrences, upcomingWindow, type OccurrenceDto } from './events';
import { recordActivity } from './analytics';
import { isGroupMember } from './groups';
import type { Appearance } from './appearance';
import { publicDemoEnabled } from './public-demo';
import { googleCalendarUrl } from './calendar-share';
import { safeWebUrl } from './community-config';
import { cardReviewEnabled } from './card-review';
import { degreeAllowed } from './degree-access';
import { sharedCalendarEnabled } from './shared-calendar';

const RANK: Record<string, number> = { I: 1, II: 2, III: 3 };
const rank = (value: string | null | undefined) => (value ? RANK[value] ?? 0 : 0);

export type PublicEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  description: string;
  url: string;
  venue: string;
  cover: string | null;
  typeName: string | null;
  repeat: string;
  access: string;
  theme: string | null;
  appearance: Appearance | null;
  points: number;
  topicLodgeId: string | null; affiliationDegree: string | null; communityEvent: boolean;
  affiliationDegrees?: string[] | null;
  canFollow: boolean;
  reason: string | null;
  calendarUrl: string;
  calendarLabel: string;
  accessState: 'guest' | 'allowed' | 'blocked';
  requirements: AccessRequirement[];
  allDay: boolean; noEnd: boolean; endDate: string | null; timezone: string;
  status: 'scheduled' | 'cancelled';
};
export type AccessRequirement = { kind: 'auth' | 'degree' | 'tier' | 'membership'; text: string; conditions?: string; action?: string; url?: string };

export type Viewer = { id: string; tier: number; degree: number } | null;

export function resolveViewer(participantKey?: string | null): Viewer {
  if (!participantKey) return null;
  const row = getDb().select().from(participants).where(eq(participants.telegramId, participantKey)).get()
    ?? getDb().select().from(participants).where(eq(participants.id, participantKey)).get();
  if (!row) return null;
  return { id: row.id, tier: rank(row.tier), degree: rank(row.degree) };
}

// Display only: the same temporary participant lookup used by accessFor.
// Telegram verification remains the responsibility of the auth adapter.
export function publicAccount(participantKey?: string | null) {
  if (!participantKey) return null;
  const row = getDb().select().from(participants).where(eq(participants.telegramId, participantKey)).get()
    ?? getDb().select().from(participants).where(eq(participants.id, participantKey)).get();
  return row && rank(row.degree) ? { nick: row.nick, degree: row.degree } : null;
}

function accessFor(item: OccurrenceDto, viewer: Viewer) {
  const requirements: AccessRequirement[] = [];
  let audienceIncludesAccessLabel = false;
  if (item.requiresAuth && !viewer) requirements.push({kind:'auth',text:'Нужна авторизация'});
  if (item.audienceLodgeIds.length) {
    const directory = getDb().select().from(lodges).all();
    audienceIncludesAccessLabel = directory.some(lodge => item.audienceLodgeIds.includes(lodge.id) && lodge.name === item.access);
    const groups = getDb().select().from(participantGroups).all();
    const member = viewer && item.audienceLodgeIds.some(id => {
      const lodge = directory.find(row => row.id === id);
      const group = lodge?.groupId ? groups.find(row => row.id === lodge.groupId) : groups.find(row => row.name === lodge?.name);
      return group && isGroupMember(viewer.id, group.name);
    });
    if (!member) {
      // Audience is OR. Present every alternative, never confuse the topic with audience.
      for (const id of item.audienceLodgeIds) {
        const lodge = directory.find(row => row.id === id);
        requirements.push({kind:'membership',text:`Событие для участников «${lodge?.name ?? 'Ложа'}».`,
          conditions:lodge?.entryConditions || 'Условия вступления определяет магистр ложи.',
          url:safeWebUrl(lodge?.entryUrl), action:['Условия вступления','Подать заявку','Связаться с магистром'].includes(lodge?.entryAction ?? '') ? lodge!.entryAction! : 'Условия вступления'});
      }
    }
  }
  if (item.access !== 'Все' && !audienceIncludesAccessLabel && (!viewer || !isGroupMember(viewer.id, item.access))) {
    requirements.push({kind:'membership',text:`Событие для группы «${item.access}»`,conditions:'Условия вступления определяет магистр ложи.'});
  }
  const needTier = rank(item.typeTier), needDegree = rank(item.typeDegree);
  if (needTier && (!viewer || viewer.tier < needTier)) {
    requirements.push({kind:'tier',text:`Нужен тир ${item.typeTier}`});
  }
  if ((needDegree || item.allowedDegrees?.length) && !degreeAllowed(viewer?.degree ?? 0, item.allowedDegrees, item.typeDegree)) {
    requirements.push({kind:'degree',text:item.allowedDegrees?.length ? `Для участия нужен градус ${item.allowedDegrees.join(' или ')}.` : `Для участия нужен ${item.typeDegree} градус.`,conditions: viewer ? `Ваш текущий градус — ${Object.keys(RANK).find(key => RANK[key] === viewer.degree) ?? 'не подтверждён'}.` : undefined});
  }
  requirements.sort((a,b) => ['auth','degree','tier','membership'].indexOf(a.kind) - ['auth','degree','tier','membership'].indexOf(b.kind));
  return { canFollow: requirements.length === 0, reason: requirements.map(row => row.text).join(' ') || null,
    requirements, accessState: (requirements.length ? viewer ? 'blocked' : 'guest' : 'allowed') as PublicEvent['accessState'] };
}

export function publicCalendar(from?: string, to?: string, participantKey?: string | null, demoMember = false, previewDegree?: string): PublicEvent[] {
  const window = upcomingWindow();
  const viewer = resolveViewer(participantKey);
  return listOccurrences(from ?? window.from, to ?? window.to)
    .filter(item => item.status === 'scheduled' || cardReviewEnabled())
    .map(item => {
      const standardAccess = accessFor(item, viewer);
      // Admin preview compares degrees only; it does not impersonate a participant
      // or grant group membership. The public route never supplies previewDegree.
      const permission = previewDegree !== undefined
        ? !previewDegree || degreeAllowed(rank(previewDegree), item.allowedDegrees, item.typeDegree)
          ? { canFollow: true, reason: null }
          : { canFollow: false, reason: `Нужен градус ${item.allowedDegrees?.join(' или ') || item.typeDegree}` }
        : cardReviewEnabled() && demoMember
        ? {canFollow:true,reason:null}
        : sharedCalendarEnabled()
        ? demoMember ? { canFollow: true, reason: null } : standardAccess
        : publicDemoEnabled()
        ? demoMember
          ? { canFollow: true, reason: null }
          : item.typeName === 'Конгресс'
            ? standardAccess
            : { canFollow: false, reason: 'В демо без входа открыт только Конгресс' }
        : standardAccess;
      const access = { ...standardAccess, ...permission };
      if (item.status === 'cancelled') access.canFollow = false;
      // Preview/demo retain their explicit semantics, but never return hidden URLs.
      if (access.canFollow) { access.requirements = []; access.accessState = 'allowed'; }
      else if (previewDegree !== undefined || publicDemoEnabled()) access.accessState = demoMember ? 'blocked' : 'guest';
      const sourceUrl = safeWebUrl(item.sourceUrl);
      return {
        id: item.id, topicLodgeId: item.topicLodgeId, affiliationDegree: item.affiliationDegree, affiliationDegrees: item.affiliationDegrees, communityEvent: item.communityEvent, title: item.title, date: item.date, start: item.start, end: item.end,
        description: access.canFollow ? item.description : item.description.replace(/https?:\/\/[^\s<>]+/gi, '[ссылка доступна после проверки доступа]'), url: access.canFollow ? safeWebUrl(item.url) : '', venue: access.canFollow ? item.venue : item.venue.replace(/https?:\/\/[^\s<>]+/gi, '[ссылка доступна после проверки доступа]'), cover: item.cover,
        typeName: item.typeName, repeat: item.repeat, access: item.access, theme: item.typeTheme, appearance: item.appearance, points: item.points,
        allDay:item.allDay, noEnd:item.noEnd, endDate:item.endDate, timezone:item.timezone, status:item.status,
        calendarUrl: access.canFollow ? sourceUrl || (item.noEnd ? `/api/calendar/events/${encodeURIComponent(item.id)}.ics` : googleCalendarUrl(item)) : '',
        calendarLabel: sourceUrl ? 'Открыть исходное событие' : item.noEnd ? 'Добавить в календарь (.ics)' : 'Добавить в Google Calendar',
        ...access,
      };
    });
}

// Public activity ingest for the participant side. Identity is a stable
// participant key stored on the device; replace with Telegram initData when
// the bot contract lands (see INTEGRATION.md).
export function recordPublicActivity(input: unknown) {
  return recordActivity(input);
}
