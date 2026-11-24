import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
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
const run = mkdtempSync(path.join(artifacts, 'verify-participants-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`, token = randomBytes(32).toString('hex');
const database = path.join(run, 'p.sqlite'); seedDemo(database);
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { cwd: root, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { if (server.exitCode !== null) throw new Error(output); try { if ((await fetch(base)).status === 200) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, 'Server did not start');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/#${token}`); await page.waitForURL('**/admin');
  for (const [screen, width, height, full] of [['participants', 1440, 1200, false], ['participant', 1440, 1200, false], ['participants', 390, 844, true], ['participant', 390, 844, true]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/admin?screen=${screen}`);
    await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
    const file = path.join(run, `${screen}-${width}.png`);
    await page.screenshot({ path: file, fullPage: full });
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, broken: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')) }));
    console.log(file, 'overflow=' + state.overflow, 'broken=' + JSON.stringify(state.broken));
    assert.equal(state.overflow, false); assert.deepEqual(state.broken, []);
  }
  assert.deepEqual(errors, []);
  console.log('PASS participants screenshots:', path.relative(root, run));
  await browser.close();
} finally {
  if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
}
