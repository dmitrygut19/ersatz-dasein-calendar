// Production start (`npm start`, Render): seed the community calendar from config, launch the server,
// refresh from Google and print a summary of what is running.
// Seeding is idempotent: a database that was already initialised keeps its data and admin settings.
// On a host without a persistent disk the snapshot is re-created on every deploy/restart.
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { seedSharedCalendar } from './seed-shared-calendar.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!existsSync('dist/server/entry.mjs')) {
  console.error('dist/ не найден: сначала выполните npm ci && npm run build.');
  process.exit(1);
}

process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= '4321';
process.env.CALENDAR_DATABASE_PATH ??= path.resolve('data/calendar.sqlite');
const configFile = 'config/community-calendar.json';
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null;
if (config) {
  seedSharedCalendar(process.env.CALENDAR_DATABASE_PATH, config);
  // The admin may restyle events and change access, but cannot swap the community source.
  process.env.CALENDAR_SHARED_FEED_URL ??= config.url;
}

await import('../dist/server/entry.mjs');

const origin = `http://127.0.0.1:${process.env.PORT}`;
const token = process.env.CALENDAR_EXPERIMENT_TOKEN ?? '';
const headers = { Origin: origin, 'Content-Type': 'application/json' };
if (token) headers.Authorization = `Bearer ${token}`;
let integration = null;
if (config) {
  // Refresh from Google once at start; the checked snapshot stays if Google is offline.
  // Later updates come from the background sync scheduler.
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(origin + '/api/integration', { method: 'POST', headers, body: JSON.stringify({ action: 'sync' }), signal: AbortSignal.timeout(25000) });
      if (response.ok) integration = (await response.json()).integration;
      else integration = { state: `обновится фоновой синхронизацией в течение минуты (HTTP ${response.status})` };
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// Start-up summary for operators and deployment agents.
try {
  const page = await (await fetch(origin + '/calendar')).text();
  const release = page.match(/data-calendar-release="([^"]+)"/)?.[1] ?? 'unknown';
  const events = (await (await fetch(origin + '/api/calendar')).json()).events?.length ?? 0;
  const open = process.env.CALENDAR_ADMIN_OPEN === '1' || process.env.CALENDAR_PUBLIC_DEMO === '1';
  const remote = process.env.CALENDAR_ALLOW_REMOTE === '1' || process.env.CALENDAR_DEMO_REMOTE === '1';
  const secret = process.env.CALENDAR_EXPERIMENT === 'local' && token.length >= 32;
  const admin = open
    ? (remote ? 'открыта без входа' : 'открыта без входа, но только с localhost — для сервера задайте CALENDAR_ALLOW_REMOTE=1')
    : secret
      ? `закрыта, вход по секретной ссылке <адрес>/#<CALENDAR_EXPERIMENT_TOKEN>${remote ? '' : ' (только с localhost — задайте CALENDAR_ALLOW_REMOTE=1)'}`
      : 'закрыта и войти нельзя — задайте CALENDAR_ADMIN_OPEN=1 или CALENDAR_EXPERIMENT=local и токен (см. README)';
  console.log([
    '',
    'Календарь сообщества запущен',
    `  версия:        ${release}`,
    `  адрес:         http://${process.env.HOST}:${process.env.PORT}/calendar  (админка: /admin)`,
    `  база:          ${process.env.CALENDAR_DATABASE_PATH}`,
    `  события:       ${events} в ближайшем окне${config ? ', источник — Google iCal сообщества' : ', источник не подключён (нет config/community-calendar.json)'}`,
    `  синхронизация: ${integration ? integration.state : config ? 'нет ответа (снимок сохранён; проверьте доступ к Google)' : '—'}`,
    `  админка:       ${admin}`,
    '',
  ].join('\n'));
} catch (error) {
  console.error('Не удалось собрать сводку запуска:', error instanceof Error ? error.message : error);
}
