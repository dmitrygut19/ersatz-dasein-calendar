import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screens } from '../src/lib/admin-demo.ts';
import { seedDemo } from './seed.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root,'artifacts'); mkdirSync(artifacts,{recursive:true});
const run = mkdtempSync(path.join(artifacts,'admin-run-'));
const socket = createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
const port = socket.address().port; await new Promise(resolve=>socket.close(resolve));
const base = `http://127.0.0.1:${port}`, token = randomBytes(32).toString('hex');
const database = path.join(run,'admin.sqlite'); seedDemo(database);
const server = spawn(process.execPath,['dist/server/entry.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:database},stdio:['ignore','pipe','pipe']});
let output = '', browser; server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
const results = [], errors = [];
async function check(name,action){try{await action();results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,error:error.message});throw error;}}
try {
  let ready = false;
  for(let i=0;i<80;i++){if(server.exitCode!==null)throw new Error(output);try{if((await fetch(base)).status===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Server did not start.');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/#${token}`);await page.waitForURL('**/admin');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    for(const screen of screens) {
      await check(`${width}px: ${screen.title}`,async()=>{
        await page.goto(`${base}/admin?screen=${screen.id}`);
        await page.waitForFunction(()=>!document.querySelector('astro-island')?.hasAttribute('ssr'));
        await expect(page.locator(`[data-screen="${screen.id}"]`)).toBeVisible();
        if(screen.id==='type-edit'||screen.id==='type-new') await expect(page.locator('.type-editor')).toBeVisible();
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
        await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0),null,{timeout:5000}).catch(()=>{});
        const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(image=>!image.complete||!image.naturalWidth).map(image=>image.getAttribute('src'))}));
        assert.equal(state.overflow,false,`Horizontal overflow: ${screen.id} ${width}`);
        // Async panel data can mount a selected radio image after the first decode pass.
        await expect.poll(() => page.evaluate(() => [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')))).toEqual([]);
        if(['event','event-settings','participant','appearance-type','appearance-event'].includes(screen.id)||screen.id.startsWith('integration-')) await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({path:path.join(run,`${screen.id}-${width}.png`),fullPage:true});
      });
    }
  }
  await check('Typed events stay out of the untyped queue, including new series',async()=>{
    await page.goto(base+'/admin?screen=access');
    await expect(page.locator('.event-list-card')).toHaveCount(0);
    await expect(page.getByText('Менторство',{exact:true})).toHaveCount(0);
    const event=await page.evaluate(async()=>{
      const date=new Date().toLocaleDateString('en-CA');
      const weekday=(new Date(`${date}T12:00:00`).getDay()+6)%7;
      const response=await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Проверка серии',date,start:'12:00',end:'13:00',typeId:'demo-congress',repeatRule:{freq:'weekly',interval:1,byWeekday:[weekday],until:null,count:4}})});
      const result=await response.json();
      if(!response.ok)throw new Error(JSON.stringify(result));
      return result.event;
    });
    await page.reload();
    await expect(page.locator('.event-list-card')).toHaveCount(0);
    await expect(page.locator('.event-list-card').filter({hasText:'Проверка серии'})).toHaveCount(0);
    await page.getByRole('button',{name:'Все события',exact:true}).click();
    await expect(page.locator('.event-list-card').filter({hasText:'Проверка серии'})).toHaveCount(1);
    await page.evaluate(id=>fetch(`/api/events/${id}`,{method:'DELETE'}),event.id);
  });
  await page.setViewportSize({width:390,height:844});
  await check('Mobile: login, connection validation and skip to manual mode',async()=>{
    await page.goto(base+'/admin?screen=login');
    await page.getByRole('button',{name:'Войти через Telegram',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Подключите календарь'})).toBeVisible();
    await page.getByLabel('Ссылка iCal',{exact:true}).fill('');
    await page.getByRole('button',{name:'Подключить',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('iCal');
    await page.getByRole('button',{name:'Пропустить',exact:true}).click();
    await expect(page.locator('[data-screen="manual"]')).toBeVisible();
  });
  await check('Mobile: manual event saves on the server and survives reload',async()=>{
    await page.getByRole('button',{name:'Добавить событие вручную',exact:true}).click();
    await page.getByLabel('Название',{exact:true}).fill('Проверка всей админки');
    await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
    await expect(page.getByRole('button',{name:'Проверка всей админки',exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button',{name:'Проверка всей админки',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Проверка всей админки',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button',{name:'Закрыть событие'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('Participants: filtering and profile open and close',async()=>{
    // Own fixture: the first viewed seed release need not contain @nickname.
    await page.evaluate(async()=>{
      const {types}=await (await fetch('/api/types')).json();
      const {releases}=await (await fetch('/api/analytics/releases?period=3months&typeId='+encodeURIComponent(types[0].id))).json();
      if(!releases[0])throw new Error('No release for analytics fixture');
      const response=await fetch('/api/analytics/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventKey:releases[0].id,telegramId:'admin-browser-check',nick:'@integration_check',kind:'view'})});
      if(!response.ok)throw new Error('Could not create analytics fixture');
    });
    await page.goto(base+'/admin?screen=participants');
    await expect(page.locator('.issue-button').first()).toBeVisible();
    const showMore = page.getByRole('button',{name:'Показать ещё',exact:true});
    if (await showMore.isVisible()) await showMore.click();
    await page.locator('.issue-button').first().click();
    await page.getByLabel('Telegram-ник',{exact:true}).fill('@integration_check');
    await expect(page.locator('.participants-table tbody tr')).toHaveCount(1);
    await page.getByRole('button',{name:'@integration_check',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Активность участника',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('Integration panel changes states and closes',async()=>{
    await page.goto(base+'/admin?screen=integration-connected');
    await page.getByRole('button',{name:'Обновить сейчас',exact:true}).click();
    await expect(page.getByText('Обновляем события…',{exact:true})).toBeVisible();
    await expect(page.locator('[data-screen="integration-error"]')).toBeVisible();
    await expect(page.getByText('Ошибка синхронизации',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Отключить календарь',exact:true}).click();
    await expect(page.getByText('Вставьте ссылку iCal из настроек Google или Яндекс.Календаря, чтобы импортировать события.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Закрыть подключение'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('Catalogue lists every state and embeds an actual 390px viewport',async()=>{
    await page.goto(base+'/admin/screens');
    await expect(page.locator('.screen-link')).toHaveCount(screens.length);
    await page.goto(base+'/admin/screens?preview=calendar&mode=mobile');
    await expect(page.locator('iframe')).toHaveAttribute('width','390');
    await expect(page.frameLocator('iframe').getByRole('heading',{name:'Админка',exact:true})).toBeVisible();
  });
  await check('No JavaScript exceptions across all admin screens',async()=>assert.deepEqual(errors,[]));
}catch(error){console.error(error);process.exitCode=1;}
finally{
  if(browser)await browser.close();if(server.exitCode===null){const closed=once(server,'exit');server.kill();await closed;}
  const report={recordedAt:new Date().toISOString(),screens:screens.length,viewports:[1440,390],passed:results.filter(result=>result.passed).length,failed:results.filter(result=>!result.passed).length,screenshots:path.relative(root,run),results,browserErrors:errors};
  writeFileSync(path.join(artifacts,'admin-check.json'),JSON.stringify(report,null,2));
  console.log(`${report.passed} passed, ${report.failed} failed. Screenshots: ${report.screenshots}`);
}
