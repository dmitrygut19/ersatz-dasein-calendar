import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
mkdirSync('artifacts',{recursive:true});const directory=mkdtempSync(path.resolve('artifacts/shared-admin-'));
const config=JSON.parse(readFileSync('config/community-calendar.json','utf8')),uid=config.rules[0].seriesId.slice(config.calendarId.length+1);
const control=path.join(directory,'feed.ics'),preload=path.join(directory,'provider.mjs');
function feed(version,count){writeFileSync(control,`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:Источник — версия ${version}\r\nDTSTART:20261120T180000\r\nDTEND:20261120T190000\r\nRRULE:FREQ=WEEKLY;COUNT=${count}\r\nEND:VEVENT\r\nEND:VCALENDAR`);}
feed(1,2);writeFileSync(preload,`import {readFileSync} from 'node:fs';const original=fetch;globalThis.fetch=(input,options)=>String(input).startsWith('https://calendar.google.com/')?Promise.resolve(new Response(readFileSync(${JSON.stringify(control)},'utf8'),{headers:{'content-type':'text/calendar'}})):original(input,options);`);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--import',pathToFileURL(preload).href,'scripts/render-start.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_PUBLIC_DEMO:'1',CALENDAR_DEMO_REMOTE:'1',CALENDAR_EXPERIMENT:'',CALENDAR_EXPERIMENT_TOKEN:'',CALENDAR_PUBLIC_DEMO_DIRECTORY:path.join(directory,'legacy-demo'),CALENDAR_SHARED_DATABASE_PATH:path.join(directory,'shared.sqlite')}});
let browser;const checks=[],errors=[];
try{
for(let i=0;i<100;i++){try{if((await fetch(base+'/admin')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
browser=await chromium.launch({channel:'chrome',headless:true});const a=await browser.newContext(),b=await browser.newContext();
async function api(context,route,data,method=data?'POST':'GET'){const r=await context.request.fetch(base+route,{method,headers:{Origin:base},data});const result=await r.json();assert.equal(r.status(),200,JSON.stringify(result));return result;}
await api(a,'/api/integration',{action:'sync'});
const range='?from=2026-11-01&to=2026-12-31';
let admin=(await api(a,'/api/events'+range)).events,publicEvents=(await api(b,'/api/calendar'+range)).events;
assert.equal(admin.length,2);assert.deepEqual(admin.map(e=>[e.id,e.title,e.date]),publicEvents.map(e=>[e.id,e.title,e.date]));assert.ok(admin.every(e=>e.source==='google'&&e.typeId===config.rules[0].typeId));
const types=(await api(a,'/api/types')).types;assert.equal(types.length,config.types.length);assert.ok(types.every(t=>!t.id.startsWith('demo-')));checks.push('Remote-mode admin and public APIs read the same real imported records and confirmed types');
const first=admin[0];await api(a,'/api/events/'+first.id,{scope:'occurrence',changes:{points:37,coverPath:'/assets/panel/a5ff5.png'}},'PUT');
assert.equal((await api(b,'/api/events'+range)).events.find(e=>e.id===first.id).points,37);assert.equal((await api(b,'/api/calendar'+range)).events.find(e=>e.id===first.id).cover,'/assets/panel/a5ff5.png');checks.push('Admin settings reach another browser and the public calendar');
const page=await a.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(base+'/admin');await expect(page.locator('.event-group-card')).toHaveCount(1);await expect(page.locator('.event-group-card')).toContainText('Источник — версия 1');await page.reload();await expect(page.locator('.event-group-card')).toContainText('Источник — версия 1');assert.equal(await page.locator('html').getAttribute('data-public-demo'),null);await page.locator('.event-title').first().click();await page.locator('.group-release').first().click();await expect(page.locator('.event-detail')).toContainText('37 е-баллов');await expect(page.locator('.event-detail')).toContainText('Серия из календаря-источника');await page.screenshot({path:path.join(directory,`admin-${width}.png`),animations:'disabled'});await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await api(a,'/api/demo/reset',{});assert.equal((await api(a,'/api/events'+range)).events.length,2);checks.push('Reload and old demo-reset requests cannot erase real imports or their settings');
feed(2,3);await api(a,'/api/integration',{action:'sync'});admin=(await api(a,'/api/events'+range)).events;publicEvents=(await api(b,'/api/calendar'+range)).events;assert.equal(admin.length,3);assert.ok(admin.every(e=>e.title==='Источник — версия 2'));assert.deepEqual(admin.map(e=>[e.id,e.title,e.date]),publicEvents.map(e=>[e.id,e.title,e.date]));assert.equal(admin.find(e=>e.id===first.id).points,37);assert.ok(admin.every(e=>e.typeId===config.rules[0].typeId));checks.push('Source refresh and new releases appear in both views while own settings and UID assignments survive');
assert.deepEqual(errors,[]);writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({directory,checks,errors}));
}finally{await browser?.close();server.kill();}
