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

Админка управляется AdminWorkspace.vue через scene. admin-demo.ts содержит типы/состояния и резервные данные, импортируемые рабочими компонентами. Seed-скрипты нужны тестам и действующему демо-стенду. Удалять их по одному лишь названию нельзя.

## Режимы

1. Обычный: CALENDAR_PUBLIC_DEMO не равен 1; файловая БД CALENDAR_DATABASE_PATH, доступ через auth.ts.
2. Изолированное демо: CALENDAR_PUBLIC_DEMO=1 без общего источника; временные браузерные базы, импорт может сбрасываться при reload.
3. Общий демо-источник: CALENDAR_PUBLIC_DEMO=1 и CALENDAR_SHARED_CALENDAR=1; админка и календарь используют CALENDAR_SHARED_DATABASE_PATH через AsyncLocalStorage. Вход остаётся демонстрационным.

Render-launcher выбирает третий режим при наличии конфигурации сообщества. Обычный npm start его не включает.

lino-ui зафиксирован lock-файлом. Перед сборкой генерируются tokens.css и admin-lino-kit.css. Остальные подготовленные ресурсы входят в Git. README и manifest рядом с изображениями сохраняют их происхождение.
