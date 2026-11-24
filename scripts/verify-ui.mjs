import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDemo } from './seed.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const run = mkdtempSync(path.join(artifacts, 'ui-run-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`, token = randomBytes(32).toString('hex');
const database = path.join(run, 'ui.sqlite'); seedDemo(database);
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', browser;
server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
const results = [], errors = [];
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base)).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Built server did not start.');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await check('Browser login and actual Vue hydration', async () => {
    await page.goto(`${base}/#${token}`);
    await page.waitForURL('**/admin');
    await page.goto(base + '/admin/types');
    await expect(page.getByRole('heading', { name: 'Типы событий' })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
    assert.ok(!page.url().includes(token));
  });
  await check('Edit opens in place and focuses the name field', async () => {
    await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
    await expect(page.getByLabel('Название типа', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Название типа', { exact: true })).toHaveValue('Сатурналии');
    await page.getByRole('heading', { name: 'Типы событий', exact: true }).click();
    await page.locator('.types-panel').screenshot({ path: path.join(run, 'desktop-editor.png') });
    await page.getByRole('button', { name: 'Закрыть редактирование' }).click();
    await expect(page.locator('.type-editor')).toHaveCount(0);
  });
  await check('Required-field error is inline and preserves the draft', async () => {
    await page.getByRole('button', { name: 'Добавить тип' }).click();
    await page.getByLabel('Слова для распознавания').fill('сохранённый ввод');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Введите название типа.');
    await expect(page.getByLabel('Слова для распознавания')).toHaveValue('сохранённый ввод');
    await expect(page.getByLabel('Название типа', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await page.locator('.types-panel').screenshot({ path: path.join(run, 'desktop-error.png') });
  });
  await check('Create persists all chosen fields through a browser reload', async () => {
    await page.getByLabel('Название типа', { exact: true }).fill('Проверка интерфейса');
    await page.getByLabel('Доступ', { exact: true }).fill('Все');
    await page.getByLabel('Тир', { exact: true }).click();
    await page.getByRole('option', { name: 'Тир II', exact: true }).click();
    await page.getByLabel('Градус', { exact: true }).click();
    await page.getByRole('option', { name: 'Градус I', exact: true }).click();
    await page.getByLabel('Е-баллы').fill('12');
    await page.getByLabel('Площадка').fill('Discord');
    await page.getByRole('button', { name: 'Настроить оформление' }).click();
    await page.getByRole('radio', { name: 'Конгресс', exact: true }).check();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Тип сохранён.');
    await page.reload();
    await page.getByRole('button', { name: 'Редактировать Проверка интерфейса', exact: true }).click();
    await expect(page.getByLabel('Е-баллы')).toHaveValue('12');
    await expect(page.getByLabel('Тир', { exact: true })).toHaveText('Тир II');
    await expect(page.getByLabel('Градус', { exact: true })).toHaveText('Градус I');
    await expect(page.getByLabel('Слова для распознавания')).toHaveValue('сохранённый ввод');
  });
  await check('Cancel discards unsaved edits; successful edit updates the row', async () => {
    await page.getByLabel('Название типа', { exact: true }).fill('Не сохранять');
    await page.getByRole('button', { name: 'Закрыть редактирование' }).click();
    await expect(page.getByRole('heading', { name: 'Проверка интерфейса', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Редактировать Проверка интерфейса', exact: true }).click();
    await page.getByLabel('Название типа', { exact: true }).fill('Обновлённый тип');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Обновлённый тип', exact: true })).toBeVisible();
  });
  await check('Network failure keeps input and retry can save it', async () => {
    await page.getByRole('button', { name: 'Редактировать Обновлённый тип', exact: true }).click();
    await page.getByLabel('Е-баллы').fill('13');
    await page.route('**/api/types/**', route => route.abort());
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Нет связи с сервером');
    await expect(page.getByLabel('Е-баллы')).toHaveValue('13');
    await page.unroute('**/api/types/**');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Тип сохранён.');
  });
  await check('Used type deletion is rejected visibly in the browser', async () => {
    await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
    await page.getByLabel('Название типа', { exact: true }).fill('Несохранённое название');
    await page.getByRole('button', { name: 'Удалить Сатурналии', exact: true }).click();
    await expect(page.locator('.type-editor')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Удаление типа Сатурналии' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('На этот тип ссылается событие');
    await expect(page.getByRole('group', { name: 'Удаление типа Сатурналии' })).toBeVisible();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Сатурналии', exact: true })).toBeVisible();
  });
  await check('Delete confirmation can be cancelled and confirmed', async () => {
    await page.getByRole('button', { name: 'Удалить Обновлённый тип', exact: true }).click();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Обновлённый тип', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить Обновлённый тип', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Тип удалён.');
    await expect(page.getByRole('heading', { name: 'Обновлённый тип', exact: true })).toHaveCount(0);
  });
  await check('Desktop and mobile fields have no overflow, missing assets or inaccessible save button', async () => {
    for (const width of [1440, 768, 390, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
      const measurements = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        fields: [...document.querySelectorAll('.field-control')].map(el => el.getBoundingClientRect().height),
        broken: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
      }));
      assert.equal(measurements.overflow, false, `Overflow at ${width}`);
      assert.equal(measurements.broken, 0, `Missing asset at ${width}`);
      assert.ok(measurements.fields.every(height => height === 48));
      const assets = await page.locator('.type-editor').evaluate(form => ({
        ornaments: [...form.querySelectorAll('.app-button__decor')].filter(image => image.getClientRects().length).map(image => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })),
        fontLoaded: document.fonts.check('700 20px "Alegreya Sans SC"') && document.fonts.check('400 16px "Alegreya Sans"'),
      }));
      assert.ok(assets.fontLoaded, `Local fonts unavailable at ${width}`);
      assert.equal(assets.ornaments.length, width <= 600 ? 4 : 2);
      assert.ok(assets.ornaments.every(image => image.width === 60 && image.height === 60), `Ornament distortion at ${width}`);
      await page.getByRole('button', { name: 'Сохранить', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeInViewport();
      await page.locator('.types-panel').screenshot({ path: path.join(run, `editor-${width}.png`) });
      await page.getByRole('button', { name: width <= 600 ? 'Отмена' : 'Закрыть редактирование', exact: true }).click();
    }
  });
  await check('Mobile editor saves, validates points and supports keyboard cancellation', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
    await page.getByLabel('Е-баллы').fill('-1');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Введите целое неотрицательное число.');
    await page.getByLabel('Е-баллы').fill('11');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Тип сохранён.');
    await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
    await expect(page.getByLabel('Е-баллы')).toHaveValue('11');
    await page.getByLabel('Название типа', { exact: true }).press('Escape');
    await expect(page.locator('.type-editor')).toHaveCount(0);
    await page.locator('.types-panel').screenshot({ path: path.join(run, 'mobile-list.png') });
  });
  await check('No browser JavaScript exceptions', async () => { assert.deepEqual(errors, []); });
  if (process.env.COMPARE_MENTOR_SITE === '1') {
    await check('Copied buttons match the live mentor site CSS, assets and hover transforms', async () => {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
      const source = await context.newPage();
      await source.goto('https://mentors.ersatz-dasein.ru/', { waitUntil: 'networkidle', timeout: 30000 });
      const sourceButton = source.locator('.app-button--v2').filter({ visible: true }).first();
      const localButton = page.getByRole('button', { name: 'Сохранить', exact: true });
      const properties = element => {
        const css = getComputedStyle(element), border = getComputedStyle(element.querySelector('.app-button__border'));
        return { height: css.height, width: css.width, maxWidth: css.maxWidth, font: css.fontFamily, size: css.fontSize, weight: css.fontWeight, spacing: css.letterSpacing, line: css.lineHeight, background: css.backgroundColor, color: css.color, borderWidth: border.width, borderHeight: border.height, borderSrc: new URL(element.querySelector('.app-button__border').src).pathname.split('/').pop() };
      };
      const expected = await sourceButton.evaluate(properties), actual = await localButton.evaluate(properties);
      console.log('Live source properties: ' + JSON.stringify(expected));
      console.log('Copied local properties: ' + JSON.stringify(actual));
      assert.deepEqual(actual, expected);
      await sourceButton.screenshot({ path: path.join(run, 'mentor-source-normal.png') });
      await localButton.screenshot({ path: path.join(run, 'mentor-copy-normal.png') });
      await sourceButton.hover(); await localButton.hover();
      await page.waitForTimeout(350);
      const transforms = element => [...element.querySelectorAll('.app-button__decor')].map(image => getComputedStyle(image).transform);
      assert.deepEqual(await localButton.evaluate(transforms), await sourceButton.evaluate(transforms));
      await sourceButton.screenshot({ path: path.join(run, 'mentor-source-hover.png') });
      await localButton.screenshot({ path: path.join(run, 'mentor-copy-hover.png') });
      await source.close();
    });
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
  const report = { recordedAt: new Date().toISOString(), passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, screenshots: path.relative(root, run), results, browserErrors: errors };
  writeFileSync(path.join(artifacts, 'ui-check.json'), JSON.stringify(report, null, 2));
  console.log(`${report.passed} passed, ${report.failed} failed. Screenshots: ${report.screenshots}`);
}
