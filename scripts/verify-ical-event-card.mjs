import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { seedDemo } from './seed.mjs';
import { createServer } from 'node:net';
const dir=mkdtempSync(path.resolve('artifacts/check-source-update-'));
const file=path.join(dir,'test.sqlite'),control=path.join(dir,'source.ics');seedDemo(file);
const empty=new Database(file);empty.exec('DELETE FROM event_type_usage; DELETE FROM events;');empty.close();
const shim=path.join(dir,'provider.mjs');
writeFileSync(shim,`import {readFileSync} from 'node:fs';globalThis.fetch=async()=>new Response(readFileSync(${JSON.stringify(control)},'utf8'),{headers:{'content-type':'text/calendar'}});`);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`,token='check-source-update-local-only-token';
const server=spawn(process.execPath,['--import',pathToFileURL(shim).href,'dist/server/entry.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CALENDAR_DATABASE_PATH:file,CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_CARD_REVIEW:'0',CALENDAR_SYNC_INTERVAL_MS:'0'}});
const headers={Origin:base,Authorization:'Bearer '+token,'Content-Type':'application/json'};
const feed=(fields)=>['BEGIN:VCALENDAR','VERSION:2.0','X-WR-TIMEZONE:Europe/Moscow','BEGIN:VEVENT','UID:verified-source-event','SUMMARY:Source update check',...fields,'END:VEVENT','END:VCALENDAR'].join('\r\n');
async function post(route,body){const r=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function event(){return (await(await fetch(base+'/api/calendar?from=2026-11-01&to=2026-11-30')).json()).events.find(e=>e.title==='Source update check');}
let browser;
try{
for(let i=0;i<100;i++){try{if((await fetch(base+'/calendar')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
writeFileSync(control,feed(['DTSTART;VALUE=DATE:20261117','DTEND;VALUE=DATE:20261118']));
await post('/api/integration/connect',{provider:'google',url:'https://calendar.google.com/calendar/ical/check/public/basic.ics'});
const first=await event();assert.equal(first.allDay,true);assert.equal(first.url,'');
writeFileSync(control,feed(['DTSTART;TZID=Europe/Moscow:20261118T193000','DTEND;TZID=Europe/Moscow:20261118T203000','URL:https://meet.jit.si/source-update-check']));
await post('/api/integration',{action:'sync'});
const timed=await event();assert.equal(timed.id,first.id.replace('2026-11-17','2026-11-18'));assert.equal(timed.date,'2026-11-18');assert.equal(timed.start,'19:30');assert.equal(timed.allDay,false);assert.equal(timed.url,'https://meet.jit.si/source-update-check');
browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(base+'/calendar');await page.locator('.uc-caption').filter({hasText:'Source update check'}).click();
await page.locator('.uc-card-date').waitFor();assert.match(await page.locator('.uc-card-date').innerText(),/18 ноября.*19:30/);assert.equal(await page.locator('.figma-card-actions a').filter({hasText:'К событию'}).getAttribute('href'),timed.url);
const checks=['all-day source becomes timed after sync','date and 19:30 shown in actual card','ICS URL creates working event button'];
for(const field of ['DESCRIPTION','LOCATION','CONFERENCE','X-GOOGLE-CONFERENCE','X-ALT-DESC;FMTTYPE=text/html']){
writeFileSync(control,feed(['DTSTART;TZID=Europe/Moscow:20261118T193000','DTEND;TZID=Europe/Moscow:20261118T203000',field+':https://meet.jit.si/source-update-check']));await post('/api/integration',{action:'sync'});assert.equal((await event()).url,'https://meet.jit.si/source-update-check');await page.reload();await page.locator('.uc-caption').filter({hasText:'Source update check'}).click();assert.equal(await page.locator('.figma-card-actions a').filter({hasText:'К событию'}).getAttribute('href'),'https://meet.jit.si/source-update-check');checks.push(field+' link creates event button after sync');
}
writeFileSync(control,feed(['DTSTART;TZID=Europe/Moscow:20261118T193000','DTEND;TZID=Europe/Moscow:20261118T203000','DESCRIPTION:Новое описание встречи. Ссылка https://meet.jit.si/updated-room']));
await post('/api/integration',{action:'sync'});assert.equal((await event()).url,'https://meet.jit.si/updated-room');
await page.reload();await page.locator('.uc-caption').filter({hasText:'Source update check'}).click();assert.match(await page.locator('.uc-card-desc').innerText(),/Новое описание встречи/);assert.equal(await page.locator('.figma-card-actions a').filter({hasText:'К событию'}).getAttribute('href'),'https://meet.jit.si/updated-room');
writeFileSync(control,feed(['DTSTART;TZID=Europe/Moscow:20261118T193000','DTEND;TZID=Europe/Moscow:20261118T203000','DESCRIPTION:Описание без ссылки.']));
await post('/api/integration',{action:'sync'});assert.equal((await event()).url,'');
await page.reload();await page.locator('.uc-caption').filter({hasText:'Source update check'}).click();assert.equal(await page.locator('.figma-card-actions a').filter({hasText:'К событию'}).count(),0);assert.equal(await page.locator('.uc-card-desc').innerText(),'Описание без ссылки.');
checks.push('description and changed link update in the actual card','removing the link hides the event button');
const report={checks,realGoogleEditsTested:false};writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dir,...report},null,2));
}finally{if(browser)await browser.close();server.kill();await once(server,'exit');}
