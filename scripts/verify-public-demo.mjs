import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createDemoClient } from './demo-client.mjs';

mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/public-demo-'));
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`, protectedDatabase=path.join(directory,'private.sqlite');
const client=createDemoClient(base);globalThis.fetch=client.fetch;
writeFileSync(protectedDatabase,'private database must never be opened');
// Exercise the exact Render launcher, including default public-demo activation
// and seeding, while deliberately providing an unusable private database path.
const server=spawn(process.execPath,['scripts/render-start.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_DEMO_REMOTE:'1',CALENDAR_PUBLIC_DEMO:'1',CALENDAR_EXPERIMENT:'',CALENDAR_EXPERIMENT_TOKEN:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',CALENDAR_DATABASE_PATH:protectedDatabase,CALENDAR_PUBLIC_DEMO_DIRECTORY:path.join(directory,'public')},stdio:'ignore'});
const checks=[],errors=[];let browser;
async function request(route,body,method='POST',origin=base){return fetch(base+route,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/calendar')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal((await fetch(base+'/admin')).status,200);
  assert.equal((await fetch(base+'/api/types')).status,200);
  assert.equal((await request('/api/types',{name:'forged'},'POST','https://attacker.example')).status,403);
  for(const [route,body,status] of [['/api/integration/connect',{provider:'google'},422],['/api/integration/connect',{provider:'yandex'},422],['/api/integration',{action:'sync'},409],['/api/integration',{action:'disconnect'},200]])assert.equal((await request(route,body)).status,status);
  assert.equal((await fetch(base+'/api/integration/google/callback?error=access_denied',{redirect:'manual'})).status,302);
  assert.equal((await request('/api/integration',{action:'manual'})).status,200);
  assert.equal(readFileSync(protectedDatabase,'utf8'),'private database must never be opened');
  checks.push('Anonymous admin uses an isolated demo DB; real integration routes are available with provider validation; cross-origin writes stay blocked');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addCookies([{name:'calendar_demo_session',value:client.cookie.split('=')[1],url:base}]);
  const admin=await context.newPage(), user=await context.newPage();
  for(const page of [admin,user])page.on('pageerror',error=>errors.push(error.message));
  await admin.goto(base+'/admin');await expect(admin.locator('.public-demo-notice')).toHaveCount(0);
  await admin.getByRole('button',{name:'Редактировать Конгресс',exact:true}).last().click();
  await admin.getByLabel('Ссылка на площадку',{exact:true}).fill('https://example.org/review');
  await admin.locator('.type-editor').getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(admin.locator('.type-editor')).toHaveCount(0);
  const data=await (await fetch(base+'/api/calendar')).json();
  assert.equal('previewAllowed' in data,false);assert.equal(data.demoLoginAllowed,true);assert.equal(data.account,null);
  const inherited=data.events.filter(e=>e.id.startsWith('demo-congress-series@')||e.id.startsWith('demo-congress-sunday@'));
  assert.ok(inherited.length>0);
  assert.ok(inherited.every(e=>e.url==='https://example.org/review'));
  await user.goto(base+'/calendar');await expect(user.locator('.uc-caption').first()).toBeVisible();
  const date = new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Europe/Moscow'}).format(new Date())+'-15';
  const accessCases=[];
  for(const [index,degree] of [null,'I','II','III'].entries()){
    const title='Проверка градуса '+(degree??'Все');
    const typeResponse=await request('/api/types',{name:title,accessLabel:'Все',degree,venueUrl:'https://example.org/degree'});
    const type=(await typeResponse.json()).type;
    const created=await request('/api/events',{title,typeId:type.id,date,start:'00:0'+index,end:'01:00'});
    accessCases.push({degree,id:(await created.json()).event.id,title});
  }
  const restrictedType=(await (await request('/api/types',{name:'Проверка группы',accessLabel:'Закрытая группа',degree:'I',venueUrl:'https://example.org/group'})).json()).type;
  const restricted=(await (await request('/api/events',{title:'Проверка группы',typeId:restrictedType.id,date,start:'00:05',end:'01:00'})).json()).event;
  await user.reload();
  await expect(user.locator('.uc-degree-preview')).toHaveCount(0);
  await expect(user.getByRole('button',{name:'Войти через Telegram',exact:true})).toBeVisible();
  const initialTotal=data.events.length+5;
  const guestData=await (await fetch(base+'/api/calendar')).json();
  assert.equal(guestData.events.length,initialTotal);
  assert.ok(guestData.events.some(event=>event.typeName==='Конгресс'));
  assert.ok(guestData.events.filter(event=>event.typeName==='Конгресс').every(event=>event.canFollow));
  assert.ok(guestData.events.filter(event=>event.typeName!=='Конгресс').every(event=>!event.canFollow));
  for(const item of accessCases)assert.equal(guestData.events.find(event=>event.id===item.id).canFollow,false);
  assert.equal(guestData.events.find(event=>event.id===restricted.id).canFollow,false);
  await user.locator('.uc-caption').and(user.getByRole('button',{name:'Открыть Проверка градуса Все',exact:true})).click();
  const selectedDay=user.locator('.uc-day.uc-selected');
  for(let index=0;index<4;index++)await selectedDay.getByRole('button',{name:'Следующее событие',exact:true}).click();
  await expect(user.locator('.uc-card-name')).toHaveText('Проверка группы');
  await expect(user.locator('.uc-card-btn')).toBeDisabled();
  checks.push('Demo guest sees every event but can follow only Congress, including when another event has open access');

  await user.getByRole('button',{name:'Войти через Telegram',exact:true}).click();
  await expect(user.locator('.uc-account')).toContainText('@nickname');
  await expect(user.locator('.uc-degree')).toHaveText('Градус II');
  await expect(user.locator('.uc-card-btn')).toBeEnabled();
  const memberData=await (await fetch(base+'/api/calendar?demoMember=1')).json();
  assert.equal(memberData.events.length,initialTotal);
  assert.ok(memberData.events.filter(event=>event.url).every(event=>event.canFollow));
  for(const item of accessCases)assert.equal(memberData.events.find(event=>event.id===item.id).canFollow,true);
  assert.equal(memberData.events.find(event=>event.id===restricted.id).canFollow,true);
  await context.route('https://example.org/**',route=>route.fulfill({status:200,body:'verified'}));
  const popupPromise=context.waitForEvent('page');
  await user.locator('.uc-card-btn').click();
  const popup=await popupPromise;await popup.waitForURL('https://example.org/group');await popup.close();
  for(const width of [1440,390,320]){
    await user.setViewportSize({width,height:1100});
    if(await user.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) {
      await user.screenshot({path:path.join(directory,`overflow-${width}.png`),fullPage:true,animations:'disabled'});
      console.log('Overflow',width,await user.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,class:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(el=>el.right>innerWidth+1||el.left< -1)));
    }
    assert.equal(await user.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await user.screenshot({path:path.join(directory,'user-calendar.png'),fullPage:true,animations:'disabled'});
  await user.getByRole('button',{name:'Выйти из просмотра',exact:true}).click();
  await expect(user.locator('.uc-account')).toHaveCount(0);
  await expect(user.locator('.uc-card-btn')).toBeDisabled();
  checks.push('Demo login grants every linked event on the server, keeps the open card in sync and logout restores guest restrictions at 1440/390/320');
  const cookies=await context.cookies();assert.equal(cookies.some(cookie=>cookie.name==='calendar_experiment'),false);
  await admin.screenshot({path:path.join(directory,'admin-without-login.png'),fullPage:true,animations:'disabled'});
  checks.push('A clean browser edits a type without a login cookie; the user calendar receives the same changes');
  assert.deepEqual(errors,[]);
  const report={recordedAt:new Date().toISOString(),checks,errors};writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,...report},null,2));
}finally{if(browser)await browser.close();server.kill();}
