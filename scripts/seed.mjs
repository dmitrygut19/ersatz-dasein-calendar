import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const designTokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));

export function seedDemo(file) {
  if (path.resolve(file).includes(`${path.sep}calendar-app${path.sep}`)) throw new Error('Use a separate experiment database.');
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  try {
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
      if (db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name)) continue;
      db.transaction(() => {
        db.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, Date.now());
      })();
    }
    removeLegacyDemo(db);
    ensureTypes(db);
    ensureEvents(db);
    if (db.prepare('SELECT COUNT(*) AS count FROM participants').get().count === 0) seedParticipants(db);
  } finally { db.close(); }
}

function removeLegacyDemo(db) {
  const eventIds = ['demo-congress-event', 'demo-saturnalia-event', 'demo-arena-series', 'demo-mentoring-sept', 'demo-review-sept', 'demo-open-link', 'demo-weekday-1', 'demo-weekday-2', 'demo-weekday-3', 'demo-weekday-4', 'demo-weekday-5', 'demo-wednesday-congress', 'demo-congress-discussion', 'demo-saturnalia-intro'];
  db.transaction(() => {
    for (const id of eventIds) {
      db.prepare('DELETE FROM participant_activity WHERE event_key = ? OR event_key LIKE ?').run(id, `${id}@%`);
      db.prepare('DELETE FROM participant_reminders WHERE event_key = ? OR event_key LIKE ?').run(id, `${id}@%`);
      db.prepare('DELETE FROM type_skips WHERE event_id = ?').run(id);
      db.prepare('DELETE FROM import_matches WHERE manual_event_id = ?').run(id);
      db.prepare('DELETE FROM event_type_usage WHERE event_id = ?').run(id);
      db.prepare('DELETE FROM events WHERE id = ?').run(id);
    }
    db.prepare("DELETE FROM event_types WHERE id IN ('demo-arena', 'demo-open-link-type')").run();
  })();
}

