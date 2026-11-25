import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.ok(existsSync(path.join(root, 'dist/server/entry.mjs')), 'Run npm run build first.');
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const runDirectory = mkdtempSync(path.join(artifacts, 'api-run-'));
const databaseFile = path.join(runDirectory, 'test.sqlite');
const token = randomBytes(32).toString('hex');
const results = [];
let server, base, output = '', cookie, typeId;

async function freePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const closed = once(server, 'exit');
  server.kill();
  await closed;
}
async function start(enabled, extraEnv = {}) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), CALENDAR_DATABASE_PATH: databaseFile };
  delete env.CALENDAR_EXPERIMENT;
  delete env.CALENDAR_EXPERIMENT_TOKEN;
  for (const key of ['CALENDAR_ADMIN_OPEN', 'CALENDAR_ALLOW_REMOTE', 'CALENDAR_PUBLIC_DEMO', 'CALENDAR_DEMO_REMOTE']) delete env[key];
  Object.assign(env, extraEnv);
  if (enabled) Object.assign(env, { CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token });
  server = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  let spawnError;
  server.on('error', error => { spawnError = error; });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Server exited with ${server.exitCode}: ${output}`);
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000), redirect: 'manual' })).status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${output}`);
}
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
}
async function request(route, { auth = true, method = 'GET', body, origin = base, headers = {}, rawBody } = {}) {
  const allHeaders = { ...headers };
  if (auth) allHeaders.Authorization = `Bearer ${token}`;
  if (!['GET', 'HEAD'].includes(method) && origin !== null) allHeaders.Origin = origin;
  if (body !== undefined || rawBody !== undefined) allHeaders['Content-Type'] ??= 'application/json';
  return fetch(base + route, { method, headers: allHeaders, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(5000), redirect: 'manual' });
}
// Raw HTTP so the Host header can be set (fetch does not allow it).
function rawStatus(route, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + route, { headers: { Authorization: `Bearer ${token}`, ...headers } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('timeout'))); req.end();
  });
}
async function list() { const response = await request('/api/types'); assert.equal(response.status, 200); return (await response.json()).types; }
function withDb(action) { const db = new Database(databaseFile); try { return action(db); } finally { db.close(); } }

