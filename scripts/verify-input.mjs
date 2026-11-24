import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDemo } from './seed.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const run = mkdtempSync(path.join(root, 'artifacts/input-run-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`, token = randomBytes(32).toString('hex');
const database = path.join(run, 'input.sqlite'); seedDemo(database);
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: database }, stdio: 'pipe' });
let browser, output = '';
server.stdout.on('data', d => { output += d; }); server.stderr.on('data', d => { output += d; });
const errors = [], results = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?preview=input#${token}`); await page.waitForURL('**/admin/input');
  await page.waitForFunction(() => [...document.querySelectorAll('astro-island')].every(n => !n.hasAttribute('ssr')));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.input-reference').screenshot({ path: path.join(run, 'states-desktop.png') });
  const reference = path.join(root, 'artifacts/input-figma.png');
  if (existsSync(reference)) {
    const comparison = [];
    for (const file of [reference, path.join(run, 'states-desktop.png')]) {
      comparison.push(await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return [[20,76,80,17],[448,73,80,17],[20,168,80,17],[64,32,140,24]].map(([x,y,w,h]) => {
          const {data} = ctx.getImageData(x,y,w,h); const points = [];
          for (let j=0;j<h;j++) for(let i=0;i<w;i++) {const k=(j*w+i)*4;if(data[k]<190 && data[k+1]<120 && data[k+2]<120 && data[k+3]>180) points.push([x+i,y+j]);}
          return {top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1])),left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0]))};
        });
      }, 'data:image/png;base64,' + readFileSync(file).toString('base64')));
    }
    writeFileSync(path.join(run, 'text-comparison.json'), JSON.stringify(comparison, null, 2));
    console.log('Text bounds (Figma / browser):', JSON.stringify(comparison));
  }
  await page.getByLabel('Default', { exact: true }).fill('Проверка ввода');
  await expect(page.getByLabel('Default', { exact: true })).toHaveValue('Проверка ввода');
  await expect(page.getByLabel('Disabled', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('error', { exact: true })).toHaveAccessibleDescription('Ошибка');
  await page.getByLabel('Default', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('error', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Disabled', { exact: true })).not.toBeFocused();
  results.push('Ввод, клавиатура, disabled, связь ошибки с полем');
  await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
  await expect(page.getByLabel('Название типа', { exact: true })).toBeFocused();
  await page.locator('.types-panel').screenshot({ path: path.join(run, 'existing-form-desktop.png') });
  results.push('Компонент в существующей форме');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByLabel('Default', { exact: true }).fill('Введите значение');
    await page.getByRole('heading', { name: 'Input', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.input-reference').screenshot({ path: path.join(run, `states-${width}.png`) });
    results.push(`Состояния и отсутствие переполнения ${width}px`);
  }
  const assets = await page.evaluate(() => [...document.querySelectorAll('.input-reference img')].map(n => ({ src: n.getAttribute('src'), loaded: n.complete && n.naturalWidth > 0, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
  assert.equal(assets.length, 6); assert.ok(assets.every(a => a.loaded && a.width === 24 && a.height === 24));
  for (const state of ['default', 'error', 'disabled']) assert.equal((await fetch(`${base}/assets/input/${state}.png`)).status, 200);
  assert.deepEqual(errors, []);
  results.push('Локальные оригинальные иконки и рамки, нет ошибок JavaScript');
  writeFileSync(path.join(root, 'artifacts/input-check.json'), JSON.stringify({ run, results, errors, assets }, null, 2));
  console.log(JSON.stringify({ run, passed: results.length, results }, null, 2));
} finally { await browser?.close(); server.kill(); }
