import assert from 'node:assert/strict';
import {chromium, firefox, webkit, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {seedDemo} from './seed.mjs';

// Own process and database only. Never accepts a remote target.
mkdirSync('artifacts', {recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/handoff-'));
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(r=>socket.close(r));
const base=`http://127.0.0.1:${port}`, token=randomBytes(32).toString('hex');
const database=path.join(directory,'test.sqlite');seedDemo(database);
const server=spawn(process.execPath,['dist/server/entry.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),CALENDAR_DATABASE_PATH:database,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_SHARED_CALENDAR:'0',CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_SYNC_INTERVAL_MS:'0'}});
let logs='', browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const checks=[], unavailable=[];
async function check(name, action){await action();checks.push(name);console.log('PASS '+name);}
try {
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
 async function api(route,body){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(response.status,200,await response.clone().text());return response.json();}
 const privateType=(await api('/api/types',{name:'Handoff restricted',accessLabel:'Все',degree:'II'})).type;
 const secret='https://meet.example.org/private-handoff-link';
 const privateEvent=(await api('/api/events',{title:'Handoff restricted',date,start:'11:00',end:'12:00',typeId:privateType.id,url:secret,description:'Private '+secret})).event;
 await check('production API and ICS reject forged participant/demo URL credentials and redact closed links',async()=>{
  for(const query of ['', '&participant=700001','&participant=demo-participant-2&demoMember=1','&telegramId=700001&degree=III']){
   const response=await fetch(base+`/api/calendar?from=${date}&to=${date}${query}`),data=await response.json();
   const item=data.events.find(e=>e.id===privateEvent.id);assert.ok(item);assert.equal(item.canFollow,false);assert.equal(item.url,'');assert.equal(item.calendarUrl,'');assert.ok(!JSON.stringify(item).includes(secret));
   assert.equal((await fetch(base+`/api/calendar/events/${privateEvent.id}.ics?${query.slice(1)}`)).status,403);
  }
  const allowed=await fetch(base+`/api/calendar/events/${privateEvent.id}.ics?participant=700001`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(allowed.status,200);assert.match(await allowed.text(),/BEGIN:VCALENDAR/);
  for(const route of ['/api/types','/api/events','/api/integration'])assert.equal((await fetch(base+route)).status,401);
 });
 for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
  try {browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true,timeout:12000}:{headless:true,timeout:12000});}
  catch(error){unavailable.push({engine,reason:error.message.split('\n')[0]});continue;}
  const context=await browser.newContext({reducedMotion:'reduce'}), page=await context.newPage();
  const errors=[],resourceErrors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('response',response=>{if(response.status()>=400&&!new URL(response.url()).pathname.startsWith('/api/'))resourceErrors.push(`${response.status()} ${response.url()}`);});
  await check(`${engine}: malformed successful calendar responses retain a usable page and retry`,async()=>{
   for(const value of [{},null,{events:null},{events:[null]},{events:[{id:'broken'}]}]){
    await page.route('**/api/calendar?**',route=>route.fulfill({json:value}));
    await page.goto(base+'/calendar');
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
    assert.deepEqual(errors,[]);
    assert.deepEqual(resourceErrors,[]);
    await page.unroute('**/api/calendar?**');
   }
   await page.getByRole('button',{name:'Повторить',exact:true}).click();
   await expect(page.locator('.uc-result[role=status]')).toHaveCount(0);
   await expect(page.locator('.uc-caption:visible,.uc-date-button:visible').first()).toBeVisible();
  });
  await check(`${engine}: offline, 500 and invalid JSON recover without losing calendar state`,async()=>{
   for(const mode of ['offline','server','json']){
    await page.route('**/api/calendar?**',route=>mode==='offline'?route.abort('internetdisconnected'):route.fulfill({status:mode==='server'?500:200,contentType:'application/json',body:mode==='server'?'{}':'broken JSON'}));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
    await page.unroute('**/api/calendar?**');await page.getByRole('button',{name:'Повторить',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
   }
   assert.deepEqual(errors,[]);
  });
  await check(`${engine}: rapid month changes ignore late responses across the year boundary`,async()=>{
   await page.route('**/api/calendar?**',async route=>{const from=new URL(route.request().url()).searchParams.get('from');await new Promise(r=>setTimeout(r,from?.includes('-11-')?250:30));await route.continue();});
   const initial=await page.locator('.uc-month').textContent();
   for(let n=0;n<3;n++)await page.getByRole('button',{name:'Следующий месяц',exact:true}).click();
   await expect(page.locator('.uc-month')).not.toHaveText(initial);
   for(let n=0;n<3;n++)await page.getByRole('button',{name:'Предыдущий месяц',exact:true}).click();
   await expect(page.locator('.uc-month')).toHaveText(initial);await expect(page.locator('.uc-result[role=status]')).toHaveCount(0);
   await page.unroute('**/api/calendar?**');assert.deepEqual(errors,[]);
  });
  for(const [width,height] of [[320,650],[360,740],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080],[320,320],[844,390]]){
   await check(`${engine}: ${width}x${height} calendar, card, resources and admin`,async()=>{
    await page.setViewportSize({width,height});await page.goto(base+'/calendar');
    await expect(page.locator('.uc-caption:visible,.uc-date-button:visible').first()).toBeVisible();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)),[]);
    const trigger=page.locator(width<700?'.uc-date-button':'.uc-caption').first();
    await trigger.click();await expect(page.locator('.uc-card')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.locator('.uc-card')).toHaveCount(0);
    assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    const login=await context.request.post(base+'/api/local-session',{headers:{Origin:base},data:{token}});assert.equal(login.status(),200);
    for(const screen of ['calendar','manual','access','type-new','event-new','participants']){
     await page.goto(base+'/admin?screen='+screen);
     await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
     await page.waitForFunction(()=>!document.querySelector('astro-island')?.hasAttribute('ssr'));
     await page.waitForLoadState('networkidle');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({c:e.className,tag:e.tagName,html:e.outerHTML.slice(0,180),r:e.getBoundingClientRect().right})).slice(0,15)}))));
    }
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(directory,`${engine}-${width}-${height}.png`)});
   });
  }
  await context.close();await browser.close();browser=null;
 }
 assert.ok(checks.length,'No browser ran');
} finally {
 await browser?.close();if(server.exitCode===null){const closed=once(server,'exit');server.kill();await closed;}
 writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,unavailable},null,2));
 console.log(JSON.stringify({directory,checks:checks.length,unavailable}));
}
