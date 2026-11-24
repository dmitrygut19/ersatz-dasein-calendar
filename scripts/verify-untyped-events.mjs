import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {chromium,expect} from '@playwright/test';

mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/untyped-events-'));
const database=path.join(directory,'test.sqlite'),token=randomBytes(32).toString('hex'),checks=[],errors=[];
const control=path.join(directory,'feed.ics'),fixture=path.join(directory,'provider.mjs');
function feed(count=3){writeFileSync(control,`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:queue-series\r\nSUMMARY:Импортированная серия\r\nDTSTART:20261120T180000\r\nDTEND:20261120T190000\r\nRRULE:FREQ=WEEKLY;COUNT=${count}\r\nEND:VEVENT\r\nEND:VCALENDAR`);}
feed();
writeFileSync(fixture,`import {readFileSync} from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(input,options)=>String(input).startsWith('https://calendar.google.com/')?new Response(readFileSync(${JSON.stringify(control)},'utf8'),{headers:{'content-type':'text/calendar'}}):original(input,options);`);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`;let server,browser;
function db(action){const conn=new Database(database);try{return action(conn);}finally{conn.close();}}
async function api(route,body,method=body===undefined?'GET':'POST',status=200){const r=await fetch(base+route,{method,headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
const list=async()=>(await api('/api/events')).events;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
server=spawn(process.execPath,['--import',pathToFileURL(fixture).href,'dist/server/entry.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:database,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_CARD_REVIEW:'0',CALENDAR_ADMIN_UI:'lino'}});
for(let i=0;i<100;i++){try{await api('/api/types');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
const type=(await api('/api/types',{name:'Совпадение',accessLabel:'Все',degree:'II',theme:'ordinary'})).type;
const other=(await api('/api/types',{name:'Другой тип',accessLabel:'Все',degree:'III',theme:'ordinary'})).type;
async function event(title,extra={}){return (await api('/api/events',{title,date:'2026-11-21',start:'19:00',end:'20:00',...extra})).event;}
const typed=await event('Уже настроено',{typeId:type.id});
const same=await event('Совпадение',{audienceLodgeIds:['priesthood','raubritters'],degree:'III'});
await event('Одинаковое имя');await event('Одинаковое имя');
const create=await event('Создать тип из контекста');
const all=await event('Все ложи с градусом',{degree:'II'});
await api('/api/integration/connect',{provider:'google',url:'https://calendar.google.com/calendar/ical/untyped-fixture/private-test/basic.ics'});
let series=(await list()).filter(e=>e.title==='Импортированная серия');assert.equal(series.length,3);
await api('/api/type-suggestions/resolve',{eventId:series[0].eventId,typeId:other.id,action:'other'});
await api('/api/events/'+series[1].id,{scope:'series',changes:{audienceLodgeIds:['students'],degree:'I',coverPath:'/assets/panel/2a38c.png'}},'PUT');
await api('/api/events/'+series[2].id,{scope:'series',changes:{audienceLodgeIds:['raubritters'],degree:'II'}},'PUT');
// Same UID in another source calendar must be a separate group.
const separate=await event('Импортированная серия');
db(conn=>conn.prepare("UPDATE events SET source='google',external_calendar_id='ical:other-calendar',external_id=? WHERE id=?").run('queue-series@2026-12-04',separate.id));
browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();await context.request.post(base+'/api/local-session',{data:{token},headers:{Origin:base}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const cards=()=>page.locator('.untyped-event-card');
const card=title=>cards().filter({has:page.getByRole('button',{name:title,exact:true})});
async function choose(row,name){await row.getByLabel('Тип события',{exact:true}).click();await page.getByRole('option',{name,exact:true}).click();}
await page.goto(base+'/admin?screen=access&adminUi=lino');
await check('Queue uses type IDs, keeps same-name singletons and distinguishes source calendars',async()=>{
await expect(page.getByRole('heading',{name:'События без типа',exact:true})).toBeVisible();await expect(card('Уже настроено')).toHaveCount(0);await expect(card('Совпадение')).toHaveCount(1);await expect(card('Одинаковое имя')).toHaveCount(2);await expect(card('Импортированная серия')).toHaveCount(2);await expect(card('Импортированная серия').filter({hasText:'2 выпусков без типа'})).toContainText('2 выпусков без типа');
});
await check('Draft selection does not assign; text-only lodge tags, no degrees in this section',async()=>{
const row=card('Совпадение');await expect(row.getByLabel('Тип события',{exact:true})).toContainText('Выбрать тип');await choose(row,'Совпадение');assert.equal((await list()).find(e=>e.id===same.id).typeId,null);
await expect(row.locator('[data-access-tag="lodge:priesthood"]')).toHaveText('Жречество');await expect(row.locator('[data-access-tag="lodge:raubritters"]')).toHaveText('Раубриттеры');await expect(cards().locator('[data-access-tag="degree"]')).toHaveCount(0);await expect(cards().locator('.untyped-access-tag img,.untyped-access-tag svg')).toHaveCount(0);
await expect(card('Все ложи с градусом')).toContainText('Все ложи');
});
await check('Heterogeneous series never presents first release access as shared; releases can be inspected',async()=>{
const row=card('Импортированная серия').filter({hasText:'2 выпусков без типа'});await expect(row).toContainText('Разные условия доступа');await row.getByRole('button',{name:'Посмотреть выпуски'}).click();await expect(page.locator('.queue-release')).toHaveCount(2);await expect(page.locator('.queue-release').first()).toContainText('Студенты');await expect(page.locator('.queue-release').last()).toContainText('Раубриттеры');await page.getByRole('button',{name:'Закрыть список событий'}).click();await expect(page.getByRole('heading',{name:'События без типа',exact:true})).toBeVisible();
});
await check('Assignment preserves own restrictions and updates both lists without reload',async()=>{
await api('/api/events/assign-type',{eventIds:[same.id,'missing-record'],typeId:type.id},'POST',404);assert.equal((await list()).find(e=>e.id===same.id).typeId,null);
await card('Совпадение').getByRole('button',{name:'Назначить тип',exact:true}).click();await expect(card('Совпадение')).toHaveCount(0);const saved=(await list()).find(e=>e.id===same.id);assert.equal(saved.typeId,type.id);assert.equal(saved.typeDegree,'III');assert.deepEqual(saved.audienceLodgeIds,['priesthood','raubritters']);await page.getByRole('button',{name:'Все события',exact:true}).click();await expect(page.locator('.event-group-card').filter({hasText:'Совпадение'})).toHaveCount(1);await page.getByRole('button',{name:'События без типа',exact:true}).click();
});
await check('Series assignment is atomic, skips already typed releases, preserves settings and future UID mapping',async()=>{
const row=card('Импортированная серия').filter({hasText:'2 выпусков без типа'});await choose(row,'Совпадение');await row.getByRole('button',{name:'Назначить тип',exact:true}).click();await expect(card('Импортированная серия')).toHaveCount(1);
const after=await list();assert.equal(after.find(e=>e.id===series[0].id).typeId,other.id);for(const item of series.slice(1))assert.equal(after.find(e=>e.id===item.id).typeId,type.id);assert.equal(after.find(e=>e.id===series[1].id).cover,'/assets/panel/2a38c.png');assert.equal(after.find(e=>e.id===series[1].id).url,series[1].url);assert.equal(after.find(e=>e.id===separate.id).typeId,null);
feed(4);await api('/api/integration',{action:'sync'});series=(await list()).filter(e=>e.sourceCalendarId!== 'ical:other-calendar'&&e.title==='Импортированная серия');assert.equal(series.length,4);assert.equal(series.find(e=>e.date==='2026-12-11').typeId,type.id);assert.equal(series.find(e=>e.date==='2026-11-20').typeId,other.id);
});
await check('Contextual creation cancellation, assignment failure and retry reuse one new type',async()=>{
const row=card('Создать тип из контекста');await row.getByRole('button',{name:'Создать тип',exact:true}).click();await expect(page.getByLabel('Название типа',{exact:true})).toHaveValue('Создать тип из контекста');await page.locator('.type-editor').getByRole('button',{name:'Отмена',exact:true}).click();assert.equal((await api('/api/types')).types.length,2);assert.equal((await list()).find(e=>e.id===create.id).typeId,null);
await row.getByRole('button',{name:'Создать тип',exact:true}).click();await page.route('**/api/events/assign-type',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Ошибка назначения: тип уже создан'})}));await page.locator('.type-editor').getByRole('button',{name:'Сохранить',exact:true}).click();await expect(row.getByRole('alert')).toContainText('тип уже создан');await expect(row.getByLabel('Тип события',{exact:true})).toContainText('Создать тип из контекста');assert.equal((await api('/api/types')).types.length,3);
await page.unroute('**/api/events/assign-type');let writes=0;await page.route('**/api/events/assign-type',async route=>{writes++;await new Promise(r=>setTimeout(r,300));await route.continue();});await row.getByRole('button',{name:'Назначить тип',exact:true}).dblclick();await expect(row).toHaveCount(0);assert.equal(writes,1);await page.unroute('**/api/events/assign-type');assert.equal((await api('/api/types')).types.length,3);assert.ok((await list()).find(e=>e.id===create.id).typeId);
});
await check('Mobile wrap, no status badges, empty state, persistence after sync and reload',async()=>{
for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.reload();await expect(cards().first()).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await expect(cards().locator('.access-badge')).toHaveCount(0);await expect(cards().locator('[data-access-tag="degree"]')).toHaveCount(0);await page.locator('.event-list').screenshot({path:path.join(directory,`queue-${width}.png`)});}
for(const row of (await list()).filter(e=>!e.typeId))await api('/api/events/assign-type',{eventIds:[row.eventId],typeId:type.id});await page.reload();await expect(page.getByRole('heading',{name:'Все события распределены по типам'})).toBeVisible();await expect(page.getByText('Новые события без назначенного типа появятся здесь')).toBeVisible();await expect(page.getByRole('button',{name:'Все события',exact:true})).toBeVisible();
});
await check('Imported series repeat label is readable and degree is absent from display',async()=>{
await page.getByRole('button',{name:'Все события',exact:true}).click();const row=page.locator('.event-group-card').filter({has:page.getByRole('button',{name:'Импортированная серия',exact:true})}).first();await row.getByRole('button',{name:'Выпуски серии',exact:true}).click();await page.locator('.group-release').first().click();await expect(page.locator('.event-detail')).toContainText('Повтор: Серия из календаря-источника');await expect(page.locator('.event-detail .tier-badge')).not.toContainText('градус');await page.keyboard.press('Escape');await page.getByRole('button',{name:'События без типа',exact:true}).click();
});
await check('Empty type directory leaves real untyped cards and creation available',async()=>{
db(conn=>{conn.exec('UPDATE events SET type_id=NULL;DELETE FROM event_type_usage;DELETE FROM event_types');});await page.reload();await expect(cards().first()).toBeVisible();await expect(cards().first().getByLabel('Тип события',{exact:true})).toBeDisabled();await cards().first().getByRole('button',{name:'Создать тип',exact:true}).click();await expect(page.locator('.type-editor')).toBeVisible();await page.locator('.type-editor').getByRole('button',{name:'Отмена',exact:true}).click();
});
assert.deepEqual(errors,[]);writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({directory,checks,errors}));
}finally{await browser?.close();if(server?.exitCode===null)server.kill();}
