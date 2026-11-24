# Архитектура

- src/pages/calendar.astro — публичный календарь; src/pages/admin/index.astro — админка.
- src/pages/admin/* — также защищённые каталоги компонентов и состояний для разработки.
- src/pages/index.astro — обмен временного токена из URL-фрагмента на cookie.
- src/components/calendar/ — общий календарь, карточка и мобильная шторка; используются и в административном превью.
- src/components/admin/, src/components/ui/ — рабочие панели и общие компоненты.
- src/pages/api/ — HTTP; src/middleware.ts — доступ, Origin и выбор базы.
- src/lib/ — импорт, повторы, доступ, аналитика, оформление.
- src/lib/db/ и drizzle/ — SQLite, Drizzle и последовательные миграции.
- design/tokens.json и public/ — токены и локальные ресурсы.
- config/community-calendar.json — согласованное начальное наполнение.
- scripts/ — сборка, запуск, seed, backup и регрессии.

SQLite работает в WAL-режиме. Миграции применяются при открытии базы. Внешнее расписание обновляется iCal, внутренние настройки хранятся независимо. Повторы и исключения раскрываются сервером.

Админка управляется AdminWorkspace.vue через scene. admin-demo.ts содержит список экранов и типы, импортируемые рабочими компонентами (название историческое). scripts/seed.mjs — синтетический набор только для автотестов; приложение его не запускает. seed-shared-calendar.mjs загружает снимок сообщества при запуске.

## Режимы

Режим один: файловая БД CALENDAR_DATABASE_PATH, общая для календаря и админки. Тестового режима, временных браузерных баз и демо-входа нет (удалены 25.11.2026).

Доступ к админке и её API (src/lib/deployment-mode.ts, middleware.ts): по умолчанию только localhost и вход по секретной ссылке (auth.ts). CALENDAR_ALLOW_REMOTE=1 разрешает внешний домен, CALENDAR_ADMIN_OPEN=1 открывает админку без входа до подключения Telegram. CALENDAR_SHARED_FEED_URL закрепляет iCal сообщества как единственный источник.

render-start.mjs и npm run preview:community загружают снимок config/community-calendar.json в пустую базу и обновляют его из Google.

lino-ui зафиксирован lock-файлом. Перед сборкой генерируются tokens.css и admin-lino-kit.css. Остальные подготовленные ресурсы входят в Git. README и manifest рядом с изображениями сохраняют их происхождение.
