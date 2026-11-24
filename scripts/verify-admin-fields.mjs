import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
mkdirSync('artifacts',{recursive:true});const directory=mkdtempSync(path.resolve('artifacts/admin-fields-'));
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex'),checks=[],errors=[];let server,browser;
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
try{
server=spawn(process.execPath,['dist/server/entry.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:path.join(directory,'test.sqlite'),CALENDAR_PUBLIC_DEMO:'0',CALENDAR_ADMIN_UI:'lino',CALENDAR_CARD_REVIEW:'0'}});
for(let i=0;i<100;i++){try{await api('/api/types');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
let type;for(let i=0;i<24;i++){const result=await api('/api/types',{name:i?`Длинный вариант ${i}: обсуждение произведений и совместных проектов сообщества`:'Основной тип',accessLabel:'Все',degree:'II',theme:'ordinary'});type??=result.type;}
const manual=(await api('/api/events',{title:'Событие для проверки полей',date:'2026-11-18',start:'19:00',end:'20:00',typeId:type.id})).event;
await api('/api/analytics/activity',{eventKey:manual.id,telegramId:'fields-fixture',nick:'@fields_check',kind:'view'});
browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();await context.request.post(base+'/api/local-session',{data:{token},headers:{Origin:base}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const menu=()=>page.locator('.admin-menu-popover:popover-open');
async function validateMenu(trigger,inDialog=false){
await trigger.scrollIntoViewIfNeeded();await trigger.click();await expect(menu()).toHaveCount(1);
if(inDialog&&await trigger.getAttribute('id')==='event-type')await menu().screenshot({path:path.join(directory,'dropdown-'+page.viewportSize().width+'.png')});const result=await menu().evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),first=node.querySelector('button');const b=first?.getBoundingClientRect();const hit=b?document.elementFromPoint(b.left+b.width/2,Math.max(r.top+2,Math.min(r.bottom-2,b.top+b.height/2))):null;return {rect:r.toJSON(),width:innerWidth,height:innerHeight,overflow:s.overflowX,scrollbar:s.scrollbarWidth,background:s.backgroundColor,hit:node.contains(hit),dialog:Boolean(node.closest('dialog[open]')),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};});
assert.ok(result.rect.left>=0&&result.rect.right<=result.width+1&&result.rect.top>=0&&result.rect.bottom<=result.height+1,JSON.stringify(result));assert.equal(result.overflow,'hidden');assert.equal(result.scrollbar,'none');assert.ok(result.hit,'Top-layer menu receives clicks');assert.ok(!result.background.includes('rgba(0, 0, 0, 0)'));assert.ok(result.scrollWidth<=result.clientWidth+8,JSON.stringify(result));if(inDialog)assert.ok(result.dialog);
const checked=menu().locator('[data-state=checked]');if(await checked.count()){const style=await checked.first().evaluate(n=>({ink:getComputedStyle(n).color,bg:getComputedStyle(n).getPropertyValue('--surface-bg')}));assert.ok(!style.bg.includes('color-accent'));assert.notEqual(style.ink,'rgb(255, 255, 255)');}
await page.keyboard.press('End');await expect(menu().getByRole('option').last()).toBeFocused();await page.keyboard.press('Home');await expect(menu().getByRole('option').first()).toBeFocused();
await page.keyboard.press('Escape');await expect(menu()).toHaveCount(0);await expect(trigger).toBeFocused();if(inDialog)await expect(page.locator('dialog[open]')).toHaveCount(1);
}
async function validateAll(scope,inDialog=false){for(const detail of await scope.locator('details').all()){if(await detail.isVisible()&&await detail.getAttribute('open')===null)await detail.locator('summary').first().click();}const fields=scope.locator('button[aria-haspopup=listbox][id]');const ids=await fields.evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>n.id));for(const id of ids)await validateMenu(page.locator('[id='+JSON.stringify(id)+']'),inDialog);await expect(scope.locator('select')).toHaveCount(0);return ids;}
for(const width of [1440,390,320]){
await page.setViewportSize({width,height:900});
await page.goto(base+'/admin?adminUi=lino');await page.getByRole('button',{name:'Добавить тип',exact:true}).click();
const typeFields=await validateAll(page.locator('.type-editor'));
await page.getByLabel('Название типа',{exact:true}).focus();assert.equal(await page.getByLabel('Название типа',{exact:true}).evaluate(n=>getComputedStyle(n.closest('.field').querySelector('.lino-input')).outlineColor),'rgb(43, 33, 33)');
await page.locator('.type-editor').getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('.type-editor [role=alert]')).toBeVisible();
await page.locator('.type-editor').getByRole('button',{name:'Отмена',exact:true}).click();
await page.getByRole('button',{name:'Добавить событие вручную',exact:true}).click();const eventFields=await validateAll(page.locator('.editor-panel'));
// A long single-select menu can scroll to every option without system select UI.
const eventType=page.locator('#event-type');await eventType.evaluate(n=>n.scrollIntoView({block:'end'}));await eventType.click();await expect(menu()).toHaveAttribute('data-side','top');await page.keyboard.press('End');assert.ok(await menu().evaluate(n=>n.scrollTop>0));await page.keyboard.press('Enter');await expect(eventType).toContainText('Длинный вариант 23');await expect(menu()).toHaveCount(0);
// Changing fields closes the previous portal rather than leaving another menu behind.
await eventType.click();await page.locator('#event-degree').click();await expect(menu()).toHaveCount(1);await expect(page.locator('#event-type')).toHaveAttribute('aria-expanded','false');await page.getByLabel('Название',{exact:true}).click();await expect(menu()).toHaveCount(0);
await page.locator('.editor-panel').getByRole('button',{name:'Отмена',exact:true}).click();
await page.locator('.event-group-card').filter({hasText:'Событие для проверки полей'}).getByRole('button',{name:'Редактировать',exact:true}).click();
const modalFields=await validateAll(page.locator('dialog[open]'),true);
// Internal form scroll keeps a portal aligned with its own trigger.
const topic=page.locator('#event-lodge');if(await topic.count()){await topic.scrollIntoViewIfNeeded();await topic.click();await page.locator('.admin-dialog-scroll').evaluate(n=>n.scrollBy(0,20));await expect.poll(()=>menu().evaluate(n=>{const trigger=document.getElementById('event-lodge'),a=trigger.getBoundingClientRect(),r=n.getBoundingClientRect();return Math.min(Math.abs(r.top-a.bottom-4),Math.abs(a.top-r.bottom-4));})).toBeLessThan(2);await page.keyboard.press('Escape');}
await page.locator('dialog[open]').screenshot({path:path.join(directory,`modal-${width}.png`)});
await page.locator('#event-degree').click();await page.evaluate(()=>{const d=document.createElement('dialog');d.id='other-modal-check';document.body.append(d);d.showModal();});await expect(menu()).toHaveCount(0);await page.evaluate(()=>document.getElementById('other-modal-check').remove());
await page.locator('.editor-panel').getByRole('button',{name:'Настроить оформление',exact:true}).click();await expect(page.locator('.appearance-editor')).toBeVisible();
for(const input of await page.locator('.appearance-editor input[type=text]').all()){await input.focus();assert.ok(await input.evaluate(n=>getComputedStyle(n).color!=='rgb(255, 255, 255)'));}await page.getByRole('button',{name:'Закрыть оформление',exact:true}).click();
await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);
await page.goto(base+'/admin?screen=participants&adminUi=lino');await expect(page.locator('.issue-button').first()).toBeVisible();await page.locator('.issue-button').first().click();const analyticsFields=await validateAll(page.locator('.analytics-grid'));await page.getByRole('button',{name:'@fields_check',exact:true}).click();await validateAll(page.locator('dialog[open]'),true);await page.keyboard.press('Escape');
await page.goto(base+'/admin?screen=integration-error&adminUi=lino');await expect(page.locator('#integration-link')).toBeDisabled();await page.keyboard.press('Escape');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push({width,typeFields,eventFields,modalFields,analyticsFields,appearance:true,disabled:true,modalIsolation:true,topLayer:true,keyboard:true,noScrollbars:true,noOverlap:true});
}
await page.goto(base+'/calendar');await expect(page.locator('.admin-menu-popover')).toHaveCount(0);const filter=page.getByRole('button').filter({hasText:'Все'}).first();if(await filter.count()){await filter.click();await expect(page.locator('.admin-menu-popover')).toHaveCount(0);}
assert.deepEqual(errors,[]);writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({directory,checks,errors}));
}finally{await browser?.close();if(server?.exitCode===null)server.kill();}