try {
  await start(false);
  await check('Production default denies the admin page and every CRUD method', async () => {
    for (const [route, method] of [['/admin/types', 'GET'], ['/api/types', 'GET'], ['/api/types', 'POST'], ['/api/types/missing', 'PUT'], ['/api/types/missing', 'DELETE'], ['/api/local-session', 'POST']]) {
      const response = await request(route, { method, body: method === 'GET' ? undefined : { name: 'Blocked', token } });
      assert.equal(response.status, 401, `${method} ${route}: ${await response.text()}`);
    }
    assert.equal(existsSync(databaseFile), false, 'Denied requests must not create/open the database.');
  });
  await stop();
  await start(true);
  await check('Missing and forged credentials cannot read or mutate types', async () => {
    assert.equal((await request('/admin/types', { auth: false })).status, 401);
    assert.equal((await request('/api/types', { auth: false })).status, 401);
    assert.equal((await request('/api/types', { auth: false, headers: { Authorization: 'Bearer forged' } })).status, 401);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      assert.equal((await request(method === 'POST' ? '/api/types' : '/api/types/missing', { auth: false, method, body: { name: 'Blocked' } })).status, 401);
    }
    assert.equal(existsSync(databaseFile), false);
  });
  await check('Cross-origin and missing-origin writes are rejected', async () => {
    for (const origin of ['https://untrusted.example', null]) {
      assert.equal((await request('/api/types', { method: 'POST', body: { name: 'Blocked' }, origin })).status, 403);
    }
  });
  await check('Without CALENDAR_ALLOW_REMOTE admin and API refuse requests addressed to a public host', async () => {
    assert.equal(await rawStatus('/api/types', {}), 200);
    assert.equal(await rawStatus('/api/types', { Host: 'calendar.example' }), 403);
    assert.equal(await rawStatus('/admin', { Host: 'calendar.example' }), 403);
    assert.equal(await rawStatus('/api/types', { 'X-Forwarded-Host': 'calendar.example' }), 403);
    assert.equal(await rawStatus('/api/types', { 'X-Forwarded-For': '203.0.113.7' }), 403);
    assert.equal(await rawStatus('/calendar', { Host: 'calendar.example' }), 200, 'The public calendar page stays reachable.');
    assert.equal(await rawStatus('/api/calendar', { Host: 'calendar.example' }), 200, 'The public calendar API is not limited by CALENDAR_ALLOW_REMOTE.');
    assert.equal(await rawStatus('/api/calendar/events/missing.ics', { Host: 'calendar.example' }) === 403, false);
  });
  await check('Session login rejects invalid token shapes and wrong values', async () => {
    for (const value of [null, {}, 123, 'forged']) {
      assert.equal((await request('/api/local-session', { auth: false, method: 'POST', body: { token: value } })).status, 401);
    }
  });
  await check('Valid local login issues an HttpOnly SameSite=Lax cookie for OAuth return', async () => {
    const response = await request('/api/local-session', { auth: false, method: 'POST', body: { token } });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Lax/i); assert.doesNotMatch(header, /Secure/i, 'Plain-HTTP login works without Secure.');
    cookie = header.split(';')[0];
    assert.equal((await request('/api/types', { auth: false, headers: { Cookie: cookie } })).status, 200);
    assert.deepEqual(await list(), []);
  });
  await check('First database open applies migrations exactly once', async () => {
    await list(); await list();
    withDb(db => assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 9));
  });
  await check('The removed demo reset endpoint is not available', async () => {
    assert.equal((await request('/api/demo/reset',{method:'POST',body:{}})).status,404);
  });
  await check('Create saves all fields and trims strings', async () => {
    const response = await request('/api/types', { method: 'POST', body: { name: '  Тестовый тип  ', recognitionWords: ' тест ', accessLabel: ' Все ', tier: 'II', degree: 'I', points: 10, venue: ' Discord ', venueUrl: 'https://discord.gg/test', theme: 'arena', coverPath: '/assets/panel/a5ff5.png' } });
    assert.equal(response.status, 200);
    const type = (await response.json()).type;
    typeId = type.id;
    assert.match(typeId, /^[0-9a-f-]{36}$/);
    assert.deepEqual([type.name, type.recognitionWords, type.accessLabel, type.tier, type.degree, type.points, type.venue, type.venueUrl, type.theme, type.coverPath], ['Тестовый тип', 'тест', 'Все', 'II', 'I', 10, 'Discord', 'https://discord.gg/test', 'arena', '/assets/panel/a5ff5.png']);
    const stored = (await list())[0]; assert.equal(stored.id, typeId); assert.equal(stored.inUse, false);
    withDb(db => assert.equal(db.prepare('SELECT name FROM event_types WHERE id = ?').get(typeId).name, 'Тестовый тип'));
  });
  await check('Empty, whitespace-only, and oversized names are rejected without inserting', async () => {
    for (const name of ['', '   ', 'x'.repeat(81), 123]) assert.equal((await request('/api/types', { method: 'POST', body: { name } })).status, 422);
    assert.equal((await list()).length, 1);
  });
  await check('Negative, fractional, unsafe and string points are rejected', async () => {
    for (const points of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '10']) assert.equal((await request('/api/types', { method: 'POST', body: { name: 'Invalid', points } })).status, 422);
    assert.equal((await list()).length, 1);
  });
  await check('Invalid enums, cover paths and field lengths are rejected', async () => {
    for (const fields of [{ tier: 'IV' }, { degree: 'IV' }, { theme: 'unknown' }, { coverPath: 'https://untrusted.example/a.png' }, { recognitionWords: 'x'.repeat(241) }, { venue: 'Zoom' }, { venueUrl: 'not-a-url' }, { accessLabel: 'x'.repeat(121) }]) {
      assert.equal((await request('/api/types', { method: 'POST', body: { name: 'Invalid', ...fields } })).status, 422);
    }
  });
  await check('Malformed JSON, wrong content type and oversized body return controlled errors', async () => {
    assert.equal((await request('/api/types', { method: 'POST', rawBody: '{' })).status, 400);
    assert.equal((await request('/api/types', { method: 'POST', rawBody: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await request('/api/types', { method: 'POST', body: { name: 'x'.repeat(17_000) } })).status, 413);
    for (const body of [null, [], 'string']) assert.equal((await request('/api/types', { method: 'POST', body })).status, 422);
  });
  await check('Edit changes the same record and preserves the identifier', async () => {
    const response = await request(`/api/types/${typeId}`, { method: 'PUT', body: { name: 'Изменённый тип', points: 25 } });
    assert.equal(response.status, 200); assert.equal((await response.json()).type.id, typeId);
    const types = await list(); assert.equal(types.length, 1); assert.equal(types[0].name, 'Изменённый тип'); assert.equal(types[0].points, 25);
  });
  await check('Invalid edit preserves the previously saved record', async () => {
    assert.equal((await request(`/api/types/${typeId}`, { method: 'PUT', body: { name: ' ', points: 99 } })).status, 422);
    const type = (await list())[0]; assert.equal(type.name, 'Изменённый тип'); assert.equal(type.points, 25);
  });
  await check('Missing records return 404 for update and deletion', async () => {
    assert.equal((await request('/api/types/missing', { method: 'PUT', body: { name: 'Missing' } })).status, 404);
    assert.equal((await request('/api/types/missing', { method: 'DELETE' })).status, 404);
  });
  await check('SSR page contains saved data, a Vue hydration marker and no access token', async () => {
    const response = await request('/admin/types', { auth: false, headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.ok(html.includes('Изменённый тип')); assert.ok(html.includes('astro-island'));
    assert.ok(!html.includes(token));
  });
  await check('Every static reference asset is nonempty and served locally', async () => {
    const files = ['102b0.svg', '221fd.svg', '2a38c.png', '6713c.png', '72b88.svg', '92af4.svg', '940d0.svg', 'a5ff5.png', 'd3843.svg', 'd7d44.svg', 'e7fb1.svg'];
    for (const file of files) {
      const response = await request('/assets/panel/' + file, { auth: false });
      assert.equal(response.status, 200, file); assert.ok((await response.arrayBuffer()).byteLength > 0, file);
    }
  });
  await check('Referenced type cannot be deleted through the API or SQLite constraint', async () => {
    withDb(db => {
      db.pragma('foreign_keys = ON');
      db.prepare('INSERT INTO event_type_usage VALUES (?, ?)').run('test-event', typeId);
      assert.throws(() => db.prepare('DELETE FROM event_types WHERE id = ?').run(typeId), /FOREIGN KEY/);
    });
    assert.equal((await request(`/api/types/${typeId}`, { method: 'DELETE' })).status, 409);
    const type = (await list())[0]; assert.equal(type.id, typeId); assert.equal(type.inUse, true);
  });
  await stop(); await start(true);
  await check('Saved data and usage survive a real server-process restart', async () => {
    const type = (await list())[0];
    assert.equal(type.id, typeId); assert.equal(type.name, 'Изменённый тип'); assert.equal(type.points, 25); assert.equal(type.inUse, true);
    withDb(db => assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 9));
    assert.equal((await request(`/api/types/${typeId}`, { method: 'DELETE' })).status, 409);
  });
  await check('Removing usage allows deletion; repeating deletion returns 404', async () => {
    withDb(db => db.prepare('DELETE FROM event_type_usage WHERE event_id = ?').run('test-event'));
    assert.equal((await request(`/api/types/${typeId}`, { method: 'DELETE' })).status, 200);
    assert.deepEqual(await list(), []);
    assert.equal((await request(`/api/types/${typeId}`, { method: 'DELETE' })).status, 404);
  });
  await check('Nullable fields and zero points are stored correctly', async () => {
    for (const points of [null, 0]) {
      const response = await request('/api/types', { method: 'POST', body: { name: 'Граница', points } });
      assert.equal(response.status, 200);
      const type = (await response.json()).type;
      assert.equal(type.points, points); assert.equal(type.tier, null); assert.equal(type.degree, null);
    }
  });

  // ---- Events, recurrence and per-release overrides ----
  let eventTypeId, seriesId, monthlyId;
  const listEventsApi = async () => {
    const response = await request('/api/events');
    assert.equal(response.status, 200);
    return (await response.json()).events;
  };
  await check('Integration starts unconfigured and Google connect requires an iCal URL', async () => {
    const response = await request('/api/integration');
    assert.equal(response.status, 200);
    const status = (await response.json()).integration;
    assert.equal(status.state, 'none');
    assert.equal(status.pendingMatches, 0);
    const connect = await request('/api/integration/connect', { method: 'POST', body: {} });
    assert.equal(connect.status, 422);
    assert.match((await connect.json()).message, /iCal/);
  });
  await check('Yandex requires an iCal URL and unknown providers are rejected before storage', async () => {
    for (const body of [{ provider: 'yandex' }, { provider: 'yandex', login: '', password: 'x' }, { provider: 'yandex', login: 'user@yandex.ru', password: '' }, { provider: 'icloud' }]) {
      assert.equal((await request('/api/integration/connect', { method: 'POST', body })).status, 422, JSON.stringify(body));
    }
    const response = await request('/api/integration');
    assert.equal((await response.json()).integration.state, 'none');
  });
  await check('Manual mode is stored server-side', async () => {
    const response = await request('/api/integration', { method: 'POST', body: { action: 'manual' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).integration.state, 'manual');
  });
  await check('Event create validates required fields, time order and link format', async () => {
    eventTypeId = (await list()).find(type => type.name === 'Граница').id;
    const invalid = [
      { title: '', date: '2026-11-20', start: '19:00', end: '20:00' },
      { title: 'Перекрытие', date: '2026-11-20', start: '20:00', end: '19:00' },
      { title: 'Плохая ссылка', date: '2026-11-20', start: '19:00', end: '20:00', url: 'ftp://x' },
      { title: 'Нет времени', date: '2026-11-20', start: '19:00', end: '20:00', repeatRule: { freq: 'weekly', byWeekday: [] } },
      { title: 'Чужой тип', date: '2026-11-20', start: '19:00', end: '20:00', typeId: 'missing' },
    ];
    for (const body of invalid) assert.equal((await request('/api/events', { method: 'POST', body })).status, 422, JSON.stringify(body));
    assert.equal((await listEventsApi()).length, 0);
  });
  await check('Manual event is stored, linked to its type and listed with computed fields', async () => {
    const response = await request('/api/events', { method: 'POST', body: { title: 'Стрим', date: '2026-11-20', start: '19:00', end: '20:30', url: 'https://t.me/stream', description: 'Разбор работ', typeId: eventTypeId, repeatRule: null } });
    assert.equal(response.status, 200);
    const events = await listEventsApi();
    assert.equal(events.length, 1);
    const event = events[0];
    assert.match(event.id, /^[0-9a-f-]{36}$/);
    assert.equal(event.typeName, 'Граница');
    assert.equal(event.source, 'manual');
    assert.equal(event.repeat, 'Не повторять');
    const types = await list();
    assert.equal(types.find(type => type.id === eventTypeId).inUse, true);
    assert.equal((await request(`/api/types/${eventTypeId}`, { method: 'DELETE' })).status, 409);
  });
  await check('New events immediately expose an individual Google Calendar link', async () => {
    const created = await request('/api/events', { method: 'POST', body: { title: 'Встреча, с запятой', date: '2026-11-21', start: '18:05', end: '19:35', description: 'Первая строка\nВторая; строка', url: 'https://example.org/meeting', venue: 'Discord' } });
    assert.equal(created.status, 200);
    const payload = await created.json();
    const id = payload.event.id;
    const shareUrl = new URL(payload.calendarUrl);
    assert.equal(shareUrl.origin + shareUrl.pathname, 'https://calendar.google.com/calendar/render');
    assert.equal(shareUrl.searchParams.get('action'), 'TEMPLATE');
    assert.equal(shareUrl.searchParams.get('text'), 'Встреча, с запятой');
    assert.equal(shareUrl.searchParams.get('dates'), '20261121T180500/20261121T193500');
    assert.equal(shareUrl.searchParams.get('ctz'), 'Europe/Moscow');
    assert.equal(shareUrl.searchParams.get('details'), 'Первая строка\nВторая; строка\nСсылка на событие: https://example.org/meeting');
    assert.equal(shareUrl.searchParams.get('location'), 'Discord');
    const publicEvent = (await (await request('/api/calendar?from=2026-11-21&to=2026-11-21', { auth: false })).json()).events.find(event => event.id === id);
    assert.equal(publicEvent.calendarUrl, payload.calendarUrl);
  });
  await check('Weekly series expands into releases inside the requested window', async () => {
    const response = await request('/api/events', { method: 'POST', body: { title: 'Конгресс', date: '2026-11-09', start: '20:00', end: '21:30', repeatRule: { freq: 'weekly', interval: 1, byWeekday: [0, 3], until: '2026-12-20', count: null } } });
    assert.equal(response.status, 200);
    const createdSeries = await response.json();
    seriesId = createdSeries.event.id;
    assert.equal(new URL(createdSeries.calendarUrl).searchParams.get('dates'), '20261109T200000/20261109T213000');
    const window = await (await request('/api/events?from=2026-11-01&to=2026-12-31')).json();
    const releases = window.events.filter(event => event.eventId === seriesId).map(event => event.date);
    assert.deepEqual(releases, ['2026-11-09', '2026-11-12', '2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26', '2026-11-30', '2026-12-03', '2026-12-07', '2026-12-10', '2026-12-14', '2026-12-17']);
    const seriesEvents = window.events.filter(event => event.eventId === seriesId);
    assert.ok(seriesEvents.every(event => event.repeat.includes('понедельникам') && event.repeat.includes('четвергам')));
    assert.ok(seriesEvents.every(event => event.series));
  });
  await check('Monthly and counted series respect end rules', async () => {
    const monthlyResponse = await request('/api/events', { method: 'POST', body: { title: 'Ежемесячное', date: '2026-01-31', start: '12:00', end: '13:00', repeatRule: { freq: 'monthly', interval: 1, byWeekday: [], until: null, count: null } } });
    monthlyId = (await monthlyResponse.json()).event.id;
    const jan = await (await request('/api/events?from=2026-01-01&to=2026-05-31')).json();
    const monthly = jan.events.filter(event => event.title === 'Ежемесячное').map(event => event.date);
    assert.deepEqual(monthly, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    await request('/api/events', { method: 'POST', body: { title: 'Три раза', date: '2026-11-10', start: '10:00', end: '11:00', repeatRule: { freq: 'daily', interval: 1, byWeekday: [], until: null, count: 3 } } });
    const counted = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    assert.deepEqual(counted.events.filter(event => event.title === 'Три раза').map(event => event.date), ['2026-11-10', '2026-11-11', '2026-11-12']);
  });
  await check('Per-release settings override type values without touching the series', async () => {
    const id = encodeURIComponent(`${seriesId}@2026-11-12`);
    const response = await request(`/api/events/${id}`, { method: 'PUT', body: { accessLabel: 'Участники Арены', points: 5, coverPath: '/assets/panel/6713c.png' } });
    assert.equal(response.status, 200);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    const changed = window.events.find(event => event.id === `${seriesId}@2026-11-12`);
    const sibling = window.events.find(event => event.id === `${seriesId}@2026-11-09`);
    assert.equal(changed.access, 'Участники Арены');
    assert.equal(changed.points, 5);
    assert.equal(changed.cover, '/assets/panel/6713c.png');
    assert.equal(sibling.access, 'Все');
    assert.equal(sibling.points, 0);
  });
  await check('Non-repeating manual event accepts per-release settings', async () => {
    const created = await request('/api/events', { method: 'POST', body: { title: 'Разовое', date: '2026-11-25', start: '12:00', end: '13:00', repeatRule: null } });
    const id = (await created.json()).event.id;
    assert.equal((await request(`/api/events/${id}`, { method: 'PUT', body: { accessLabel: 'Участники', points: 3 } })).status, 200);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    const item = window.events.find(event => event.id === id);
    assert.equal(item.access, 'Участники');
    assert.equal(item.points, 3);
    assert.equal((await request(`/api/events/${id}`, { method: 'DELETE' })).status, 200);
  });
  await check('Moving and cancelling a single release keeps the rest of the series', async () => {
    const moved = encodeURIComponent(`${seriesId}@2026-11-16`);
    assert.equal((await request(`/api/events/${moved}`, { method: 'PUT', body: { date: '2026-11-17', start: '21:00', end: '22:00' } })).status, 200);
    const cancelled = encodeURIComponent(`${seriesId}@2026-11-19`);
    assert.equal((await request(`/api/events/${cancelled}`, { method: 'DELETE' })).status, 200);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    const byDate = Object.fromEntries(window.events.filter(event => event.eventId === seriesId).map(event => [event.date, event]));
    assert.equal(byDate['2026-11-17'].start, '21:00');
    assert.equal(byDate['2026-11-19'], undefined);
    assert.ok(byDate['2026-11-09']);
    const movedIcs = await request(`/api/calendar/events/${encodeURIComponent(`${seriesId}@2026-11-16`)}.ics`, { auth: false });
    assert.equal(movedIcs.status, 200);
    assert.ok((await movedIcs.text()).includes('DTSTART;TZID=Europe/Moscow:20261117T210000\r\n'));
    assert.equal((await request(`/api/calendar/events/${encodeURIComponent(`${seriesId}@2026-11-19`)}.ics`, { auth: false })).status, 404);
  });
  await check('Series edit validates and preserves the identifier', async () => {
    assert.equal((await request(`/api/events/${seriesId}`, { method: 'PUT', body: { title: 'Конгресс', date: '2026-11-09', start: '20:00', end: '19:00', repeatRule: null } })).status, 422);
    const response = await request(`/api/events/${seriesId}`, { method: 'PUT', body: { title: 'Конгресс (онлайн)', date: '2026-11-09', start: '20:00', end: '21:30', repeatRule: { freq: 'weekly', interval: 1, byWeekday: [0], until: null, count: null } } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).event.id, seriesId);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-12-31')).json();
    const titles = new Set(window.events.filter(event => event.eventId === seriesId).map(event => event.title));
    assert.deepEqual([...titles], ['Конгресс (онлайн)']);
  });
  await check('External events reject schedule edits and deletion but accept per-release settings', async () => {
    withDb(db => {
      db.prepare(`INSERT INTO events (id, title, start_date, start_time, end_time, source, external_id, status, created_at, updated_at)
        VALUES ('ext-1', 'Импорт', '2026-11-15', '18:00', '19:00', 'google', 'g-ext-1', 'confirmed', 1, 1)`).run();
    });
    assert.equal((await request('/api/events/ext-1', { method: 'PUT', body: { title: 'X', date: '2026-11-15', start: '18:00', end: '19:00' } })).status, 409);
    assert.equal((await request('/api/events/ext-1', { method: 'PUT', body: { date: '2026-11-16', start: '18:00', end: '19:00' } })).status, 409);
    const response = await request('/api/events/ext-1', { method: 'PUT', body: { accessLabel: 'Участники Арены', points: 7, coverPath: '/assets/panel/6713c.png' } });
    assert.equal(response.status, 200);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    const external = window.events.find(event => event.id === 'ext-1');
    assert.equal(external.source, 'google');
    assert.equal(external.access, 'Участники Арены');
    assert.equal(external.points, 7);
    assert.equal(external.cover, '/assets/panel/6713c.png');
    assert.equal((await request('/api/events/ext-1', { method: 'DELETE' })).status, 409);
  });
  await check('Sync without a connected source and unknown actions return controlled errors', async () => {
    assert.equal((await request('/api/integration', { method: 'POST', body: { action: 'sync' } })).status, 409);
    assert.equal((await request('/api/integration/google/callback', { auth: false })).status, 401);
    const callback = await request('/api/integration/google/callback?code=x&state=y', { redirect: 'manual' });
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get('location'), /connect-error/);
    assert.equal((await request('/api/integration/matches/unknown', { method: 'POST', body: { action: 'link' } })).status, 404);
  });

  // ---- Analytics: unique participants per release, filters, profile ----
  let analystId, viewerId;
  const releaseKey = () => `${monthlyId}@2026-05-31`;
  await check('Activity ingest creates participants; repeated actions never inflate metrics', async () => {
    for (const kind of ['view', 'view', 'view']) {
      const response = await request('/api/analytics/activity', { method: 'POST', body: { telegramId: '900001', nick: '@analyst', eventKey: releaseKey(), kind } });
      assert.equal(response.status, 200);
    }
    const opened = await request('/api/analytics/activity', { method: 'POST', body: { telegramId: '900001', eventKey: releaseKey(), kind: 'open' } });
    assert.equal(opened.status, 200);
    analystId = (await opened.json()).participant.id;
    assert.match(analystId, /^[0-9a-f-]{36}$/);
    const created = await request('/api/analytics/activity', { method: 'POST', body: { telegramId: '900002', nick: '@viewer', eventKey: releaseKey(), kind: 'view' } });
    viewerId = (await created.json()).participant.id;
    const releases = (await (await request('/api/analytics/releases?period=all')).json()).releases;
    const release = releases.find(item => item.id === releaseKey());
    assert.ok(release, 'release present in period=all');
    assert.equal(release.metrics.viewed, 2);
    assert.equal(release.metrics.opened, 1);
  });
  await check('Activity ingest validates kind, event and identity', async () => {
    for (const body of [{ kind: 'like' }, { kind: 'view' }, { kind: 'view', eventKey: releaseKey() }]) {
      assert.equal((await request('/api/analytics/activity', { method: 'POST', body })).status, 422, JSON.stringify(body));
    }
    assert.equal((await request('/api/analytics/activity', { method: 'POST', body: { kind: 'view', eventKey: releaseKey(), participantId: 'missing' } })).status, 404);
    assert.equal((await request('/api/analytics/participants/missing')).status, 404);
  });
  await check('Reminder toggle moves the current-state counter', async () => {
    await request('/api/analytics/activity', { method: 'POST', body: { participantId: analystId, eventKey: releaseKey(), kind: 'reminder_on' } });
    let list = await (await request('/api/analytics/participants?eventKey=' + encodeURIComponent(releaseKey()))).json();
    assert.equal(list.metrics.reminders, 1);
    assert.equal(list.participants.find(row => row.id === analystId).reminder, true);
    await request('/api/analytics/activity', { method: 'POST', body: { participantId: analystId, eventKey: releaseKey(), kind: 'reminder_off' } });
    list = await (await request('/api/analytics/participants?eventKey=' + encodeURIComponent(releaseKey()))).json();
    assert.equal(list.metrics.reminders, 0);
    assert.equal(list.participants.find(row => row.id === analystId).reminder, false);
  });
  await check('Table filters by action, reminder and nick search', async () => {
    const base = '/api/analytics/participants?eventKey=' + encodeURIComponent(releaseKey());
    assert.equal((await (await request(base + '&action=opened')).json()).total, 1);
    assert.equal((await (await request(base + '&action=viewed')).json()).total, 1);
    assert.equal((await (await request(base + '&search=viewer')).json()).total, 1);
    assert.equal((await (await request(base + '&search=nomatch')).json()).total, 0);
    assert.equal((await (await request(base + '&reminder=on')).json()).total, 0);
  });
  await check('Pagination counts distinct participants and pages the table', async () => {
    for (let index = 3; index <= 11; index++) {
      await request('/api/analytics/activity', { method: 'POST', body: { telegramId: String(900000 + index), nick: `@p${index}`, eventKey: releaseKey(), kind: 'view' } });
    }
    const base = '/api/analytics/participants?eventKey=' + encodeURIComponent(releaseKey());
    const page1 = await (await request(base + '&pageSize=8&page=1')).json();
    assert.equal(page1.total, 11);
    assert.equal(page1.participants.length, 8);
    const page2 = await (await request(base + '&pageSize=8&page=2')).json();
    assert.equal(page2.participants.length, 3);
    const nick = (await (await request(base + '&search=p11')).json()).participants[0].nick;
    assert.equal(nick, '@p11');
  });
  await check('Participant profile counts distinct events in the period and lists history', async () => {
    const profile = (await (await request(`/api/analytics/participants/${analystId}?period=all`)).json()).profile;
    assert.equal(profile.participant.nick, '@analyst');
    assert.equal(profile.metrics.viewed, 1);
    assert.equal(profile.metrics.opened, 1);
    assert.equal(profile.metrics.reminders, 0);
    assert.equal(profile.history.length, 1);
    assert.equal(profile.history[0].title, 'Ежемесячное');
    assert.equal(profile.history[0].eventDate, '2026-05-31');
    assert.equal(profile.history[0].opened, 1);
  });

  // ---- Public participant surface (user calendar) ----
  await check('Public calendar is readable without a session and exposes access fields', async () => {
    const response = await request('/api/calendar?from=2026-11-01&to=2026-11-30', { auth: false });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const events = payload.events;
    assert.equal('previewAllowed' in payload, false);
    assert.equal('demoLoginAllowed' in payload, false);
    assert.equal('cardReview' in payload, false);
    assert.equal('previewAllowed' in (await (await request('/api/calendar')).json()), false);
    assert.ok(events.length > 0);
    const congress = events.find(event => event.title === 'Конгресс (онлайн)');
    assert.equal(congress.canFollow, true);
    assert.ok(events.every(event => 'canFollow' in event && 'access' in event));
    assert.deepEqual(events.map(e => `${e.date} ${e.start}`), events.map(e => `${e.date} ${e.start}`).sort());
    assert.equal((await request('/api/types', { auth: false })).status, 401);
  });
  await check('Public activity ingest works without a session and feeds analytics', async () => {
    const response = await request('/api/calendar/activity', { auth: false, method: 'POST', body: { telegramId: 'guest-1', nick: '@guest', eventKey: releaseKey(), kind: 'view' } });
    assert.equal(response.status, 200);
    const list = await (await request('/api/analytics/participants?eventKey=' + encodeURIComponent(releaseKey()))).json();
    assert.equal(list.total, 12);
    assert.equal((await request('/api/calendar/activity', { auth: false, method: 'POST', body: { kind: 'hack' } })).status, 422);
  });

  // ---- Access rules (fixed 09.11): tier/degree compare + participant groups ----
  let vipTierTypeId, vipTierEventId;
  await check('Groups upload classifies participants by nick and reports misses', async () => {
    const created = await request('/api/groups', { method: 'POST', body: { name: 'Участники Сатурналий', nicks: ['@analyst', 'viewer', '@unknown_nick'] } });
    assert.equal(created.status, 200);
    const result = await created.json();
    assert.equal(result.matched, 2);
    assert.equal(result.unmatched.length, 1);
    assert.equal((await request('/api/groups', { method: 'POST', body: { name: 'Участники Сатурналий', nicks: ['x'] } })).status, 409);
    assert.equal((await request('/api/groups', { method: 'POST', body: { name: 'Все', nicks: ['x'] } })).status, 422);
    const groups = (await (await request('/api/groups')).json()).groups;
    assert.equal(groups[0].name, 'Участники Сатурналий');
    assert.equal(groups[0].members, 2);
  });
  await check('Tier/degree rules block the follow link but never visibility', async () => {
    const type = await request('/api/types', { method: 'POST', body: { name: 'Закрытый клуб', accessLabel: 'Все', tier: 'III', degree: 'II' } });
    vipTierTypeId = (await type.json()).type.id;
    const event = await request('/api/events', { method: 'POST', body: { title: 'Закрытая встреча', date: '2026-11-10', start: '20:00', end: '21:00', url: 'https://t.me/x', typeId: vipTierTypeId } });
    vipTierEventId = (await event.json()).event.id;
    withDb(db => db.prepare('UPDATE participants SET tier = ?, degree = ? WHERE id = ?').run('III', 'I', analystId));
    const guest = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30', { auth: false })).json();
    const asGuest = guest.events.find(item => item.id === vipTierEventId);
    assert.equal(asGuest.canFollow, false);
    const forgedPreview = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&demoMember=1&participant=' + analystId, { auth: false })).json();
    assert.equal(forgedPreview.account, null);
    assert.equal(forgedPreview.events.find(item => item.id === vipTierEventId).canFollow, false);
    assert.match(asGuest.reason, /Нужен тир III/);
    const member = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&participant=' + analystId, { auth: true })).json();
    const asMember = member.events.find(item => item.id === vipTierEventId);
    assert.equal(asMember.canFollow, false);
    assert.ok(asMember.requirements.some(item=>item.kind==='degree'&&item.text.includes('II')));
    withDb(db => db.prepare('UPDATE participants SET degree = ? WHERE id = ?').run('II', analystId));
    const upgraded = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&participant=' + analystId, { auth: true })).json();
    assert.equal(upgraded.events.find(item => item.id === vipTierEventId).canFollow, true);
  });
  await check('Admin degree preview is protected, keeps visibility and does not grant public access', async () => {
    const route = '/api/calendar-preview?from=2026-11-01&to=2026-11-30';
    assert.equal((await request(route, { auth: false })).status, 401);
    assert.equal((await request(route + '&degree=IV')).status, 422);
    for (const [degree, allowed] of [['I', false], ['II', true], ['III', true], ['', true]]) {
      const data = await (await request(route + '&degree=' + degree)).json();
      assert.equal(data.events.find(item => item.id === vipTierEventId).canFollow, allowed);
      assert.equal(data.account, null);
    }
    const guest = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&degree=III', { auth: false })).json();
    assert.equal(guest.events.find(item => item.id === vipTierEventId).canFollow, false);
  });
  await check('Group access: members follow, outsiders and guests only see', async () => {
    const type = await request('/api/types', { method: 'POST', body: { name: 'Сатурналии (группа)', accessLabel: 'Участники Сатурналий' } });
    const groupTypeId = (await type.json()).type.id;
    const event = await request('/api/events', { method: 'POST', body: { title: 'Сатурналия закрытая', date: '2026-11-12', start: '20:00', end: '21:00', url: 'https://t.me/s', typeId: groupTypeId } });
    const groupEventId = (await event.json()).event.id;
    const member = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&participant=' + analystId, { auth: true })).json();
    assert.equal(member.events.find(item => item.id === groupEventId).canFollow, true);
    const outsiderJoin = await request('/api/calendar/activity', { auth: false, method: 'POST', body: { telegramId: 'outsider-1', nick: '@outsider', eventKey: releaseKey(), kind: 'view' } });
    const outsiderId = (await outsiderJoin.json()).participant.id;
    const outsider = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&participant=' + outsiderId, { auth: true })).json();
    const asOutsider = outsider.events.find(item => item.id === groupEventId);
    assert.equal(asOutsider.canFollow, false);
    assert.match(asOutsider.reason, /групп/);
    const guest = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30', { auth: false })).json();
    assert.equal(guest.events.find(item => item.id === groupEventId).canFollow, false);
    const forged = await (await request('/api/calendar?from=2026-11-01&to=2026-11-30&participant=' + analystId, { auth: false })).json();
    assert.equal(forged.account, null);
    assert.equal(forged.events.find(item => item.id === groupEventId).canFollow, false, 'A query parameter must not authenticate a guest');
    assert.equal((await request('/api/groups/missing', { method: 'DELETE' })).status, 404);
  });

  // ---- Type recognition: suggestions by word root, admin confirms ----
  await check('Recognition suggests types by word root; plain titles stay silent', async () => {
    await request('/api/types', { method: 'POST', body: { name: 'Квиз', recognitionWords: 'квиз, викторина' } });
    withDb(db => {
      const insert = db.prepare(`INSERT INTO events (id, title, start_date, start_time, end_time, source, external_id, status, created_at, updated_at)
        VALUES (?, ?, '2026-11-20', '19:00', '21:00', 'google', ?, 'confirmed', 1, 1)`);
      insert.run('ext-quiz', 'Большая викторина сообщества', 'gq-1');
      insert.run('ext-quiz2', 'Квиз-вечер осени', 'gq-2');
      insert.run('ext-plain', 'Совещание кураторов', 'gq-3');
    });
    const { suggestions } = await (await request('/api/type-suggestions')).json();
    const quiz = suggestions.find(item => item.eventId === 'ext-quiz');
    assert.ok(quiz, 'викторина → Квиз');
    assert.equal(quiz.suggestions[0].name, 'Квиз');
    assert.ok(suggestions.some(item => item.eventId === 'ext-quiz2'), 'квиз по корню слова');
    assert.ok(!suggestions.some(item => item.eventId === 'ext-plain'), 'совещание без совпадений');
  });
  await check('Accept assigns the type permanently; skip survives until next sync', async () => {
    const quizType = (await list()).find(type => type.name === 'Квиз');
    const accepted = await request('/api/type-suggestions/resolve', { method: 'POST', body: { eventId: 'ext-quiz', typeId: quizType.id, action: 'accept' } });
    assert.equal(accepted.status, 200);
    const window = await (await request('/api/events?from=2026-11-01&to=2026-11-30')).json();
    assert.equal(window.events.find(item => item.id === 'ext-quiz').typeName, 'Квиз');
    const skipped = await request('/api/type-suggestions/resolve', { method: 'POST', body: { eventId: 'ext-quiz2', action: 'skip' } });
    assert.equal(skipped.status, 200);
    const after = await (await request('/api/type-suggestions')).json();
    assert.ok(!after.suggestions.some(item => item.eventId === 'ext-quiz'), 'подтверждённое ушло из очереди');
    assert.ok(!after.suggestions.some(item => item.eventId === 'ext-quiz2'), 'пропуск держится между просмотрами');
    assert.equal((await request('/api/type-suggestions/resolve', { method: 'POST', body: { eventId: 'ext-quiz', action: 'accept' } })).status, 422);
  });
  // ---- Admin settings -> persisted public calendar ----
  let appearanceType, appearanceEvent, appearanceCover;
  const palette = { theme: 'saturnalia', start: '#411110', end: '#2A0B0B', accent: '#C9372C', text: '#FAF2ED', bordered: true, buttonBackground: '#5C1714', buttonText: '#FAF2ED', buttonAccent: '#E5483B' };
  const publicItems = async () => (await (await request('/api/calendar?from=2026-11-01&to=2026-11-30', { auth: false })).json()).events;
  await check('Uploaded covers require admin access, reject unsafe content, and are public images', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    assert.equal((await request('/api/covers', { auth: false, method: 'POST', rawBody: png })).status, 401);
    assert.equal((await request('/api/covers', { method: 'POST', rawBody: '<svg onload="alert(1)"/>' })).status, 422);
    assert.equal((await request('/api/covers', { method: 'POST', rawBody: Buffer.alloc(2_000_001) })).status, 413);
    const uploaded = await request('/api/covers', { method: 'POST', rawBody: png });
    assert.equal(uploaded.status, 200); appearanceCover = (await uploaded.json()).coverPath;
    const image = await request(appearanceCover, { auth: false });
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  });
  await check('Type appearance, cover and venue link reach every public release', async () => {
    const createdType = await request('/api/types', { method: 'POST', body: { name: 'Оформление', theme: palette.theme, appearance: palette, coverPath: appearanceCover, accessLabel: 'Все', venueUrl: 'https://example.org/type' } });
    assert.equal(createdType.status, 200); appearanceType = (await createdType.json()).type;
    const created = await request('/api/events', { method: 'POST', body: { title: 'Оформление серии', date: '2026-11-22', start: '12:00', end: '13:00', typeId: appearanceType.id, repeatRule: { freq: 'daily', interval: 1, count: 2 } } });
    assert.equal(created.status, 200); appearanceEvent = (await created.json()).event.id;
    const releases = (await publicItems()).filter(e => e.id.startsWith(appearanceEvent));
    assert.equal(releases.length, 2);
    for (const item of releases) { assert.deepEqual(item.appearance, palette); assert.equal(item.cover, appearanceCover); assert.equal(item.url, 'https://example.org/type'); }
  });
  await check('Invalid colors, border values and missing uploaded covers cannot be saved', async () => {
    for (const value of [{ ...palette, accent: 'url(https://evil)' }, { ...palette, bordered: 'false' }, { ...palette, theme: 'unknown' }, { ...palette, buttonBackground: 'red' }, { ...palette, buttonText: 'url(https://evil)' }, { ...palette, buttonAccent: '#XYZXYZ' }]) {
      assert.equal((await request(`/api/types/${appearanceType.id}`, { method: 'PUT', body: { ...appearanceType, appearance: value } })).status, 422);
      assert.equal((await request(`/api/events/${appearanceEvent}%402026-11-22`, { method: 'PUT', body: { appearance: value } })).status, 422);
    }
    assert.equal((await request(`/api/types/${appearanceType.id}`, { method: 'PUT', body: { ...appearanceType, coverPath: '/api/calendar/covers/00000000-0000-0000-0000-000000000000' } })).status, 422);
  });
  await check('Release appearance is isolated and survives later type edits', async () => {
    const release = encodeURIComponent(`${appearanceEvent}@2026-11-22`);
    const custom = { ...palette, theme: 'ordinary', start: '#FFFFFF', end: '#F9F8F6', text: '#2B2121', bordered: false };
    assert.equal((await request(`/api/events/${release}`, { method: 'PUT', body: { appearance: custom, coverPath: null } })).status, 200);
    const changedPalette = { ...palette, accent: '#AF5120' };
    assert.equal((await request(`/api/types/${appearanceType.id}`, { method: 'PUT', body: { ...appearanceType, appearance: changedPalette } })).status, 200);
    const releases = (await publicItems()).filter(e => e.id.startsWith(appearanceEvent));
    assert.deepEqual(releases[0].appearance, custom); assert.equal(releases[0].cover, null); assert.equal(releases[0].theme, 'ordinary');
    assert.deepEqual(releases[1].appearance, changedPalette); assert.equal(releases[1].cover, appearanceCover);
  });
  await check('Appearance and uploaded image survive a real server restart; restore inherits current type', async () => {
    await stop(); await start(true);
    const before = (await publicItems()).filter(e => e.id.startsWith(appearanceEvent));
    assert.equal(before[0].appearance.bordered, false);
    assert.equal((await request(appearanceCover, { auth: false })).status, 200);
    const release = encodeURIComponent(`${appearanceEvent}@2026-11-22`);
    assert.equal((await request(`/api/events/${release}`, { method: 'PUT', body: { appearance: null, coverPath: '' } })).status, 200);
    const after = (await publicItems()).filter(e => e.id.startsWith(appearanceEvent));
    assert.deepEqual(after[0].appearance, after[1].appearance); assert.equal(after[0].cover, appearanceCover);
  });
  await check('One-off manual event edits persist title, text, link, time and type to the public calendar', async () => {
    const input = { title: 'До изменения', date: '2026-11-24', start: '10:00', end: '11:00', repeatRule: null };
    const created = await request('/api/events', { method: 'POST', body: input });
    const id = (await created.json()).event.id;
    assert.equal((await request(`/api/events/${id}`, { method: 'PUT', body: { accessLabel: 'Индивидуальная группа', coverPath: null, date: input.date, start: '10:30', end: '11:30' } })).status, 200);
    const changed = { ...input, title: 'После изменения', description: 'Новое описание', date: '2026-11-25', start: '15:00', end: '16:00', url: 'https://example.org/event', venue: 'YouTube', typeId: appearanceType.id };
    assert.equal((await request(`/api/events/${id}`, { method: 'PUT', body: changed })).status, 200);
    const item = (await publicItems()).find(e => e.id === id);
    for (const key of ['title', 'description', 'date', 'start', 'end', 'venue']) assert.equal(item[key], changed[key]);
    assert.equal(item.url,''); assert.equal(item.canFollow,false);
    const internal=(await (await request('/api/events?from=2026-11-25&to=2026-11-25')).json()).events.find(e=>e.id===id);
    assert.equal(internal.url,changed.url);
    assert.equal(item.typeName, appearanceType.name);
    assert.equal(item.access, 'Индивидуальная группа'); assert.equal(item.cover, null);
    assert.deepEqual(item.appearance, (await publicItems()).find(e => e.id.startsWith(appearanceEvent)).appearance);
  });
  await check('CALENDAR_ALLOW_REMOTE=1 accepts a public host behind a proxy', async () => {
    await stop(); await start(true, { CALENDAR_ALLOW_REMOTE: '1' });
    assert.equal(await rawStatus('/api/types', { Host: 'calendar.example', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.7' }), 200);
    const response = await request('/api/types', { method: 'POST', body: { name: 'Через прокси' }, origin: 'https://calendar.example', headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'calendar.example' } });
    assert.equal(response.status, 200, await response.text());
    const login = await request('/api/local-session', { auth: false, method: 'POST', body: { token }, origin: 'https://calendar.example', headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'calendar.example' } });
    assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /Secure/i, 'HTTPS login sets a Secure cookie.');
  });
  await check('Calendar account shows recognized degree data; anonymous activity does not sign a guest in', async () => {
    const guest = await (await request('/api/calendar?participant=guest-1', { auth: false })).json();
    assert.equal(guest.account, null);
    const member = await (await request('/api/calendar?participant=' + analystId, { auth: true })).json();
    assert.equal(member.account.nick, '@analyst'); assert.equal(member.account.degree, 'II');
    assert.equal((await (await request('/api/calendar?participant=unknown', { auth: false })).json()).account, null);
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stop();
  const report = { recordedAt: new Date().toISOString(), scope: 'Built Node server, HTTP API, SSR and SQLite; no browser interaction', passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, results };
  writeFileSync(path.join(artifacts, 'api-check.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed. Report: artifacts/api-check.json`);
}