// Idempotent per id: the local database may hold the user's own data alongside demo rows.
function ensureTypes(db) {
  db.transaction(() => {
    const insert = db.prepare('INSERT INTO event_types (id, name, recognition_words, access_label, points, venue, venue_url, cover_path, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
    const now = Date.now(), demoUrl = 'https://mentors.ersatz-dasein.ru/';
    insert.run('demo-congress', 'Конгресс', 'конгресс', 'Все', 0, 'Discord', demoUrl, '/assets/panel/a5ff5.png', 'ordinary', now, now);
    insert.run('demo-saturnalia', 'Сатурналии', 'сатурналии', 'Участники Сатурналий', 10, 'Discord', demoUrl, '/assets/panel/2a38c.png', 'saturnalia', now + 1, now);
    insert.run('demo-community-meeting', 'Встреча участников', 'встреча участников', 'Все', 0, 'Jitsi', 'https://meet.jit.si/', '/assets/event-covers/community-table.png', 'ordinary', now + 2, now);
    insert.run('demo-project-discussion', 'Обсуждение проектов', 'обсуждение проектов', 'Все', 0, 'YouTube', 'https://www.youtube.com/', '/assets/event-covers/project-scrolls.png', 'ordinary', now + 3, now);
    // Editable type data, not calendar-only presentation overrides.
    const ink = designTokens.color.primitive;
    const illustration = JSON.stringify({theme:'ordinary',start:ink['white-100'],end:ink['white-100'],accent:ink['copper-700'],text:ink['brown-900'],bordered:true,coverMode:'illustration'});
    for (const id of ['demo-community-meeting','demo-project-discussion']) {
      db.prepare('UPDATE event_types SET appearance = ? WHERE id = ? AND appearance IS NULL').run(illustration,id);
    }
    for (const [id, oldCover, cover, mode, theme] of [
      ['demo-congress', '/assets/panel/a5ff5.png', '/assets/cover-examples/congress-illustration.png', 'illustration', 'ordinary'],
      ['demo-saturnalia', '/assets/panel/2a38c.png', '/assets/panel/2a38c.png', 'poster', 'saturnalia'],
    ]) {
      const previousAppearance = { theme, start: ink['white-100'], end: ink['white-100'], accent: ink['copper-700'], text: ink['brown-900'], bordered: true, coverMode: mode };
      const sat = designTokens.eventTheme.saturnalia;
      const appearance = theme === 'saturnalia'
        ? { ...previousAppearance, start: sat.backgroundStart, end: sat.backgroundEnd, accent: sat.cellBorder, text: sat.text }
        : previousAppearance;
      db.prepare('UPDATE event_types SET cover_path = ?, appearance = ?, updated_at = ? WHERE id = ? AND appearance IS NULL AND cover_path = ?')
        .run(cover, JSON.stringify(appearance), now, id, oldCover);
      if (theme === 'saturnalia') {
        // Restore only the untouched cream sample; retain custom administrator edits.
        db.prepare('UPDATE event_types SET cover_path = ?, appearance = ?, updated_at = ? WHERE id = ? AND cover_path = ? AND appearance = ?')
          .run(cover, JSON.stringify(appearance), now, id, '/assets/cover-examples/antique-poster-v2.jpg', JSON.stringify(previousAppearance));
      }
    }
    // Type inheritance changes only the known default cover. Release overrides
    // live in event_occurrence_overrides and are deliberately never written here.
    db.prepare("UPDATE event_types SET cover_path = ?, updated_at = ? WHERE id = 'demo-congress' AND cover_path IN (?, ?)")
      .run('/assets/panel/a5ff5.png',now,'/assets/event-covers/congress-temple.png','/assets/cover-examples/congress-illustration.png');
    // The flat Congress artwork is a full-day poster, like Saturnalia.
    // Keep per-release appearance overrides untouched.
    db.prepare("UPDATE event_types SET appearance = json_set(appearance, '$.coverMode', 'poster'), updated_at = ? WHERE id = 'demo-congress' AND cover_path = ? AND json_extract(appearance, '$.coverMode') = 'illustration'")
      .run(now,'/assets/panel/a5ff5.png');
    db.prepare("UPDATE event_types SET cover_path = ?, updated_at = ? WHERE id = 'demo-saturnalia' AND cover_path = ?")
      .run('/assets/panel/2a38c.png',now,'/assets/event-covers/saturnalia-spears.png');
    db.prepare("UPDATE event_types SET venue_url = ? WHERE id IN ('demo-congress','demo-saturnalia') AND venue_url = ''").run(demoUrl);
  })();
}

function ensureEvents(db) {
  db.transaction(() => {
    const now = Date.now();
    const insert = db.prepare(`INSERT INTO events (id, title, description, url, venue, start_date, start_time, end_time, timezone, repeat_rule, source, status, type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Europe/Moscow', ?, 'manual', 'confirmed', ?, ?, ?) ON CONFLICT(id) DO NOTHING`);
    insert.run('demo-congress-series', 'Конгресс', 'Встреча сообщества: обсуждение работ и вопросов участников.', '', 'Discord', '2026-11-09', '20:00', '21:30', JSON.stringify({ freq: 'weekly', interval: 1, byWeekday: [0], until: null, count: 3 }), 'demo-congress', now, now);
    insert.run('demo-saturnalia-series', 'Сатурналии', 'Тематическая встреча участников Сатурналий.', '', 'Discord', '2026-11-08', '20:00', '21:30', JSON.stringify({ freq: 'weekly', interval: 1, byWeekday: [6], until: null, count: 3 }), 'demo-saturnalia', now, now);
    // Multiple occurrences on a day make desktop/mobile paging reviewable.
    insert.run('demo-congress-sunday', 'Конгресс', 'Демонстрационное событие другого типа в день Сатурналий для проверки переключения тем и доступа.', '', 'Discord', '2026-11-08', '18:30', '19:30', JSON.stringify({ freq: 'weekly', interval: 1, byWeekday: [6], until: null, count: 3 }), 'demo-congress', now, now);
    insert.run('demo-saturnalia-special', 'Сатурналии', 'Демонстрация специального оформления Сатурналий в отдельном дне календаря.', '', 'Discord', '2026-11-14', '20:00', '21:30', null, 'demo-saturnalia', now, now);
    insert.run('demo-title-medium', 'Встреча участников сообщества', 'Пример переноса заголовка на несколько строк для проверки оформления календаря.', '', 'Discord', '2026-11-17', '19:00', '20:00', null, 'demo-community-meeting', now, now);
    insert.run('demo-title-long', 'Обсуждение проектов участников нашего сообщества', 'Пример длинного заголовка. Текст и оформление можно изменить в админке.', '', 'Discord', '2026-11-18', '19:00', '20:00', null, 'demo-project-discussion', now, now);
    // Explicit known demo IDs, never a title-keyword/image substitution in UI.
    // Preserve a different type chosen by an editor, and all release overrides.
    for (const [id,oldType,type] of [['demo-title-medium','demo-congress','demo-community-meeting'],['demo-title-long','demo-saturnalia','demo-project-discussion']]) {
      const changed=db.prepare('UPDATE events SET type_id = ?, updated_at = ? WHERE id = ? AND type_id = ?').run(type,now,id,oldType);
      if(changed.changes) db.prepare('UPDATE event_type_usage SET event_type_id = ? WHERE event_id = ?').run(type,id);
    }
    // Two light/dark examples per platform for the desktop venue comparison.
    insert.run('demo-platform-youtube', 'Конгресс', 'Демонстрационный пример площадки YouTube для сравнения оформления.', 'https://www.youtube.com/', 'YouTube', '2026-11-19', '19:00', '20:00', null, 'demo-congress', now, now);
    for (const [id, venue, url] of [
      ['demo-saturnalia-special', 'Jitsi', 'https://meet.jit.si/'],
      ['demo-title-medium', 'Jitsi', 'https://meet.jit.si/'],
      ['demo-title-long', 'YouTube', 'https://www.youtube.com/'],
    ]) db.prepare("UPDATE events SET venue = ?, url = ?, updated_at = ? WHERE id = ? AND venue = 'Discord' AND url = ''").run(venue, url, now, id);
    // Shorten only the known sample labels; preserve names edited in the admin.
    for (const [id, previous, title] of [
      ['demo-congress-sunday', 'Конгресс — встреча в воскресенье', 'Конгресс'],
      ['demo-saturnalia-special', 'Сатурналии — специальное событие', 'Сатурналии'],
    ]) db.prepare('UPDATE events SET title = ?, updated_at = ? WHERE id = ? AND title = ?').run(title, now, id, previous);
    for (const [id, type] of [['demo-congress-series', 'demo-congress'], ['demo-saturnalia-series', 'demo-saturnalia'], ['demo-congress-sunday', 'demo-congress'], ['demo-saturnalia-special', 'demo-saturnalia'], ['demo-title-medium', 'demo-community-meeting'], ['demo-title-long', 'demo-project-discussion'], ['demo-platform-youtube', 'demo-congress']]) {
      db.prepare('INSERT INTO event_type_usage VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING').run(id, type);
    }
    // Upgrade only untouched legacy demo schedules; preserve administrator edits.
    for (const [id, weekday, oldDate, date] of [
      ['demo-congress-series', 0, '2026-08-10', '2026-11-09'],
      ['demo-saturnalia-series', 6, '2026-08-09', '2026-11-08'],
      ['demo-congress-sunday', 6, '2026-08-09', '2026-11-08'],
    ]) {
      const rule = { freq: 'weekly', interval: 1, byWeekday: [weekday], until: null, count: null };
      db.prepare('UPDATE events SET start_date = ?, repeat_rule = ?, updated_at = ? WHERE id = ? AND start_date = ? AND repeat_rule = ?')
        .run(date, JSON.stringify({ ...rule, count: 3 }), now, id, oldDate, JSON.stringify(rule));
    }
  })();
}

// Deterministic pseudo-random stream so every fresh database seeds identically.
function rng(seed) { let state = seed; return () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

function latestWeekday(weekday) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() - weekday + 7) % 7);
  return date.toISOString().slice(0, 10);
}

