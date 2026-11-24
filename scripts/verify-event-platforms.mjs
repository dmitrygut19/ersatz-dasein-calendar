import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { eventPlatform } from '../src/lib/event-platform.ts';

assert.equal(eventPlatform({ url: 'https://youtube.com.evil.test/watch', venue: '' }).image, '');
assert.equal(eventPlatform({ url: 'javascript:alert(1)', venue: 'Discord' }).href, '');
assert.equal(eventPlatform({ url: 'https://youtu.be/test', venue: 'Discord' }).label, 'YouTube');
assert.equal(eventPlatform({ url: 'https://meet.private.test/room', venue: 'Jitsi' }).label, 'Jitsi');
mkdirSync('artifacts', { recursive: true });
const directory = mkdtempSync(path.resolve('artifacts/event-platforms-'));
const token = randomBytes(32).toString('hex');
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: path.join(directory, 'test.sqlite') }, stdio: 'ignore' });
let browser;
const errors = [], checks = [];
async function api(route, data, method = 'POST') {
  const r = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, Origin: base, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result;
}
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  const now = new Date(), prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fixtures = [
    { name: 'YouTube', url: 'https://www.youtube.com/watch?v=calendar-test', venue: 'YouTube' },
    { name: 'Discord', url: 'https://discord.com/channels/calendar/test', venue: 'Discord' },
    { name: 'Jitsi', url: 'https://meet.jit.si/calendar-test', venue: 'Jitsi' },
    { name: 'Закрытое', url: 'https://discord.gg/calendar-test', venue: 'Discord', accessLabel: 'Закрытая группа' },
    { name: 'Без ссылки', url: '', venue: 'Jitsi' },
  ];
  const types = [];
  for (const [i, f] of fixtures.entries()) {
    const type = (await api('/api/types', { name: f.name, venue: f.venue, venueUrl: f.url, accessLabel: f.accessLabel ?? 'Все', theme: i === 2 ? 'saturnalia' : 'ordinary', coverPath: i === 2 ? '/assets/panel/2a38c.png' : '/assets/panel/a5ff5.png' })).type;
    types.push(type);
    await api('/api/events', { title: f.name, date: `${prefix}-${10 + i}`, start: '12:00', end: '13:00', typeId: type.id });
  }
  await api('/api/events', { title: 'Переопределённая ссылка', date: `${prefix}-15`, start: '12:00', end: '13:00', typeId: types[1].id, url: 'https://youtu.be/override' });
  await api('/api/events', { title: 'Второе событие дня', date: `${prefix}-10`, start: '14:00', end: '15:00', typeId: types[2].id });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  // Verify the outgoing destination without contacting any real event service.
  await context.route(/https:\/\/(www\.youtube\.com|youtu\.be|discord\.com|discord\.gg|meet\.jit\.si)\//, route => route.fulfill({ contentType: 'text/html', body: '<title>Test destination</title>' }));
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/calendar');
  const day = number => page.locator('.uc-day').filter({ has: page.locator('.uc-day-number', { hasText: new RegExp(`^${number}(?: ·|$)`) }) });
  await expect(day(10).locator('.uc-venue-link')).toContainText('YouTube');
  await expect(page.locator('.uc-venue img')).toHaveCount(0);
  await expect(page.locator('.uc-venue-link .lino-glyph')).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    const link = day(10 + i).locator('.uc-venue-link');
    await expect(link).toContainText(fixtures[i].name);
    const popupReady = context.waitForEvent('page'); await link.click(); const popup = await popupReady;
    await popup.waitForURL(fixtures[i].url); await popup.close();
    await expect(page.locator('.uc-card')).toHaveCount(0);
  }
  checks.push('Three plain text links without logos open exact event URLs in a new tab without opening the card');
  await expect(day(13).locator('.uc-venue-link')).toHaveCount(0);
  await expect(day(13).locator('.uc-venue-label')).toContainText('Discord');
  await expect(day(14).locator('.uc-venue-link')).toHaveCount(0);
  await expect(day(14).locator('.uc-venue-label')).toContainText('Jitsi');
  await expect(day(15).locator('.uc-venue-link')).toContainText('YouTube');
  checks.push('Closed and missing-URL events have labels only; occurrence URL overrides type platform');
  await day(10).getByRole('button', { name: 'Следующее событие', exact: true }).click();
  await expect(day(10).locator('.uc-venue-link')).toContainText('Jitsi');
  await expect(day(10).locator('.uc-venue-link')).toHaveAttribute('href', fixtures[2].url);
  await day(10).getByRole('button', { name: 'Предыдущее событие', exact: true }).click();
  await day(10).locator('.uc-caption').click(); await expect(page.locator('.uc-card-name')).toHaveText('YouTube');
  await expect(page.locator('.uc-venue-link img')).toHaveCount(0);
  for (const width of [1920, 1440, 1280, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width > 700) {
      await expect(day(10).locator('.uc-venue-link')).toBeVisible();
      assert.equal(await day(10).evaluate(el => el.querySelector('.uc-venue').getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom), true);
    } else await expect(day(10).locator('.uc-venue')).toBeHidden();
    await page.screenshot({ path: path.join(directory, `calendar-${width}.png`), fullPage: true });
  }
  checks.push('Day pager updates platform; event card still opens; seven widths without overflow; mobile unchanged');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await context.request.post(base + '/api/local-session', { data: { token }, headers: { Origin: base } });
  await page.goto(base + '/admin');
  await page.getByRole('button', { name: 'Редактировать Discord', exact: true }).last().click();
  await page.locator('#type-venue').click();
  await page.getByRole('option', { name: 'Jitsi', exact: true }).click();
  await page.locator('.type-editor').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.type-editor')).toHaveCount(0);
  assert.equal((await api('/api/types', undefined, 'GET')).types.find(t => t.id === types[1].id).venue, 'Jitsi');
  checks.push('Custom admin select saves Jitsi through real API');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} groups passed. Evidence: ${directory}`);
} finally { await browser?.close(); server.kill(); }
