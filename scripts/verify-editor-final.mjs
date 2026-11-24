import assert from 'node:assert/strict';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {seedDemo} from './seed.mjs';
mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/editor-final-')),database=path.join(directory,'test.sqlite');seedDemo(database);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const base=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex'),checks=[];
const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),CALENDAR_DATABASE_PATH:database,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_SHARED_CALENDAR:'0',CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_SYNC_INTERVAL_MS:'0'};
let server,browser,logs='';
async function start(){server=spawn(process.execPath,['dist/server/entry.mjs'],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);for(let n=0;n<100;n++){try{if((await fetch(base)).ok)return;}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}throw Error(logs);}
async function stop(){if(server?.exitCode===null){const done=once(server,'exit');server.kill();await done;}}
async function api(route,body,method=body?'POST':'GET',status=200,auth=true){const response=await fetch(base+route,{method,headers:{...(auth?{Authorization:`Bearer ${token}`} :{}),Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(response.status,status,await response.clone().text());return response.json();}
try{
 await start();
 await api('/api/covers',undefined,'GET',401,false);await api('/api/covers',{coverPath:'/assets/panel/a5ff5.png'},'DELETE',401,false);
 await api('/api/covers',{coverPath:'../../.env'},'DELETE',422);
 const original='/assets/panel/a5ff5.png';
 await api('/api/covers',{coverPath:original},'DELETE');await api('/api/covers',{coverPath:original},'DELETE');
 assert.ok(!(await api('/api/covers')).covers.some(c=>c.path===original));
 assert.equal((await fetch(base+original)).status,200);
 assert.equal((await api('/api/types')).types.find(t=>t.id==='demo-congress').coverPath,original);
 await stop();await start();assert.ok(!(await api('/api/covers')).covers.some(c=>c.path===original));
 checks.push('Gallery removal requires admin, validates paths, is idempotent, survives restart and preserves assigned artwork');
 for(const [engine,type] of Object.entries({chromium,firefox,webkit})){
  browser=await type.launch({...engine==='chromium'?{channel:'chrome'}:{},timeout:15000});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await context.request.post(base+'/api/local-session',{headers:{Origin:base},data:{token}});
  const response=await context.request.post(base+'/api/covers',{headers:{Origin:base,'Content-Type':'image/png'},data:readFileSync('public/assets/panel/6713c.png')});assert.equal(response.status(),200);const uploaded=(await response.json()).coverPath;
  await page.goto(base+'/admin?screen=type-new');await expect(page.locator('.type-editor')).toBeVisible();
  const name=`Gallery ${engine}`;await page.getByLabel('Название типа',{exact:true}).fill(name);
  await page.getByRole('button',{name:'Настроить оформление',exact:true}).click();
  const editor=page.locator('.appearance-editor');await expect(editor).toBeVisible();
  await expect(editor.getByRole('group',{name:'Как показывать обложку',exact:true})).toHaveCount(0);
  const uploadedOption=editor.locator('.cover-gallery-item').filter({has:page.locator(`img[src="${uploaded}"]`)});
  await expect(uploadedOption).toHaveCount(1);await uploadedOption.locator('.cover-option').click();
  await uploadedOption.getByRole('button',{name:/Удалить из галереи/}).click();await uploadedOption.getByRole('button',{name:'Отмена',exact:true}).click();await expect(uploadedOption).toHaveCount(1);
  await uploadedOption.getByRole('button',{name:/Удалить из галереи/}).click();
  await page.route('**/api/covers',route=>route.request().method()==='DELETE'?route.fulfill({status:503,json:{message:'Тестовая ошибка удаления'}}):route.continue());
  await uploadedOption.getByRole('button',{name:'Удалить',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('Тестовая ошибка');await expect(uploadedOption).toHaveCount(1);
  await page.unroute('**/api/covers');await uploadedOption.getByRole('button',{name:'Удалить',exact:true}).click();await expect(uploadedOption).toHaveCount(0);
  await expect(editor.locator('.preview-cell img')).toHaveAttribute('src',uploaded);
  await editor.locator('.upload-cover').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,`${engine}-gallery-390.png`)});
  await editor.getByRole('button',{name:'Применить',exact:true}).click();
  // Failed save retains the entire draft. A double activation makes one request.
  let saves=0;await page.route('**/api/types',async route=>{if(route.request().method()==='POST'){saves++;await new Promise(r=>setTimeout(r,150));await route.fulfill({status:503,json:{message:'Тестовая ошибка сохранения'}});}else await route.continue();});
  const save=page.locator('.type-editor').getByRole('button',{name:'Сохранить',exact:true});
  await save.evaluate(e=>{e.click();e.click();});await expect(page.locator('.type-editor').getByRole('alert')).toContainText('Тестовая ошибка');assert.equal(saves,1);await expect(page.getByLabel('Название типа',{exact:true})).toHaveValue(name);
  await page.unroute('**/api/types');await save.click();await expect(page.locator('.type-editor')).toHaveCount(0);
  assert.equal((await api('/api/types')).types.find(t=>t.name===name).coverPath,uploaded);
  await page.waitForLoadState('networkidle');await page.reload();await page.getByRole('button',{name:`Редактировать ${name}`,exact:true}).last().click();await page.getByRole('button',{name:'Настроить оформление',exact:true}).click();await expect(editor.locator('.preview-cell img')).toHaveAttribute('src',uploaded);await expect(editor.locator(`.cover-option img[src="${uploaded}"]`)).toHaveCount(0);
  await editor.getByRole('button',{name:'Закрыть оформление',exact:true}).click();
  await page.waitForLoadState('networkidle');await page.goto(base+'/admin?screen=event-new');await expect(page.locator('.editor-panel')).toBeVisible();
  const input=page.getByLabel('Название',{exact:true});await input.focus();
  const focus=await input.evaluate(e=>{const style=getComputedStyle(e.closest('.lino-input'));return {width:style.outlineWidth,color:style.outlineColor};});assert.ok(parseFloat(focus.width)>0&&parseFloat(focus.width)<=2,JSON.stringify(focus));assert.notEqual(focus.color,'rgb(43, 33, 33)');
  await expect(page.locator('.editor-panel .field-helper:not(.field-error)')).toHaveCount(0);
  assert.equal(await input.getAttribute('autocomplete'),'off');
  await page.waitForLoadState('networkidle');await page.goto(base+'/admin?screen=event-settings');await expect(page.locator('.editor-panel')).toBeVisible();
  const scroll=page.locator('.admin-dialog-scroll');assert.equal(await scroll.evaluate(e=>getComputedStyle(e).scrollbarWidth),'none');await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await scroll.evaluate(e=>e.scrollTop>0));
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:650});await expect(page.locator('.editor-panel')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await scroll.evaluate(e=>e.scrollWidth<=e.clientWidth),JSON.stringify(await scroll.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,bad:[...e.querySelectorAll("*")].filter(x=>x.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(x=>({tag:x.tagName,c:x.className,html:x.outerHTML.slice(0,150),width:x.getBoundingClientRect().width})).slice(0,20)}))));const submit=page.getByRole('button',{name:'Сохранить изменения',exact:true});await submit.scrollIntoViewIfNeeded();await expect(submit).toBeInViewport();await page.screenshot({path:path.join(directory,`${engine}-editor-${width}.png`)});}
  assert.deepEqual(errors,[]);checks.push(`${engine}: gallery upload/delete/cancel/error/retry, retained assigned image, save failure/double submit, persistence, focus, helpers and scroll at 320/390/768/1440`);
  if(engine==='chromium'){
   let releaseOld,oldStarted;const started=new Promise(r=>oldStarted=r),hold=new Promise(r=>releaseOld=r);
   await page.route('**/api/analytics/participants?**',async route=>{
    const query=new URL(route.request().url()).searchParams.get('search')||'initial';
    if(query==='old'){oldStarted();await hold;}
    await route.fulfill({json:{metrics:{viewed:1,opened:0,reminders:0},participants:[{id:'fixture',nick:'@'+query,degree:'I',action:'viewed',reminder:false,lastActivity:new Date().toISOString()}],total:1,pageSize:8}});
   });
   await page.waitForLoadState('networkidle');await page.goto(base+'/admin?screen=participants');
   const search=page.getByLabel('Telegram-ник',{exact:true});await expect(search).toBeVisible();
   await search.fill('old');await started;await search.fill('latest');await expect(page.locator('.participants-table')).toContainText('@latest');
   releaseOld();await page.waitForLoadState('networkidle');await expect(page.locator('.participants-table')).toContainText('@latest');
   checks.push('A late analytics search response cannot replace the latest search results');
  }
  await context.close();await browser.close();browser=null;
 }
 console.log(JSON.stringify({directory,checks},null,2));
}finally{await browser?.close();await stop();writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks},null,2));}
