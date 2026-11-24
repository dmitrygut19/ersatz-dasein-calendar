import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.REVIEW_BASE ?? 'http://127.0.0.1:4330';
const directory = 'artifacts/admin-refinement';
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(() => {
  window.__soundPlays = [];
  HTMLMediaElement.prototype.play = function () { window.__soundPlays.push(this.src.split('/').pop()); return Promise.resolve(); };
});
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
let type, event, unused;
async function api(route, body, method = 'POST') {
  const response = await context.request.fetch(base + route, { method, headers: { Origin: base }, data: body });
  const data = await response.json(); assert.equal(response.status(), 200, JSON.stringify(data)); return data;
}
try {
  const suffix = Date.now();
  type = (await api('/api/types', { name: 'Проверка правок ' + suffix, accessLabel: 'Все', degree: 'II', theme: 'ordinary', coverPath: '/assets/panel/a5ff5.png' })).type;
  unused = (await api('/api/types', { name: 'Удаление проверка ' + suffix, accessLabel: 'Все', coverPath: '/assets/panel/a5ff5.png' })).type;
  event = (await api('/api/events', { title: 'Проверка градуса ' + suffix, date: '2026-11-19', start: '18:00', end: '19:00', typeId: type.id, url: 'https://example.org/', repeatRule: { freq: 'weekly', interval: 1, byWeekday: [3], until: null, count: null } })).event;
  await page.goto(base + '/admin');
  const preview = page.locator('.admin-preview');
  await expect(preview.locator('.uc-tg,.uc-account')).toHaveCount(0);
  const degree = preview.getByRole('group', { name: 'Градус', exact: true });
  await expect(degree).toBeVisible();
  const cell = preview.locator('.uc-day').filter({ has: page.locator('.uc-day-number').getByText('19', { exact: true }) });
  await expect(cell.locator('.uc-cover')).toBeVisible();
  await cell.locator('.uc-cover').click();
  await degree.getByRole('button', { name: 'I', exact: true }).click();
  await expect(preview.locator('.uc-access-title')).toHaveText('Нужен градус II');
  await expect(cell.locator('.uc-cover')).toBeVisible();
  await degree.getByRole('button', { name: 'II', exact: true }).click();
  await expect(preview.locator('.uc-access-title')).toHaveCount(0);
  const geometry = await preview.evaluate(root => ({ card: root.querySelector('.uc-card').getBoundingClientRect().top, day: root.querySelector('.uc-day').getBoundingClientRect().top }));
  assert.ok(Math.abs(geometry.card - geometry.day) <= 1, JSON.stringify(geometry));
  await preview.screenshot({ path: directory + '/preview-1440.png' });
  checks.push('Degree changes availability, retains all events and never renders a Telegram login; card aligns with day grid');
  await page.evaluate(() => { window.__soundPlays = []; });
  await page.mouse.move(0, 0);
  await preview.locator('.uc-card-btn').hover();
  await expect.poll(() => page.evaluate(() => window.__soundPlays.length)).toBeGreaterThan(0);
  assert.ok((await page.evaluate(() => window.__soundPlays)).every(file => file === 'accent-hover-1.mp3'));
  await page.evaluate(() => { window.__soundPlays = []; });
  await cell.locator('.uc-cover').hover();
  assert.deepEqual(await page.evaluate(() => window.__soundPlays), []);
  await degree.getByRole('button', { name: 'I', exact: true }).hover();
  assert.deepEqual(await page.evaluate(() => window.__soundPlays), []);
  checks.push('Only styled action buttons play the hover sound; calendar days, segmented controls and other controls stay silent');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const geometry = await preview.evaluate(root => ({ card: root.querySelector('.uc-card').getBoundingClientRect().top, grid: root.querySelector('.uc-grid').getBoundingClientRect().bottom }));
    assert.equal(Math.round(geometry.card - geometry.grid), 16);
    await preview.screenshot({ path: `${directory}/preview-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await preview.locator('.uc-card-btn').click();
  await page.getByRole('button', { name: 'Удалить событие', exact: true }).click();
  const confirm = page.locator('.confirm-delete');
  await expect(confirm.locator('.app-button')).toHaveCount(2);
  await expect(confirm.getByRole('button', { name: 'Отмена', exact: true })).toHaveCount(0);
  assert.equal(await confirm.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await confirm.screenshot({ path: `${directory}/event-delete-${width}.png` });
    const gap = await confirm.evaluate(el => el.querySelector('.button-row').getBoundingClientRect().top - el.querySelector('p').getBoundingClientRect().bottom);
    assert.ok(gap >= 24);
  }
  await confirm.getByRole('button', { name: 'Отменить удаление события', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await page.goto(base + '/admin');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Редактировать ' + unused.name, exact: true }).last().click();
    await page.getByRole('button', { name: 'Удалить ' + unused.name, exact: true }).click();
    const confirmation = page.getByRole('group', { name: 'Удаление типа ' + unused.name });
    const gap = await confirmation.locator('.deleting-main').evaluate(el => el.querySelector('.type-summary').getBoundingClientRect().left - el.querySelector('.cover').getBoundingClientRect().right);
    assert.equal(gap, 16);
    for (const button of await confirmation.locator('.app-button').all()) assert.equal(await button.evaluate(el => el.getBoundingClientRect().height), 50);
    await confirmation.screenshot({ path: `${directory}/type-delete-${width}.png` });
    await confirmation.getByRole('button', { name: 'Отмена', exact: true }).click();
  }
  checks.push('Event deletion has two standard buttons and a close control; type deletion has the normal image/text gap and 50 px buttons');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Редактировать ' + type.name, exact: true }).last().click();
  await page.getByRole('button', { name: 'Настроить оформление', exact: true }).click();
  const editor = page.locator('.appearance-editor');
  await editor.getByLabel('Фон: начало', { exact: true }).fill('#993838');
  await editor.getByLabel('Акцентный цвет', { exact: true }).fill('#AF5120');
  await expect(editor.locator('.theme-option.ordinary > span')).toHaveCSS('background-image', /153, 56, 56/);
  await editor.locator('.theme-option.arena').click();
  await editor.locator('.theme-option.ordinary').click();
  await expect(editor.getByLabel('Фон: начало', { exact: true })).toHaveValue('#993838');
  await expect(editor.locator('.theme-option.ordinary > span')).toHaveCSS('background-image', /153, 56, 56/);
  await expect(editor.locator('.selected-mark')).toBeVisible();
  assert.equal(await editor.locator('.selected-mark').evaluate(el => getComputedStyle(el).borderRadius), '999px');
  assert.equal(await editor.locator('.upload-cover').evaluate(el => getComputedStyle(el).borderTopStyle), 'dashed');
  const radioGroup = editor.getByRole('group', { name: 'Обводка', exact: true });
  await radioGroup.getByText('Без обводки', { exact: true }).click();
  await expect(radioGroup.getByLabel('Без обводки', { exact: true })).toBeChecked();
  await expect(editor.locator('.theme-option.ordinary > span')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await radioGroup.getByText('С обводкой', { exact: true }).click();
  await expect(radioGroup.getByLabel('С обводкой', { exact: true })).toBeChecked();
  await page.evaluate(() => { window.__soundPlays = []; });
  await radioGroup.getByText('Без обводки', { exact: true }).hover();
  assert.deepEqual(await page.evaluate(() => window.__soundPlays), []);
  const radioCenters = await radioGroup.locator('.radio-control').evaluateAll(labels => labels.map(label => {
    const mark = label.querySelector('.radio-mark').getBoundingClientRect(), text = label.querySelector('.radio-label').getBoundingClientRect();
    return Math.abs(mark.top + mark.height / 2 - text.top - text.height / 2);
  }));
  assert.ok(radioCenters.every(delta => delta < 1));
  await radioGroup.screenshot({ path: directory + '/appearance-radios.png' });
  await page.locator('.admin-overlay').evaluate(el => el.scrollTop = 0);
  await page.locator('.admin-overlay').screenshot({ path: directory + '/appearance-1440.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.admin-overlay').evaluate(el => el.scrollTop = 0);
    await page.locator('.admin-overlay').screenshot({ path: `${directory}/appearance-${width}.png` });
  }
  checks.push('Figma cover picker has dashed upload, circular top-left selection and live preset colors retained while switching themes; 320/390 layouts fit');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(base + '/admin?screen=access');
  await expect(page.locator('.assembly-toolbar')).toHaveCount(0);
  await expect(page.locator('.event-list-card').first()).toBeVisible();
  await page.locator('.event-list-card').filter({ hasText: 'Сатурналии' }).first().screenshot({ path: directory + '/access-frame-1440.png' });
  await page.evaluate(() => { window.__soundPlays = []; });
  await page.locator('.access-create').first().hover();
  assert.deepEqual(await page.evaluate(() => window.__soundPlays), []);
  const action = page.locator('.action-icon-button:not(.is-active)').first();
  await page.mouse.move(0, 0);
  await action.hover();
  await expect(action.locator('.action-icon-hover')).toHaveCSS('opacity', '1');
  await action.screenshot({ path: directory + '/action-hover.png' });
  assert.deepEqual(await page.evaluate(() => window.__soundPlays), []);
  checks.push('Flat Create type buttons and action icons are silent; the assembly footer is removed');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors, directory }, null, 2));
  writeFileSync(directory + '/report.json', JSON.stringify({ checks, errors }, null, 2));
} finally {
  if (event) await api('/api/events/' + event.id, undefined, 'DELETE');
  if (type) await api('/api/types/' + type.id, undefined, 'DELETE');
  if (unused) await api('/api/types/' + unused.id, undefined, 'DELETE');
  await browser.close();
}
