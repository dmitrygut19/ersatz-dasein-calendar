// Exercises real feed adapters/API/UI against controlled provider responses.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { createDemoClient } from './demo-client.mjs';
import { seedDemo } from './seed.mjs';

mkdirSync('artifacts', { recursive: true });
const directory = mkdtempSync(path.resolve('artifacts/demo-integration-'));
const control = path.join(directory, 'provider-state.json');
const date = new Date().toISOString().slice(0, 10), compact = date.replaceAll('-', '');
const tomorrow = new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const googleUrl = 'https://calendar.google.com/calendar/ical/fixture/private-test-secret/basic.ics';
const yandexUrl = 'https://calendar.yandex.ru/export/ics.xml?private_token=test-secret&tz_id=Europe/Moscow';
const calendar = (name, start='120000', extra='') => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:${name}\r\nBEGIN:VEVENT\r\nUID:shared-fixture-id\r\nSUMMARY:${name} event\r\nDTSTART:${compact}T${start}\r\nDTEND:${compact}T150000\r\n${extra}END:VEVENT\r\nEND:VCALENDAR`;
function state(value={}) { writeFileSync(control,JSON.stringify({google:calendar('Google fixture'),yandex:calendar('Yandex fixture'),...value})); }
state();
const fixture = path.join(directory, 'provider-fixture.mjs');
writeFileSync(fixture, `
import { readFileSync, writeFileSync } from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=String(input), state=JSON.parse(readFileSync(${JSON.stringify(control)},'utf8'));
  if(url.startsWith('https://calendar.google.com/')||url.startsWith('https://calendar.yandex.ru/')) {
    if(state.delayMarker){writeFileSync(${JSON.stringify(directory)}+'/request-'+state.delayMarker+'.txt','started');await new Promise(resolve=>setTimeout(resolve,400));}
    if(options.redirect!=='manual')throw new Error('Redirects must be validated');
    if(state.redirect)return new Response('',{status:302,headers:{location:state.redirect}});
    if(state.fail)return new Response('secret must never leak',{status:503});
    return new Response(state.html?'<html>Sign in</html>':url.includes('google.com')?state.google:state.yandex,{headers:{'content-type':'text/calendar'}});
  }
  throw new Error('Unexpected outbound request');
};
`);
const socket = createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`;
const client=createDemoClient(base);globalThis.fetch=client.fetch;
const env={...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_DEMO_REMOTE:'1',CALENDAR_PUBLIC_DEMO:'1',CALENDAR_SHARED_CALENDAR:'0',CALENDAR_PUBLIC_DEMO_DIRECTORY:path.join(directory,'db'),CALENDAR_SYNC_INTERVAL_MS:'0',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''};
seedDemo(path.join(directory,'db/calendar.sqlite'));
const legacyDb=new Database(path.join(directory,'db/calendar.sqlite'));
legacyDb.prepare("INSERT INTO events (id,title,start_date,start_time,end_time,source,created_at,updated_at) VALUES (?,?,?,?,?,'google',?,?)").run('legacy-private-event','Legacy private fixture',date,'12:00','13:00',Date.now(),Date.now());
legacyDb.close();
let server,browser,output='';const checks=[],errors=[];
async function start(){
  server=spawn(process.execPath,['--import',pathToFileURL(fixture).href,'scripts/render-start.mjs'],{env,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error(output);try{if((await fetch(base+'/api/integration')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  throw new Error('Server did not start: '+output.slice(0,5000));
}
async function stop(){if(server&&server.exitCode===null){const done=once(server,'exit');server.kill();await done;}}
async function request(route,body){return fetch(base+route,{method:body?'POST':'GET',redirect:'manual',headers:{Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function status(){return(await(await request('/api/integration')).json()).integration;}
async function events(){return(await(await request('/api/events?from='+date+'&to='+tomorrow)).json()).events;}
async function connect(provider,url){const response=await request('/api/integration/connect',{provider,url});assert.equal(response.status,200,await response.clone().text());return(await response.json()).integration;}
try{
  await start();
  assert.ok(!(await events()).some(event=>event.title==='Legacy private fixture'));
  for(const [provider,url] of [['google','http://127.0.0.1/a.ics'],['google','https://calendar.google.com.evil.test/calendar/ical/a/basic.ics'],['google',yandexUrl],['yandex',googleUrl],['yandex','https://user:pass@calendar.yandex.ru/export/ics.xml']]){
    const response=await request('/api/integration/connect',{provider,url});assert.equal(response.status,422);
  }
  assert.equal((await status()).state,'manual');
  const connected=await connect('google',googleUrl);assert.equal(connected.connectionMethod,'ical');
  const original=(await events()).find(event=>event.title==='Google fixture event');assert.ok(original);
  // Source-calendar URLs remain separate; platform links are found in other fields.
  state({google:calendar('Google fixture','120000','URL:https://calendar.google.com/calendar/event?eid=controlled-source\r\nLOCATION:https://meet.jit.si/only-location\r\nDESCRIPTION:Other link https://example.org/info\r\n')});
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  const withSource=(await events()).find(event=>event.eventId===original.eventId);
  assert.equal(withSource.sourceUrl,'https://calendar.google.com/calendar/event?eid=controlled-source');
  assert.equal(withSource.ownUrl,'https://meet.jit.si/only-location');
  state({google:calendar('Google fixture','120000','URL:https://meet.jit.si/participation\r\n')});
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  const withMeeting=(await events()).find(event=>event.eventId===original.eventId);
  assert.equal(withMeeting.sourceUrl,'');assert.equal(withMeeting.ownUrl,'https://meet.jit.si/participation');
  state();
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  assert.equal((await events()).filter(event=>event.title==='Google fixture event').length,1);
  const type=(await(await request('/api/types',{name:'Imported fixture type',accessLabel:'Все'})).json()).type;
  const assigned=await request('/api/type-suggestions/resolve',{eventId:original.eventId,typeId:type.id,action:'other'});assert.equal(assigned.status,200);
  const appearance={theme:'ordinary',start:'#FFFFFF',end:'#F9F8F6',accent:'#AF5120',text:'#2B2121',bordered:false};
  const configured=await fetch(base+'/api/events/'+encodeURIComponent(original.id),{method:'PUT',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({accessLabel:'Fixture group',appearance})});assert.equal(configured.status,200);
  state({google:calendar('Google fixture','130000').replaceAll(compact,tomorrow.replaceAll('-',''))});
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  const moved=(await events()).find(event=>event.title==='Google fixture event');assert.equal(moved.eventId,original.eventId);assert.equal(moved.start,'13:00');assert.equal(moved.date,tomorrow);assert.equal(moved.typeId,type.id);assert.equal(moved.access,'Fixture group');assert.equal(moved.appearance.bordered,false);
  checks.push('Google iCal works without OAuth keys, updates without duplicates and preserves event identity/type');
  const lastSync=(await status()).lastSyncAt;
  for(const failure of [{fail:true},{html:true},{google:'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:broken\nEND:VEVENT\nEND:VCALENDAR'},{redirect:'http://127.0.0.1/secret'},{redirect:'https://evil.test/private'}]){
    state(failure);const response=await request('/api/integration',{action:'sync'});assert.equal(response.status,502);const message=await response.text();assert.ok(!message.includes('test-secret'));assert.ok(!message.includes('secret must never leak'));
    assert.equal((await status()).state,'error');assert.equal((await status()).lastSyncAt,lastSync);assert.ok((await events()).some(event=>event.eventId===original.eventId));
  }
  state();assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  checks.push('Invalid URLs, redirects, malformed/HTML feeds and provider errors preserve existing data and hide secrets');
  const block=lines=>'BEGIN:VEVENT\r\n'+lines.join('\r\n')+'\r\nEND:VEVENT\r\n';
  const recurring='BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+
    block(['UID:weekly','SUMMARY:Weekly','DTSTART;TZID=Europe/Moscow:20261116T100000','DTEND;TZID=Europe/Moscow:20261116T110000','RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO','EXDATE;TZID=Europe/Moscow:20261123T100000'])+
    block(['UID:weekly','SUMMARY:Moved release','RECURRENCE-ID;TZID=Europe/Moscow:20261130T100000','DTSTART;TZID=Europe/Moscow:20261201T120000','DTEND;TZID=Europe/Moscow:20261201T130000'])+
    block(['UID:weekly','SUMMARY:Cancelled release','RECURRENCE-ID;TZID=Europe/Moscow:20261207T100000','STATUS:CANCELLED'])+
    block(['UID:monthly','SUMMARY:Last Friday','DTSTART;TZID=Europe/Moscow:20261127T100000','DTEND;TZID=Europe/Moscow:20261127T110000','RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=FR;BYSETPOS=-1'])+
    block(['UID:dst','SUMMARY:DST','DTSTART;TZID=Europe/Berlin:20270321T100000','DTEND;TZID=Europe/Berlin:20270321T110000','RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=SU'])+
    block(['UID:allday','SUMMARY:All day','DTSTART;VALUE=DATE:20261202','DTEND;VALUE=DATE:20261203'])+'END:VCALENDAR';
  state({google:recurring});await connect('google',googleUrl.replace('/fixture/','/recurring/'));
  const releases=(await(await request('/api/events?from=2026-11-01&to=2027-11-01')).json()).events;
  assert.equal(releases.filter(event=>event.title==='Weekly').length,1);
  assert.equal(releases.find(event=>event.title==='Moved release').date,'2026-12-01');
  assert.equal(releases.filter(event=>event.title==='Cancelled release').length,0);
  assert.deepEqual(releases.filter(event=>event.title==='Last Friday').map(event=>event.date),['2026-11-27','2026-12-25','2027-01-29']);
  assert.deepEqual(releases.filter(event=>event.title==='DST').map(event=>event.start),['12:00','11:00']);
  const movedRelease=releases.find(event=>event.title==='Moved release');
  state({google:recurring.replace('20261201T120000','20261202T120000').replace('20261201T130000','20261202T130000')});
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  const afterMove=(await(await request('/api/events?from=2026-11-01&to=2027-11-01')).json()).events.find(event=>event.title==='Moved release');
  assert.equal(afterMove.eventId,movedRelease.eventId);assert.equal(afterMove.date,'2026-12-02');
  checks.push('Weekly/monthly repeats, exclusions, cancellations, moved-release identity, all-day events and DST conversion are checked');
  state();await connect('google',googleUrl);
  state({fail:true});assert.equal((await request('/api/integration/connect',{provider:'yandex',url:yandexUrl})).status,502);assert.equal((await status()).provider,'google');
  state();await connect('yandex',yandexUrl);assert.equal((await status()).provider,'yandex');
  assert.equal((await events()).filter(event=>/fixture event/.test(event.title)).length,2);
  // Same UID from different feeds must be independent. Empty new feed cannot cancel Google events.
  state({yandex:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'});assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  assert.ok((await events()).some(event=>event.title==='Google fixture event'));
  state();await stop();await start();assert.equal((await status()).state,'manual');
  assert.ok(!(await events()).some(event=>/fixture event/.test(event.title)));
  await connect('yandex',yandexUrl);
  assert.equal((await request('/api/integration',{action:'sync'})).status,200);
  assert.equal((await events()).filter(event=>event.title==='Yandex fixture event').length,1);
  for(const route of ['/api/integration','/api/calendar','/api/events']){const text=await(await request(route)).text();assert.ok(!text.includes('test-secret'));assert.ok(!text.includes('private_token'));}
  const db=new Database(path.join(directory,'db/calendar.sqlite'),{readonly:true});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM external_sources').get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE source != 'manual'").get().n,0);db.close();
  checks.push('Yandex iCal works without credentials; private sources never reach the shared database, reset after restart and hide URLs');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const [provider,label,url] of [['google','Google Календарь',googleUrl],['yandex','Яндекс Календарь',yandexUrl]]){
      await page.goto(base+'/admin?screen=connect');
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator('#yandex-password')).toHaveCount(0);
      await page.getByLabel('Ссылка iCal',{exact:true}).fill(url);
      await page.getByRole('button',{name:'Подключить',exact:true}).click();
      await expect(page.locator('.integration-content')).toHaveAttribute('data-state','connected');
      await expect(page.locator('.integration-details')).toContainText(label);
      await expect(page.locator('#integration-link')).toBeDisabled();
      await page.getByRole('button',{name:'Обновить сейчас',exact:true}).click();
      await expect(page.locator('.integration-content')).toHaveAttribute('data-state','connected');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(directory,`${provider}-${width}.png`),fullPage:true});
      await page.getByRole('button',{name:'Отключить календарь',exact:true}).click();
      await expect(page.locator('.integration-content')).toHaveAttribute('data-state','disconnected');
      assert.equal(await page.evaluate(async()=>{const {events}=await(await fetch('/api/events')).json();return events.filter(event=>event.source!=='manual').length;}),0);
      await page.getByRole('button',{name:'Подключить календарь',exact:true}).click();
      await page.getByRole('button',{name:label,exact:true}).click();
      await page.getByLabel('Ссылка iCal',{exact:true}).fill(url);
      await page.getByRole('button',{name:'Подключить',exact:true}).click();
      await expect(page.locator('.integration-content')).toHaveAttribute('data-state','connected');
      await page.reload();await expect(page.locator('.integration-content')).toHaveAttribute('data-state','disconnected');
    }
  }
  assert.deepEqual(errors,[]);checks.push('Browser connects both providers, syncs and disconnects; reload clears the source at 1440/390/320');
  const contextA=await browser.newContext(),contextB=await browser.newContext();
  const a=await contextA.newPage(),b=await contextB.newPage();
  for(const p of [a,b])p.on('pageerror',error=>errors.push(error.message));
  await a.goto(base+'/admin?screen=connect');
  state({google:calendar('Private reviewer A')});
  await a.getByLabel('Ссылка iCal',{exact:true}).fill(googleUrl);
  await a.getByRole('button',{name:'Подключить',exact:true}).click();
  await expect(a.locator('.integration-content')).toHaveAttribute('data-state','connected');
  const manual=await contextA.request.post(base+'/api/events',{headers:{Origin:base},data:{title:'Manual work A',date,start:'16:00',end:'17:00'}});assert.equal(manual.status(),200);
  await b.goto(base+'/admin?screen=connect');
  state({google:calendar('Private reviewer B')});
  await b.getByLabel('Ссылка iCal',{exact:true}).fill(googleUrl.replace('/fixture/','/reviewer-b/'));
  await b.getByRole('button',{name:'Подключить',exact:true}).click();
  await expect(b.locator('.integration-content')).toHaveAttribute('data-state','connected');
  const aEvents=await(await contextA.request.get(base+'/api/events')).text();
  const bEvents=await(await contextB.request.get(base+'/api/events')).text();
  assert.ok(aEvents.includes('Private reviewer A'));assert.ok(!aEvents.includes('Private reviewer B'));
  assert.ok(bEvents.includes('Private reviewer B'));assert.ok(!bEvents.includes('Private reviewer A'));assert.ok(!bEvents.includes('Manual work A'));
  const stranger=createDemoClient(base);
  for(const route of ['/admin','/api/events','/api/calendar','/api/integration','/api/analytics/releases']){
    const data=await(await stranger.fetch(base+route)).text();assert.ok(!data.includes('Private reviewer A'));assert.ok(!data.includes('Private reviewer B'));assert.ok(!data.includes('Legacy private fixture'));
  }
  const publicA=await contextA.newPage();await publicA.goto(base+'/calendar');
  await expect(publicA.locator('.uc-caption').filter({hasText:'Private reviewer A event'})).toBeVisible();
  await publicA.reload();
  await expect(publicA.locator('.uc-caption').filter({hasText:'Private reviewer A event'})).toHaveCount(0);
  const cleared=await(await contextA.request.get(base+'/api/integration')).json();assert.equal(cleared.integration.state,'manual');
  const afterReset=await(await contextA.request.get(base+'/api/events')).text();assert.ok(!afterReset.includes('Private reviewer A'));assert.ok(afterReset.includes('Manual work A'));
  state({google:calendar('Late private import'),delayMarker:'connect'});
  const lateConnection=contextA.request.post(base+'/api/integration/connect',{headers:{Origin:base},data:{provider:'google',url:googleUrl}});
  for(let i=0;i<50&&!existsSync(path.join(directory,'request-connect.txt'));i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(existsSync(path.join(directory,'request-connect.txt')));
  assert.equal((await contextA.request.post(base+'/api/demo/reset',{headers:{Origin:base},data:{}})).status(),200);
  assert.equal((await lateConnection).status(),409);
  assert.equal((await(await contextA.request.get(base+'/api/integration')).json()).integration.state,'manual');
  assert.ok(!(await(await contextA.request.get(base+'/api/events')).text()).includes('Late private import'));
  state();
  assert.ok((await(await contextB.request.get(base+'/api/events')).text()).includes('Private reviewer B'));
  const cross=await contextB.request.post(base+'/api/demo/reset',{headers:{Origin:'https://attacker.example'},data:{}});assert.equal(cross.status(),403);
  assert.equal((await(await contextB.request.get(base+'/api/integration')).json()).integration.state,'connected');
  await b.reload();await expect(b.locator('.integration-content')).toHaveAttribute('data-state','disconnected');
  assert.ok(!(await(await contextB.request.get(base+'/api/events')).text()).includes('Private reviewer B'));
  const finalDb=new Database(path.join(directory,'db/calendar.sqlite'),{readonly:true});assert.equal(finalDb.prepare("SELECT COUNT(*) AS n FROM events WHERE source != 'manual'").get().n,0);assert.equal(finalDb.prepare('SELECT COUNT(*) AS n FROM external_sources').get().n,0);finalDb.close();
  await contextA.close();await contextB.close();
  assert.deepEqual(errors,[]);
  checks.push('Separate browser contexts and anonymous visitors never see each other’s imports; admin/calendar reload clears imports and credentials, retains manual work, leaves the other reviewer intact and rejects cross-origin reset');
  const report={checks,errors,realAccountsVerified:false};writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,...report},null,2));
}finally{if(browser)await browser.close();await stop();}
