// SQLite backup: uses better-sqlite3's online backup API (WAL-safe) and keeps
// the newest N copies. Run: npm run backup
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const source = path.resolve(process.env.CALENDAR_DATABASE_PATH ?? 'data/experiment.sqlite');
const dir = path.resolve(process.env.CALENDAR_BACKUP_DIR ?? 'backups');
const keep = Number(process.env.CALENDAR_BACKUPS_KEEP ?? 14);
if (!Number.isSafeInteger(keep) || keep < 1) throw new Error('CALENDAR_BACKUPS_KEEP must be a positive integer.');

if (source.includes(`${path.sep}calendar-app${path.sep}`)) throw new Error('Refusing to touch the calendar-app database.');
const stamp = new Date().toISOString().replace(/[:T]/g, '-');
const target = path.join(dir, `backup-${stamp}-${randomUUID()}.sqlite`);
// A typo must fail, rather than create an empty database and rotate good copies.
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
