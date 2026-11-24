import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { chromium, expect } from '@playwright/test';

mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/admin-access-tags-'));
const database=path.join(directory,'test.sqlite'),token=randomBytes(32).toString('hex');
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`,checks=[],errors=[];
let server,browser;
async function api(route,body,method=body===undefined?'GET':'POST'){
  const response=await fetch(base+route,{method,headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
}
try{
server=spawn(process.execPath,['dist/server/entry.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:database,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_CARD_REVIEW:'0',CALENDAR_ADMIN_UI:'lino'}});
for(let i=0;i<100;i++){try{await api('/api/types');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
const directoryRows=(await api('/api/lodges')).lodges;
const db=new Database(database);db.prepare('UPDATE lodges SET icon_url=? WHERE id=?').run('/assets/lodges/priests.svg','priesthood');db.close();
const type=(await api('/api/types',{name:'Тип для проверки тегов',accessLabel:'Все',degree:'II',theme:'ordinary'})).type;
const fixture=(title,settings={})=>api('/api/events',{title,date:'2026-11-20',start:'19:00',end:'20:00',typeId:type.id,...settings});
const all=(await fixture('Теги: все ложи',{degree:''})).event;
await fixture('Теги: одна ложа',{audienceLodgeIds:['priesthood'],degree:'I'});
await fixture('Теги: несколько лож',{audienceLodgeIds:['priesthood','raubritters','students'],degree:'II'});
const separate=(await fixture('Теги: отдельная аудитория',{degree:'',requiresAuth:true})).event;
await api('/api/events/'+separate.id,{scope:'series',changes:{accessLabel:'Редакторы сообщества',allowedDegrees:['I','III']}},'PUT');
await fixture('Теги: наследование');
await fixture('Теги: без иконки',{audienceLodgeIds:['raubritters'],degree:''});
const long='Теги: длинное название события со всеми ложами и несколькими условиями доступа для проверки переноса на узком экране';
await fixture(long,{audienceLodgeIds:directoryRows.map(row=>row.id),degree:'III'});
browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();await context.request.post(base+'/api/local-session',{data:{token},headers:{Origin:base}});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const card=title=>page.locator('.event-group-card').filter({has:page.getByRole('button',{name:title,exact:true})});
const labels=title=>card(title).locator('.event-access-tag > span').allTextContents();
for(const mode of ['lino','classic'])for(const width of [1440,390,320]){
await page.setViewportSize({width,height:1000});await page.goto(base+'/admin?adminUi='+mode);
await expect(card('Теги: все ложи')).toBeVisible();
assert.deepEqual(await labels('Теги: все ложи'),['Все ложи']);
assert.deepEqual(await labels('Теги: одна ложа'),['Жречество']);
await expect(card('Теги: одна ложа').locator('.event-access-tag img')).toHaveCount(0);
assert.deepEqual(await labels('Теги: несколько лож'),['Жречество','Раубриттеры','Студенты']);
await expect(page.locator('.event-access-tag img')).toHaveCount(0);
await expect(card('Теги: без иконки').locator('.event-access-tag img')).toHaveCount(0);
await expect(card('Теги: все ложи').locator('.event-access-tag img')).toHaveCount(0);
assert.deepEqual(await labels('Теги: отдельная аудитория'),['Нужна авторизация','Все ложи','Группа: Редакторы сообщества']);
assert.deepEqual(await labels('Теги: наследование'),['Все ложи']);
await expect(card(long).locator('.event-access-tag')).toHaveCount(directoryRows.length);
assert.equal(await page.locator('.event-group-card .access-badge').count(),0);
assert.ok(!(await page.locator('.event-group-card').allTextContents()).some(text=>/Открыто|Закрыто|Доступ участников:/.test(text)));
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const layout=await card(long).evaluate(node=>{const bounds=node.getBoundingClientRect();return [...node.querySelectorAll('.event-access-tag')].every(tag=>{const r=tag.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&[...tag.querySelectorAll('span,img')].every(child=>{const b=child.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&child.scrollWidth<=child.clientWidth+1;});});});assert.ok(layout,'Every complete tag fits the card');
await expect(card(long).locator('.event-access-tags button')).toHaveCount(0);
await card(long).screenshot({path:path.join(directory,`${mode}-${width}.png`)});
checks.push(`${mode} ${width}: exact/minimum/inherited degrees, all/one/multiple lodges, group/auth, icons, wrapping`);
}
await page.goto(base+'/admin?adminUi=lino');
await card('Теги: все ложи').getByRole('button',{name:'Редактировать',exact:true}).click();
const editor=page.locator('.editor-panel');await expect(editor).toBeVisible();
await editor.getByLabel('Требуемый градус участников').click();await page.getByRole('option',{name:'Не ниже III градуса',exact:true}).click();
await editor.getByLabel('Камрады',{exact:true}).check();
await editor.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
await expect(page.getByRole('button',{name:'Закрыть событие',exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть событие',exact:true}).click();
await expect(card('Теги: все ложи').locator('.event-access-tags')).not.toContainText('Градус:');
await expect(card('Теги: все ложи').locator('.event-access-tags')).toContainText('Камрады');
await expect(card('Теги: все ложи').locator('.event-access-tags')).not.toContainText('Все ложи');
await card('Теги: все ложи').getByRole('button',{name:'Открыть событие',exact:true}).click();await expect(page.locator('.event-detail')).toBeVisible();
await page.keyboard.press('Escape');await page.reload();await expect(card('Теги: все ложи').locator('.event-access-tags')).toContainText('Камрады');
checks.push('Editing access refreshes tags immediately and survives reload; opening event preserved');
assert.deepEqual(errors,[]);
writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({directory,checks,errors}));
}finally{await browser?.close();if(server?.exitCode===null)server.kill();}
