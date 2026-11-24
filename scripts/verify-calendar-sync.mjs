import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

mkdirSync('artifacts', { recursive: true });
const directory = mkdtempSync(path.resolve('artifacts/calendar-sync-'));
const token = randomBytes(32).toString('hex');
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/server/entry.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: path.join(directory, 'test.sqlite') }, stdio: 'ignore' });
const now = new Date(), month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
const date = `${month}-15`, movedDate = `${month}-16`, checks = [], errors = [];
let browser;
async function api(route, body, method = 'POST') {
  const response = await fetch(base+route, { method, headers: { Authorization: `Bearer ${token}`, Origin: base, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json(); assert.equal(response.status,200,JSON.stringify(result)); return result;
}
try {
  for (let i=0;i<80;i++) { try { if((await fetch(base)).ok)break; }catch{} await new Promise(resolve=>setTimeout(resolve,100)); }
  const type = (await api('/api/types',{name:'Сквозная проверка',accessLabel:'Все',venueUrl:'https://example.org/initial',theme:'ordinary'})).type;
  const event = (await api('/api/events',{title:'Проверяемое событие',date,start:'12:00',end:'13:00',typeId:type.id,description:'До изменения'})).event;
  await api('/api/events',{title:'Сосед по новой дате',date:movedDate,start:'10:00',end:'11:00',typeId:type.id});
  browser = await chromium.launch({channel:'chrome',headless:true});
  const adminContext = await browser.newContext({viewport:{width:1440,height:1100}});
  await adminContext.request.post(base+'/api/local-session',{data:{token},headers:{Origin:base}});
  const admin = await adminContext.newPage();
  const guestContext = await browser.newContext({viewport:{width:390,height:1000}});
  await guestContext.route('**/api/calendar/activity',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  const guest = await guestContext.newPage();
  await guest.clock.install();
  for(const page of [admin,guest])page.on('pageerror',error=>errors.push(error.message));
  await admin.goto(base+'/admin'); await guest.goto(base+'/calendar');
  await guest.getByRole('button',{name:'Открыть Проверяемое событие',exact:true}).last().click();
  await expect(guest.locator('.uc-card-btn')).toBeEnabled();
  const refresh = async () => { const result=guest.waitForResponse(r=>r.url().includes('/api/calendar?')); await guest.evaluate(()=>window.dispatchEvent(new Event('focus'))); await result; };

  await admin.getByRole('button',{name:'Редактировать Сквозная проверка',exact:true}).last().click();
  await admin.getByLabel('Ссылка на площадку',{exact:true}).fill('https://example.org/changed');
  await admin.locator('#type-degree').click(); await admin.getByRole('option',{name:'Градус II',exact:true}).click();
  await admin.locator('.type-editor').getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(admin.locator('.type-editor')).toHaveCount(0);
  await refresh(); await expect(guest.locator('.uc-card-btn')).toBeDisabled();
  let publicData=await (await guestContext.request.get(base+`/api/calendar?from=${month}-01&to=${month}-28`)).json();
  assert.equal(publicData.events[0].url,'https://example.org/changed');
  checks.push('Admin type link and minimum degree reach an already-open anonymous card on focus');

  await admin.getByRole('button',{name:'Проверяемое событие',exact:true}).click();
  await admin.getByRole('button',{name:'Редактировать событие',exact:true}).click();
  await admin.getByLabel('Название',{exact:true}).fill('Перенесённое событие');
  await admin.locator('.editor-panel textarea').fill('Описание после изменения');
  await admin.locator('.editor-panel input[type=date]').fill(movedDate);
  await admin.getByLabel('Начало',{exact:true}).fill('16:00'); await admin.getByLabel('Конец',{exact:true}).fill('17:30');
  await admin.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
  await expect(admin.locator('.event-detail h2')).toHaveText('Перенесённое событие');
  await refresh(); await expect(guest.locator('.uc-card-name')).toHaveText('Перенесённое событие');
  await expect(guest.locator('.uc-card-desc')).toHaveText('Описание после изменения');
  await expect(guest.locator('.uc-card-date')).toContainText('16:00');
  await expect(guest.locator('.uc-day.uc-selected .uc-day-number')).toHaveText(/^16(?:\s*·\s*16:00)?$/);
  await expect(guest.locator('.uc-dot-active')).toHaveCount(1);
  await expect(guest.locator('.uc-card-pager .uc-counter')).toHaveText('2/2');
  checks.push('Manual title/description/date/time edits refresh the open card and move selected day/dot');

  const appearance={theme:'ordinary',start:'#F3F2ED',end:'#F9F8F6',accent:'#AF5120',text:'#2B2121',bordered:true,buttonBackground:'#3E7C5A',buttonText:'#FFFFFF',buttonAccent:'#AF5120'};
  await api(`/api/events/${event.id}`,{appearance,coverPath:'/assets/panel/6713c.png',accessLabel:'Участники'},'PUT');
  await refresh();
  await expect(guest.locator('.uc-card-cover img')).toHaveAttribute('src','/assets/panel/6713c.png');
  await expect(guest.locator('.uc-card-badge')).toContainText('Участники');
  assert.equal(await guest.locator('.uc-card-btn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(62, 124, 90)');
  await api(`/api/types/${type.id}`,{...type,degree:null,venueUrl:'https://example.org/latest'},'PUT');
  await refresh(); await expect(guest.locator('.uc-card-btn')).toBeDisabled();
  checks.push('Individual cover/palette/access propagate and survive later type changes');

  await api(`/api/events/${event.id}`,{accessLabel:'',appearance:null,coverPath:''},'PUT');
  await refresh(); await expect(guest.locator('.uc-card-btn')).toBeEnabled();
  await expect(guest.locator('.uc-card-cover img')).toHaveCount(0);
  const popupPromise=guestContext.waitForEvent('page');
  await guestContext.route('https://example.org/**',route=>route.fulfill({status:200,body:'verified'}));
  await guest.locator('.uc-card-btn').click(); const popup=await popupPromise; await popup.waitForURL('https://example.org/latest'); await popup.close();
  checks.push('Restoring inheritance enables public access and follows the latest type URL');

  await api(`/api/events/${event.id}`,{accessLabel:'Проверочная группа'},'PUT');
  const poll=guest.waitForResponse(r=>r.url().includes('/api/calendar?'));
  await guest.clock.fastForward(60_000); await poll; await expect(guest.locator('.uc-card-btn')).toBeDisabled();
  checks.push('A visible calendar refreshes automatically within the one-minute interval without reload');
  await api(`/api/events/${event.id}`,undefined,'DELETE'); await refresh();
  await expect(guest.locator('.uc-card')).toHaveCount(0); await expect(guest.locator('.uc-day.uc-selected')).toHaveCount(0);
  await expect(guest.locator('.uc-dot-active')).toHaveCount(0);
  checks.push('Deleted events disappear and close the open card and day selection');
  const series = (await api('/api/events',{title:'Проверочная серия',date,start:'18:00',end:'19:00',typeId:type.id,repeatRule:{freq:'daily',interval:1,byWeekday:[],until:null,count:3}})).event;
  await refresh();
  await expect(guest.locator('.uc-open').and(guest.getByRole('button',{name:'Открыть Проверочная серия',exact:true}))).toHaveCount(3);
  await guest.locator('.uc-open').and(guest.getByRole('button',{name:'Открыть Проверочная серия',exact:true})).first().click();
  await api(`/api/events/${encodeURIComponent(series.id+'@'+date)}`,{date:month+'-18',start:'20:00',end:'21:00'},'PUT');
  await refresh(); await expect(guest.locator('.uc-day.uc-selected .uc-day-number')).toHaveText(/^18(?:\s*·\s*20:00)?$/);
  await expect(guest.locator('.uc-card-date')).toContainText('20:00');
  await api(`/api/events/${encodeURIComponent(series.id+'@'+date)}`,{accessLabel:'Участники'},'PUT');
  await refresh(); await expect(guest.locator('.uc-card-date')).toContainText('20:00');
  await expect(guest.locator('.uc-card-badge')).toContainText('Участники');
  const movedWindow=await (await guestContext.request.get(base+`/api/calendar?from=${month}-18&to=${month}-18`)).json();
  const movedRelease=movedWindow.events.find(e=>e.id===series.id+'@'+date);
  assert.ok(movedRelease,'Moved release must be listed even if its original date is outside the requested window');
  assert.equal(movedRelease.start,'20:00');
  await api(`/api/events/${encodeURIComponent(series.id+'@'+movedDate)}`,undefined,'DELETE');
  await refresh();
  publicData = await (await guestContext.request.get(base+`/api/calendar?from=${month}-01&to=${month}-28`)).json();
  assert.deepEqual(publicData.events.filter(e=>e.title==='Проверочная серия').map(e=>e.date),[month+'-17',month+'-18']);
  await api(`/api/events/${series.id}`,undefined,'DELETE'); await refresh();
  await expect(guest.locator('.uc-card')).toHaveCount(0);
  checks.push('Series creation, moving one release, cancelling another and deleting the series reach the guest calendar');
  assert.deepEqual(errors,[]);
  writeFileSync(path.join(directory,'report.json'),JSON.stringify({recordedAt:new Date().toISOString(),scope:'Isolated admin and separate anonymous browser contexts; no production data modified',checks,errors},null,2));
  console.log(JSON.stringify({directory,checks,errors},null,2));
} finally { if(browser)await browser.close(); server.kill(); }
