export const screens = [
  { id: 'login', title: 'Вход в админку', group: 'Вход' },
  { id: 'denied', title: 'Нет доступа', group: 'Вход' },
  { id: 'connect', title: 'Подключение календаря', group: 'Подключение' },
  { id: 'connect-error', title: 'Ошибка подключения', group: 'Подключение' },
  { id: 'calendar', title: 'Календарь и типы событий', group: 'Рабочая область' },
  { id: 'manual', title: 'Ручной режим', group: 'Рабочая область' },
  { id: 'access', title: 'События без типа', group: 'Рабочая область' },
  { id: 'type-edit', title: 'Редактирование типа', group: 'Рабочая область' },
  { id: 'type-new', title: 'Создание типа', group: 'Рабочая область' },
  { id: 'event', title: 'Карточка события', group: 'События' },
  { id: 'event-settings', title: 'Настройки события', group: 'События' },
  { id: 'appearance-type', title: 'Оформление типа', group: 'Оформление' },
  { id: 'appearance-event', title: 'Оформление события', group: 'Оформление' },
  { id: 'event-new', title: 'Добавить событие', group: 'Ручное добавление' },
  { id: 'event-past', title: 'Событие на прошедшую дату', group: 'Ручное добавление' },
  { id: 'event-repeat', title: 'Выбор повтора', group: 'Ручное добавление' },
  { id: 'repeat-custom', title: 'Настройка повторов', group: 'Ручное добавление' },
  { id: 'integration-connected', title: 'Подключение: подключён', group: 'Статус интеграции' },
  { id: 'integration-syncing', title: 'Подключение: обновление', group: 'Статус интеграции' },
  { id: 'integration-error', title: 'Подключение: ошибка', group: 'Статус интеграции' },
  { id: 'integration-disconnected', title: 'Подключение: отключён', group: 'Статус интеграции' },
  { id: 'participants', title: 'Участники', group: 'Аналитика' },
  { id: 'participant', title: 'Активность участника', group: 'Аналитика' },
  { id: 'participants-empty', title: 'Нет активности', group: 'Аналитика' },
  { id: 'participants-error', title: 'Ошибка аналитики', group: 'Аналитика' },
] as const;

export type DemoEvent = { allDay?: boolean; typeId?: string | null; sourceCalendarId?: string | null; requiresAuth?: boolean; typeTier?: string | null; sourceSeriesId?: string | null; allowedDegrees?: string[] | null; affiliationDegree?: string | null; communityEvent?: boolean; typeDegree?: string | null; degreeOverride?: boolean; topicLodgeId?: string | null; audienceLodgeIds?: string[]; id: string; eventId?: string; title: string; date: string; start: string; end: string; typeName: string; source: 'Google Calendar' | 'Яндекс Календарь' | 'Админка'; access: string; points: number; cover: string; description: string; url: string; ownUrl?: string; repeat: string; repeatRule?: unknown; typeTheme?: string | null; appearance?: import('./appearance').Appearance | null; accessOverride?: boolean; pointsOverride?: boolean; };
export const initialEvents: DemoEvent[] = [
  { id: 'demo-saturnalia-event', title: 'Сатурналии', date: '2026-11-11', start: '18:00', end: '19:30', typeName: 'Сатурналии', source: 'Админка', access: 'Участники Сатурналий', points: 10, cover: '/assets/panel/2a38c.png', description: 'Тематическая встреча участников Сатурналий. Все сведения на этом экране — демонстрационные.', url: '', repeat: 'Не повторять' },
  { id: 'demo-congress-event', title: 'Конгресс', date: '2026-11-11', start: '20:00', end: '21:30', typeName: 'Конгресс', source: 'Админка', access: 'Все', points: 0, cover: '/assets/panel/a5ff5.png', description: 'Встреча сообщества: обсуждение работ и вопросов участников.', url: '', repeat: 'Не повторять' },
];
export const demoParticipants = Array.from({ length: 42 }, (_, index) => ({
  id: `participant-${index + 1}`, nick: index === 0 ? '@nickname' : `@participant_${index + 1}`,
  degree: ['II', '', 'I', 'III'][index % 4],
  action: index % 3 === 0 ? 'Перешёл' : 'Посмотрел', reminder: index % 4 === 0,
  time: `${String(13 - index % 5).padStart(2, '0')} сен · ${String(14 - index % 5).padStart(2, '0')}:${String(52 - index % 40).padStart(2, '0')}`,
}));
export function dateLabel(value: string) { const [year, month, day] = value.split('-').map(Number); return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day)); }
export function dateShortLabel(value: string) { const [year, month, day] = value.split('-').map(Number); return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day)); }
