// Hosted start (Render): seed the community calendar from config, then launch the server.
// Seeding is idempotent: a database that was already initialised keeps its data and admin settings.
// On the free tier the disk is ephemeral, so the snapshot is re-created on every deploy/restart.
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { seedSharedCalendar } from './seed-shared-calendar.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

process.env.CALENDAR_DATABASE_PATH ??= path.resolve('data/calendar.sqlite');
const configFile = 'config/community-calendar.json';
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null;
if (config) {
  seedSharedCalendar(process.env.CALENDAR_DATABASE_PATH, config);
  // The admin may restyle events and change access, but cannot swap the community source.
  process.env.CALENDAR_SHARED_FEED_URL ??= config.url;
}

await import('../dist/server/entry.mjs');

if (config) {
  // Refresh from Google once at start; the checked snapshot stays if Google is offline.
  // Later updates come from the background sync scheduler.
  const origin = `http://127.0.0.1:${process.env.PORT || 4321}`;
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (process.env.CALENDAR_EXPERIMENT_TOKEN) headers.Authorization = `Bearer ${process.env.CALENDAR_EXPERIMENT_TOKEN}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(origin + '/api/integration', { method: 'POST', headers, body: JSON.stringify({ action: 'sync' }), signal: AbortSignal.timeout(25000) });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