function seedParticipants(db) {
  const random = rng(42);
  const now = Date.now();
  const congressKey = `demo-congress-series@${latestWeekday(1)}`;
  const saturnaliaKey = `demo-saturnalia-series@${latestWeekday(0)}`;
  const insertParticipant = db.prepare('INSERT INTO participants (id, telegram_id, nick, tier, degree, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertActivity = db.prepare('INSERT INTO participant_activity (id, participant_id, event_key, kind, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertReminder = db.prepare('INSERT INTO participant_reminders (participant_id, event_key, enabled, updated_at) VALUES (?, ?, 1, ?)');
  db.transaction(() => {
    for (let index = 0; index < 18; index++) {
      const id = `demo-participant-${index + 1}`;
      const tier = ['I', 'II', 'III'][index % 3];
      const degree = index % 4 === 3 ? null : ['I', 'II', 'III'][index % 3];
      insertParticipant.run(id, String(700000 + index), index === 0 ? '@nickname' : `@participant_${index + 1}`, tier, degree, now, now);
      let counter = 0;
      const act = (eventKey, kinds) => {
        for (const kind of kinds) insertActivity.run(`act-${index}-${counter++}`, id, eventKey, kind, now - counter * 1000);
      };
      if (index === 0 || random() < 0.6) act(saturnaliaKey, ['view']);
      if (index === 0 || random() < 0.25) act(saturnaliaKey, ['open']);
      if (index === 0 || random() < 0.85) act(congressKey, ['view']);
      if (index === 0 || random() < 0.45) act(congressKey, ['open']);
      if (index === 0 || random() < 0.35) insertReminder.run(id, congressKey, now);
    }
  })();
}
