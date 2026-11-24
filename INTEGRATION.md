# Интеграция с сайтом и Telegram

## Ответственность

В репозитории — публичный календарь и админка с общим сервером и SQLite. Принимающая команда подключает домен/прокси, постоянное хранение и настоящую идентификацию. Будущий адрес публичной части: https://ersdsgn.club/cal; текущий маршрут — /calendar. Адрес админки определяется отдельно.

## Идентификация и права

Точки подключения: src/lib/auth.ts, calendar.ts, degree-access.ts, groups.ts, db/schema.ts и src/middleware.ts. В UserCalendar.vue сейчас используется идентификатор браузера. Присланные клиентом telegramId/participant не доказывают личность.

Проверять подлинность Telegram initData или серверной сессии, связывать проверенный Telegram ID с участником и получать членство/градус из доверенного источника. Демонстрационные вход и переключатели этого не обеспечивают. Группы лож первоначального снимка не содержат реальных списков участников.

Все события видимы. Сервер выдаёт ссылку участия только при выполнении правил доступа: группы/ложи и градусы, включая точные наборы отдельных выпусков. Алгоритм — accessFor в src/lib/calendar.ts и src/lib/degree-access.ts; ICS повторно проверяет права.

## Публичные маршруты

- GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&participant=... — события и профиль.
- GET /api/calendar/covers/:id — загруженные изображения.
- GET /api/calendar/events/:id.ics — экспорт с проверкой прав.
- POST /api/calendar/activity — view/open/reminder_on/reminder_off.

Публичность определяется middleware по маршруту и методу.

## Административные API

Требуют доступа администратора (вход по секретной ссылке), если админка не открыта настройкой CALENDAR_ADMIN_OPEN=1.

- /api/types, /api/types/:id — CRUD типов.
- /api/events, /api/events/:id — CRUD событий; ID выпуска seriesId@YYYY-MM-DD кодируется в URL.
- /api/events/assign-type — назначение типа.
- /api/lodges, /api/groups, /api/groups/:id — ложи и группы.
- /api/calendar-preview — защищённое превью.
- /api/covers — POST загрузка; GET галерея; DELETE JSON {coverPath} убирает обложку из галереи. Назначенные обложки и сами изображения сохраняются. Список исключений хранится в calendar_settings; маршрут требует административного доступа вне демо.
- /api/integration — статус, синхронизация и отключение.
- POST /api/integration/connect — {provider: "google" | "yandex", url: "https://..."}.
- /api/integration/matches, /api/integration/matches/:id — сопоставление импорта.
- /api/type-suggestions, /api/type-suggestions/resolve — распознавание типов.
- /api/analytics/releases, /api/analytics/participants, /api/analytics/participants/:id, /api/analytics/activity — аналитика.

Методы, тела и ошибки: src/pages/api/ и scripts/verify.mjs. Запросы записи должны иметь корректный Origin; прокси передаёт исходные Host/X-Forwarded-Host и X-Forwarded-Proto.

## Импорт и бот

Основное подключение — iCal без OAuth-ключей. Один активный источник; повторная синхронизация сохраняет внутренние настройки. Приватные iCal-ссылки хранить как секреты.

config/community-calendar.json содержит публичную Google iCal-ссылку, первоначальный снимок и согласованные назначения типов/доступа. Это не резервная копия текущей базы.

Старый OAuth-код сохранён для совместимости; он запрашивает только чтение. Обратная запись в Google не реализована и требует прав владельца. Копия события в личном календаре независима от будущих изменений организатора.

calendarUrl формируется в src/lib/calendar-share.ts и серверной проекции календаря. При использовании ботом сначала проверять доступ. Отправка сообщений ботом в репозитории не реализована.
