// Write-back to Google Calendar against a controlled Google (iCal feed, OAuth token endpoint and Calendar API).
// The token endpoint verifies the service-account JWT signature; nothing reaches the real Google.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';

mkdirSync('artifacts',{recursive:true});const directory=mkdtempSync(path.resolve('artifacts/google-write-'));
const config=JSON.parse(readFileSync('config/community-calendar.json','utf8'));
const calendarId=decodeURIComponent(config.url.match(/\/calendar\/ical\/([^/]+)\//)[1]);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const keyFile=path.join(directory,'service-account.json');
writeFileSync(keyFile,JSON.stringify({type:'service_account',client_email:'calendar-writer@test.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'}));
const files={feed:path.join(directory,'feed.ics'),state:path.join(directory,'state.json'),log:path.join(directory,'log.json'),pub:path.join(directory,'public.pem')};
writeFileSync(files.pub,publicKey.export({type:'spki',format:'pem'}));writeFileSync(files.log,'[]');
const event=(lines)=>`BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;
const recurring=(summary='Повтор')=>event(['UID:rec1@google.com',`SUMMARY:${summary}`,'DTSTART;VALUE=DATE:20261203','DTEND;VALUE=DATE:20261204','RRULE:FREQ=WEEKLY;COUNT=3']);
const single=event(['UID:one1@google.com','SUMMARY:Разовое','DTSTART:20261205T150000Z','DTEND:20261205T160000Z']);
const feed=(...items)=>writeFileSync(files.feed,`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${items.join('')}END:VCALENDAR`);
const state=(deny=false)=>writeFileSync(files.state,JSON.stringify({calendarId,deny,
  items:[{id:'rec1',iCalUID:'rec1@google.com',recurrence:['RRULE:FREQ=WEEKLY;COUNT=3'],start:{date:'2026-12-03'},end:{date:'2026-12-04'}},{id:'one1',iCalUID:'one1@google.com',start:{dateTime:'2026-12-05T18:00:00+03:00'},end:{dateTime:'2026-12-05T19:00:00+03:00'}}],
  instances:{rec1:['2026-12-03','2026-12-10','2026-12-17'].map(d=>({id:'rec1_'+d.replaceAll('-',''),recurringEventId:'rec1',originalStartTime:{date:d},start:{date:d},end:{date:d}}))}}));
feed(recurring(),single);state();
const preload=path.join(directory,'google-mock.mjs');
writeFileSync(preload,`import {readFileSync,writeFileSync} from 'node:fs';import {createVerify} from 'node:crypto';
const F=${JSON.stringify(files)};const original=fetch;
const log=entry=>{const all=JSON.parse(readFileSync(F.log,'utf8'));all.push(entry);writeFileSync(F.log,JSON.stringify(all));};
const json=(status,body)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}));
globalThis.fetch=async(input,init={})=>{const url=String(input);
 if(url.startsWith('https://calendar.google.com/'))return new Response(readFileSync(F.feed,'utf8'),{headers:{'content-type':'text/calendar'}});
 if(url==='https://oauth2.googleapis.com/token'){const assertion=new URLSearchParams(String(init.body)).get('assertion');const [h,p,s]=assertion.split('.');
  const ok=createVerify('RSA-SHA256').update(h+'.'+p).verify(readFileSync(F.pub,'utf8'),Buffer.from(s,'base64url'));const claims=JSON.parse(Buffer.from(p,'base64url'));
  log({kind:'token',ok,scope:claims.scope,iss:claims.iss});return ok?json(200,{access_token:'test-token',expires_in:3600}):json(400,{error:'invalid_grant'});}
 if(url.startsWith('https://www.googleapis.com/calendar/v3/')){const st=JSON.parse(readFileSync(F.state,'utf8'));const u=new URL(url);
  if(new Headers(init.headers).get('authorization')!=='Bearer test-token')return json(401,{});
  const parts=u.pathname.split('/').map(decodeURIComponent);if(parts[4]!==st.calendarId)return json(404,{});
  const method=init.method??'GET';
  if(method==='GET'&&parts.length===6)return json(200,{items:st.items.filter(i=>i.iCalUID===u.searchParams.get('iCalUID'))});
  if(method==='GET'&&parts[7]==='instances')return json(200,{items:st.instances[parts[6]]??[]});
  if(method==='PATCH'){log({kind:'patch',id:parts[6],body:JSON.parse(init.body),query:u.search});return st.deny?json(403,{}):json(200,{id:parts[6]});}
  return json(400,{});}
 return original(input,init);};`);
const freePort=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;};
const token='w'.repeat(40);
async function start(extra){const port=await freePort();const base=`http://127.0.0.1:${port}`;
 const clean={...process.env};for(const k of Object.keys(clean))if(/^(CALENDAR_|GOOGLE_)/.test(k))delete clean[k];
 const server=spawn(process.execPath,['--import',pathToFileURL(preload).href,'scripts/render-start.mjs'],{windowsHide:true,stdio:'ignore',env:{...clean,HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,GOOGLE_SERVICE_ACCOUNT_FILE:keyFile,CALENDAR_DATABASE_PATH:path.join(directory,`db-${port}.sqlite`),...extra}});
 for(let i=0;i<150;i++){try{if((await fetch(base+'/calendar')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 return {base,server};}
const checks=[];let browser,run;
try{
 run=await start({CALENDAR_ADMIN_OPEN:'0'});const {base}=run;
 const H={Origin:base,'Content-Type':'application/json',Authorization:`Bearer ${token}`};
 const call=async(route,body,method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,headers:H,body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json().catch(()=>({}))};};
 const api=async(...a)=>{const r=await call(...a);assert.equal(r.status,200,JSON.stringify(r.json));return r.json;};
 const range='?from=2026-12-01&to=2026-12-31';
 const admin=async()=>(await api('/api/events'+range)).events.filter(e=>['google'].includes(e.source));
 const pub=async()=>(await api('/api/calendar'+range)).events;
 const patches=()=>JSON.parse(readFileSync(files.log,'utf8')).filter(e=>e.kind==='patch');
 await api('/api/integration',{action:'sync'});
 const status=(await api('/api/integration')).integration.googleWrite;
 assert.deepEqual(status,{enabled:true,reason:null});checks.push(`write-back enabled with closed admin; calendar id derived from the iCal URL (${calendarId.slice(0,6)}…)`);
 let rows=await admin();const rel=d=>rows.find(e=>e.title.startsWith('Повтор')&&e.date===d);
 assert.ok(rel('2026-12-03')&&rel('2026-12-10')&&rel('2026-12-17'),JSON.stringify(rows.map(e=>[e.title,e.date])));
 // 1. one release of a recurring all-day event: title + time
 await api('/api/events/'+encodeURIComponent(rel('2026-12-10').id),{scope:'occurrence',changes:{title:'Новое название',start:'19:00',end:'20:30'}},'PUT');
 let p=patches().at(-1);assert.equal(p.id,'rec1_20261210');assert.match(p.query,/sendUpdates=none/);
 assert.deepEqual(p.body,{summary:'Новое название',start:{dateTime:'2026-12-10T19:00:00',timeZone:'Europe/Moscow'},end:{dateTime:'2026-12-10T20:30:00',timeZone:'Europe/Moscow'}});
 let shown=(await pub()).find(e=>e.title==='Новое название');assert.equal(shown?.date,'2026-12-10');assert.equal(shown.start,'19:00');assert.equal(shown.end,'20:30');
 assert.ok((await pub()).some(e=>e.title==='Повтор'&&e.date==='2026-12-03'));
 checks.push('release edit: PATCH of the right Google instance (title, time, Europe/Moscow), shown at once in the calendar, other releases unchanged');
 assert.ok(JSON.parse(readFileSync(files.log,'utf8')).some(e=>e.kind==='token'&&e.ok&&e.scope==='https://www.googleapis.com/auth/calendar.events'&&e.iss==='calendar-writer@test.iam.gserviceaccount.com'));
 checks.push('service-account JWT signature verified by the token endpoint, scope calendar.events');
 // 2. Google iCal still stale -> the edit survives a sync
 await api('/api/integration',{action:'sync'});shown=(await pub()).find(e=>e.date==='2026-12-10'&&e.title!=='Разовое');assert.equal(shown.title,'Новое название');assert.equal(shown.start,'19:00');
 checks.push('stale iCal after the write does not roll the edit back');
 // 3. feed catches up, later Google-side changes flow in again
 feed(recurring(),event(['UID:rec1@google.com','RECURRENCE-ID;VALUE=DATE:20261210','SUMMARY:Новое название','DTSTART:20261210T160000Z','DTEND:20261210T173000Z']),single);
 await api('/api/integration',{action:'sync'});
 feed(recurring(),event(['UID:rec1@google.com','RECURRENCE-ID;VALUE=DATE:20261210','SUMMARY:Изменено в Google','DTSTART:20261210T160000Z','DTEND:20261210T173000Z']),single);
 await api('/api/integration',{action:'sync'});assert.ok((await pub()).some(e=>e.title==='Изменено в Google'&&e.date==='2026-12-10'));
 checks.push('once the feed shows the edit, later changes made in Google appear again');
 // 4. single timed event: link + description
 rows=await admin();const one=rows.find(e=>e.title==='Разовое');
 await api('/api/events/'+encodeURIComponent(one.id),{scope:'occurrence',changes:{url:'https://example.org/meet',description:'Описание из админки'}},'PUT');
 p=patches().at(-1);assert.equal(p.id,'one1');assert.deepEqual(p.body,{description:'Описание из админки',location:'https://example.org/meet'});
 assert.equal((await pub()).find(e=>e.title==='Разовое').description,'Описание из админки');
 checks.push('single event: description and link written (link as Google location)');
 // 5. mixed edit: Google field + app setting in one save
 await api('/api/events/'+encodeURIComponent(rel('2026-12-03').id),{scope:'occurrence',changes:{title:'Смешанное',points:5}},'PUT');
 p=patches().at(-1);assert.deepEqual([p.id,p.body],['rec1_20261203',{summary:'Смешанное'}]);
 shown=(await pub()).find(e=>e.title==='Смешанное');assert.equal(shown.points,5);
 checks.push('mixed save: title goes to Google, points stay in the app');
 // 6. all-day move keeps it all-day
 await api('/api/events/'+encodeURIComponent(rel('2026-12-17').id),{scope:'occurrence',changes:{date:'2026-12-18'}},'PUT');
 p=patches().at(-1);assert.deepEqual([p.id,p.body],['rec1_20261217',{start:{date:'2026-12-18'},end:{date:'2026-12-19'}}]);
 assert.ok((await pub()).some(e=>e.date==='2026-12-18'&&e.allDay),'moved all-day release');
 checks.push('all-day release moved to another date stays all-day in Google and in the calendar');
 // 7. whole series: title to the master event; time changes refused
 await api('/api/events/'+encodeURIComponent(rel('2026-12-03').id),{scope:'series',changes:{title:'Серия целиком'}},'PUT');
 p=patches().at(-1);assert.deepEqual([p.id,p.body],['rec1',{summary:'Серия целиком'}]);
 assert.equal((await admin()).filter(e=>e.title==='Серия целиком').length,3);
 const seriesTime=await call('/api/events/'+encodeURIComponent(rel('2026-12-03').id),{scope:'series',changes:{start:'10:00',end:'11:00'}},'PUT');assert.equal(seriesTime.status,422);
 checks.push('series edit patches the master event and renames all releases; series time change is refused');
 // 8. Google refuses: nothing changes locally
 state(true);const before=(await pub()).find(e=>e.title==='Разовое').title;
 const denied=await call('/api/events/'+encodeURIComponent(one.id),{scope:'occurrence',changes:{title:'Не сохранится'}},'PUT');
 assert.equal(denied.status,403);assert.match(denied.json.message,/Вносить изменения в мероприятия/);assert.equal((await pub()).find(e=>e.id===one.id).title,before);state(false);
 checks.push('without edit rights Google returns 403: clear message, local event unchanged');
 // 9. editor unlocks Google-owned fields and explains where they go
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await (await browser.newContext({extraHTTPHeaders:{Authorization:`Bearer ${token}`}})).newPage();
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/admin');
 await page.locator('.event-group-card',{hasText:'Разовое'}).getByRole('button',{name:'Редактировать'}).click();
 await expect(page.locator('#event-name')).toBeEnabled();await expect(page.locator('.editor-panel')).toContainText('сохранятся в Google Календаре');
 checks.push('admin editor: Google-owned fields editable, note says they are saved to Google');
 run.server.kill();
 // 10. open admin: write-back stays off
 run=await start({CALENDAR_ADMIN_OPEN:'1'});const open=run.base;
 const st=(await (await fetch(open+'/api/integration')).json()).integration.googleWrite;assert.equal(st.enabled,false);assert.match(st.reason,/CALENDAR_ADMIN_OPEN=0/);
 const openRows=(await (await fetch(open+'/api/events'+range)).json()).events;const target=openRows.find(e=>e.source==='google');
 const r=await fetch(open+'/api/events/'+encodeURIComponent(target.id),{method:'PUT',headers:{Origin:open,'Content-Type':'application/json'},body:JSON.stringify({scope:'occurrence',changes:{title:'Нельзя'}})});
 assert.equal(r.status,409);
 checks.push('with the admin open, write-back is disabled and Google-owned edits are refused');
 console.log(JSON.stringify({directory,checks},null,1));
}catch(error){console.error(error);process.exitCode=1;console.log(JSON.stringify({directory,checks},null,1));}
finally{await browser?.close();run?.server.kill();}
