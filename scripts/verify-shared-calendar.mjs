import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const dir=mkdtempSync(path.resolve('artifacts/shared-calendar-')),control=path.join(dir,'feed.ics');
const cfg=JSON.parse(readFileSync('config/community-calendar.json','utf8'));
const rule=cfg.rules.find(r=>r.settings.allowedDegrees?.length===1&&r.settings.allowedDegrees[0]==='II');
const uid=rule.seriesId.slice(rule.calendarId.length+1);
const feed=(start='193000',desc='Первая версия')=>['BEGIN:VCALENDAR','VERSION:2.0','X-WR-TIMEZONE:Europe/Moscow','BEGIN:VEVENT','UID:'+uid,'SUMMARY:Проверка общего источника','DTSTART;TZID=Europe/Moscow:20261118T'+start,'DTEND;TZID=Europe/Moscow:20261118T203000','DESCRIPTION:'+desc+' https://meet.jit.si/shared-calendar-test','END:VEVENT','END:VCALENDAR'].join('\r\n');
writeFileSync(control,feed());const shim=path.join(dir,'provider.mjs');writeFileSync(shim,`import {readFileSync} from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(input,options)=>String(input).startsWith('https://calendar.google.com/')?new Response(readFileSync(${JSON.stringify(control)},'utf8')):original(input,options);`);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
let server,browser,logs='';
async function start(review=true){server=spawn(process.execPath,['--import',pathToFileURL(shim).href,'scripts/render-start.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CALENDAR_DEMO_REMOTE:review?'0':'1',CALENDAR_SHARED_ADMIN:review?'1':'0',CALENDAR_PUBLIC_DEMO:'1',CALENDAR_PUBLIC_DEMO_DIRECTORY:path.join(dir,'db'),CALENDAR_SYNC_INTERVAL_MS:'0'}});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let i=0;i<150;i++){try{const r=await fetch(base+'/api/calendar?from=2026-11-01&to=2026-11-30');if(r.ok&&(await r.json()).events.some(e=>e.title==='Проверка общего источника'))return;}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}throw Error(logs);}
async function stop(){if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done;}}
try{
await start();browser=await chromium.launch({channel:'chrome',headless:true});const a=await browser.newContext(),b=await browser.newContext();
const api=async(context,route)=>{const r=await context.request.get(base+route);assert.equal(r.status(),200);return r.json();};
const admin=await api(a,'/api/events?from=2026-11-01&to=2027-11-22');const publicData=await api(b,'/api/calendar?from=2026-11-01&to=2027-11-22');assert.deepEqual(new Set(admin.events.filter(e=>e.status==='scheduled').map(e=>e.id)),new Set(publicData.events.map(e=>e.id)));
const item=publicData.events.find(e=>e.title==='Проверка общего источника');assert.ok(item);assert.equal(item.canFollow,false);assert.equal(item.topicLodgeId,rule.settings.topicLodgeId);
const page=await a.newPage();await page.goto(base+'/admin');await page.reload();assert.equal((await api(a,'/api/integration')).integration.state,'connected');
const reset=await a.request.post(base+'/api/demo/reset',{headers:{Origin:base},data:{}});assert.equal(reset.status(),200);assert.equal((await api(a,'/api/integration')).integration.state,'connected');
const privateConnect=await a.request.post(base+'/api/integration/connect',{headers:{Origin:base},data:{provider:'google',url:'https://calendar.google.com/calendar/ical/personal/private-secret/basic.ics'}});assert.equal(privateConnect.status(),422);
writeFileSync(control,feed('194500','Изменённое описание'));const sync=await a.request.post(base+'/api/integration',{headers:{Origin:base},data:{action:'sync'}});assert.equal(sync.status(),200);
const updated=(await api(b,'/api/calendar?from=2026-11-01&to=2026-11-30&demoMember=1')).events.find(e=>e.title==='Проверка общего источника');assert.equal(updated.start,'19:45');assert.match(updated.description,/Изменённое описание/);assert.equal(updated.url,'https://meet.jit.si/shared-calendar-test');assert.equal(updated.id,item.id);
await stop();await start();assert.equal((await api(b,'/api/integration')).integration.state,'connected');assert.ok((await api(b,'/api/events?from=2026-11-01&to=2026-11-30')).events.find(e=>e.title==='Проверка общего источника'));
await stop();await start(false);const publishedAdmin=await api(a,'/api/events?from=2026-11-01&to=2026-11-30');assert.equal(publishedAdmin.events.length,24);assert.ok(!publishedAdmin.events.some(e=>e.title==='Проверка общего источника'));assert.equal((await api(a,'/api/integration')).integration.state,'manual');assert.ok((await api(b,'/api/calendar?from=2026-11-01&to=2026-11-30')).events.some(e=>e.title==='Проверка общего источника'));
const report={passed:true,checks:['test admin and public calendar share source records','reload and reset retain the public source','private source rejected on the local shared test stand','source time,description,link update in another browser without duplicate IDs','data and connection survive process restart','production admin keeps its 24 old fixtures and manual connection while public calendar uses Google'],realAccountsVerified:false};writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dir,...report},null,2));
}finally{if(browser)await browser.close();await stop();}
