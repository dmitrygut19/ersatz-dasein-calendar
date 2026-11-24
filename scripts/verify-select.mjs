import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDemo } from './seed.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'artifacts'); mkdirSync(artifacts, { recursive: true });
const run = mkdtempSync(path.join(artifacts, 'verify-select-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`, token = randomBytes(32).toString('hex');
const database = path.join(run, 'select.sqlite'); seedDemo(database);
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { if (server.exitCode !== null) throw new Error(output); try { if ((await fetch(base)).status === 200) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, 'Server did not start');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/#${token}`); await page.waitForURL('**/admin');
  await page.goto(base + '/admin/types');
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));

  // Custom select on the types panel (Тир/Градус)
  await page.getByRole('button', { name: 'Редактировать Сатурналии', exact: true }).click();
  const tier = page.getByLabel('Тир', { exact: true });
  await expect(tier).toHaveAttribute('aria-haspopup', 'listbox');
  await tier.click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  await page.screenshot({ path: path.join(run, 'dropdown-open.png') });
  await page.getByRole('option', { name: 'Тир III', exact: true }).click();
  await expect(tier).toHaveText('Тир III');
  await expect(menu).toHaveCount(0);

  // Keyboard: reopen with ArrowDown, move, choose with Enter
  await tier.focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(tier).toHaveText('Тир I');
  await expect(menu).toHaveCount(0);

  // Escape closes
  await tier.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Outside click closes
  await tier.click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { name: 'Типы событий' }).click();
  await expect(menu).toHaveCount(0);

  // Access screen resolve select opens the same custom menu
  await page.goto(base + '/admin?screen=access');
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
  const resolve = page.getByLabel('Тип события', { exact: true }).first();
  await resolve.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('option', { name: 'Участники Арены', exact: true }).click();
  await expect(resolve).toHaveText('Участники Арены');
  await page.screenshot({ path: path.join(run, 'access-resolve.png') });

  // Disabled field keeps working
  assert.deepEqual(errors, []);
  console.log('PASS custom select checks. Screenshots:', path.relative(root, run));
  await browser.close();
} finally {
  if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
}
