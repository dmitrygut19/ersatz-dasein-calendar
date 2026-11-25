// SQLite backup: uses better-sqlite3's online backup API (WAL-safe) and keeps
// the newest N copies. Run: npm run backup (reads .env like npm start; set variables win).
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

if (existsSync('.env')) process.loadEnvFile('.env');
// Same default as npm start (scripts/render-start.mjs).
const source = path.resolve(process.env.CALENDAR_DATABASE_PATH ?? 'data/calendar.sqlite');
const dir = path.resolve(process.env.CALENDAR_BACKUP_DIR ?? 'backups');
const keep = Number(process.env.CALENDAR_BACKUPS_KEEP ?? 14);
if (!Number.isSafeInteger(keep) || keep < 1) {
  console.error(`CALENDAR_BACKUPS_KEEP должно быть целым числом от 1, сейчас: «${process.env.CALENDAR_BACKUPS_KEEP}». Копии не тронуты.`);
  process.exit(1);
}

if (source.includes(`${path.sep}calendar-app${path.sep}`)) throw new Error('Refusing to touch the calendar-app database.');
const stamp = new Date().toISOString().replace(/[:T]/g, '-');
const target = path.join(dir, `backup-${stamp}-${randomUUID()}.sqlite`);
// A typo must fail, rather than create an empty database and rotate good copies.
if (!existsSync(source)) {
  console.error(`База не найдена: ${source}. Укажите CALENDAR_DATABASE_PATH (в .env или окружении) — тот же путь, что у работающего приложения.`);
  process.exit(1);
}
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  mkdirSync(dir, { recursive: true });
  await db.backup(target);
  console.log(`Backup written: ${target}`);
} finally {
  db.close();
}

const files = readdirSync(dir).filter(file => file.startsWith('backup-') && file.endsWith('.sqlite')).sort();
for (const file of files.slice(0, Math.max(0, files.length - keep))) {
  rmSync(path.join(dir, file));
  console.log(`Removed old backup: ${file}`);
}
