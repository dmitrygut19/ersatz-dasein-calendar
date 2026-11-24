import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {chromium,expect} from '@playwright/test';
import {seedSharedCalendar,applyConfiguredFullLodgeCovers} from './seed-shared-calendar.mjs';
mkdirSync('artifacts',{recursive:true});const dir=mkdtempSync(path.resolve('artifacts/full-lodge-covers-')),checks=[],errors=[];
const config=JSON.parse(readFileSync('config/community-calendar.json','utf8'));
const manifest=JSON.parse(readFileSync('public/assets/lodge-covers/manifest.json','utf8'));
for(const item of manifest.items){const bytes=readFileSync('public'+item.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.match(bytes.toString(),/<svg[^>]*width="512"[^>]*height="512"/);}
checks.push('All 11 supplied originals retain exact hashes and 512x512 SVG dimensions');
const migration=path.join(dir,'migration.sqlite'),old=structuredClone(config);
for(const type of old.types)if(type.cover_path)type.cover_path=type.cover_path.replace('/lodge-covers/','/lodges/');
seedSharedCalendar(migration,old);const db=new Database(migration);
try{
 db.prepare("DELETE FROM calendar_settings WHERE key='full_lodge_covers_20261120'").run();
 db.prepare('UPDATE event_types SET cover_path=? WHERE id=?').run('/assets/panel/a5ff5.png',config.types[0].id);
 const event=config.events[0];db.prepare('INSERT INTO event_occurrence_overrides(event_id,original_date,cover_path,created_at,updated_at) VALUES(?,?,?,?,?)').run(event.id,event.start_date,'/assets/panel/2a38c.png',Date.now(),Date.now());
 const schedule=db.prepare('SELECT * FROM events ORDER BY id').all(),overrides=db.prepare('SELECT * FROM event_occurrence_overrides').all(),defaults=db.prepare("SELECT value FROM calendar_settings WHERE key='external_event_defaults'").get();
 applyConfiguredFullLodgeCovers(db,config);
 for(const type of config.types)assert.equal(db.prepare('SELECT cover_path FROM event_types WHERE id=?').get(type.id).cover_path,type.id===config.types[0].id?'/assets/panel/a5ff5.png':type.cover_path);
 assert.deepEqual(db.prepare('SELECT * FROM events ORDER BY id').all(),schedule);assert.deepEqual(db.prepare('SELECT * FROM event_occurrence_overrides').all(),overrides);assert.deepEqual(db.prepare("SELECT value FROM calendar_settings WHERE key='external_event_defaults'").get(),defaults);
 db.prepare('UPDATE event_types SET cover_path=NULL WHERE id=?').run(config.types[2].id);applyConfiguredFullLodgeCovers(db,config);assert.equal(db.prepare('SELECT cover_path FROM event_types WHERE id=?').get(config.types[2].id).cover_path,null);
 checks.push('Only known old defaults migrate; own type/release covers, access, schedule, onboarding and later edits survive');
}finally{db.close();}
const file=path.join(dir,'ui.sqlite');seedSharedCalendar(file,config);
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const base=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex'),headers={Origin:base,Authorization:`Bearer ${token}`};
const server=spawn(process.execPath,['dist/server/entry.mjs'],{stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_DATABASE_PATH:file,CALENDAR_PUBLIC_DEMO:'0',CALENDAR_SHARED_CALENDAR:'0',CALENDAR_SYNC_INTERVAL_MS:'0',CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token}});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const item of manifest.items){
  const response=await fetch(base+'/api/types',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'[Тест] '+item.name,coverPath:item.path,theme:'ordinary',accessLabel:'Все'})});
  assert.equal(response.status,200,await response.text());const downloaded=await fetch(base+item.path);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),readFileSync('public'+item.path));
 }
 checks.push('All 11 complete covers are accepted by the type API and served byte-for-byte');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#'+token);await page.waitForURL('**/admin');
 for(const width of [320,390,430,1440,1920]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/admin');await expect(page.locator('.event-group-card').first()).toBeVisible();
  const thumbnails=page.locator('.event-list-identity img[src^="/assets/lodge-covers/"]');await expect(thumbnails).toHaveCount(8);
  assert.ok(await thumbnails.evaluateAll(es=>es.every(e=>getComputedStyle(e).objectFit==='cover')));
  const preview=page.locator('.admin-preview');
  await expect(preview.locator('.uc-preview-note')).toHaveCount(0);
  if(width>700){
   const images=preview.locator('.uc-day img[src^="/assets/lodge-covers/"]');await expect(images).toHaveCount(11);
   const layout=await images.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),day=e.closest('.uc-day'),d=day.getBoundingClientRect(),bleed=parseFloat(getComputedStyle(day).getPropertyValue('--cut-bleed'))||0;return {left:r.left-d.left+bleed,right:d.right-r.right+bleed,top:r.top-d.top+bleed,bottom:d.bottom-r.bottom+bleed,fit:getComputedStyle(e).objectFit};}));
   assert.ok(layout.every(e=>Math.abs(e.left)<1&&Math.abs(e.right)<1&&Math.abs(e.top)<1&&Math.abs(e.bottom)<1&&e.fit==='cover'),JSON.stringify(layout));
   await preview.locator('.uc-caption').first().click();await expect(preview.getByRole('button',{name:'Настройки события',exact:true})).toBeVisible();await preview.getByRole('button',{name:'Настройки события',exact:true}).click();await expect(page.locator('.event-detail')).toBeVisible();await page.locator('.event-detail').getByRole('button',{name:'Настройки события',exact:true}).click();await expect(page.locator('.editor-panel')).toBeVisible();await page.keyboard.press('Escape');
  }else{
   await expect(preview.locator('.uc-day img')).toHaveCount(0);
   await expect(preview.locator('.uc-cell-event[data-mobile-color="lodge-technopriests"]').first()).toBeVisible();
  }
  await page.screenshot({path:`${dir}/admin-${width}.png`,fullPage:true});
  await page.goto(base+'/admin?screen=appearance-type');await expect(page.locator('.cover-option img[src^="/assets/lodge-covers/"]')).toHaveCount(11);await page.locator('.appearance-editor').screenshot({path:`${dir}/gallery-${width}.png`});
  await page.goto(base+'/calendar');
  if(width>700){
   const images=page.locator('.uc-day img[src^="/assets/lodge-covers/"]');await expect(images).toHaveCount(11);await expect.poll(()=>images.evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth===512))).toBe(true);
   const layout=await images.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),day=e.closest('.uc-day'),d=day.getBoundingClientRect(),bleed=parseFloat(getComputedStyle(day).getPropertyValue('--cut-bleed'))||0;return {left:r.left-d.left+bleed,right:d.right-r.right+bleed,top:r.top-d.top+bleed,bottom:d.bottom-r.bottom+bleed,fit:getComputedStyle(e).objectFit};}));
   assert.ok(layout.every(e=>Math.abs(e.left)<1&&Math.abs(e.right)<1&&Math.abs(e.top)<1&&Math.abs(e.bottom)<1&&e.fit==='cover'),JSON.stringify(layout));
   await page.screenshot({path:`${dir}/calendar-${width}.png`,fullPage:true});await page.locator('.uc-caption').first().click();
   await expect(page.locator('aside .figma-card-tier img,aside .figma-card-tier svg')).toHaveCount(0);await expect(page.locator('aside .figma-card-access-label')).toHaveText('Техножречество');
   await expect(page.locator('aside .figma-card-cover img')).toHaveAttribute('src','/assets/lodge-covers/technopriests.svg');
  }else{
   await expect(page.locator('.uc-day img')).toHaveCount(0);await page.locator('.uc-date-button').first().click();
   await expect(page.locator('dialog .figma-card-tier img,dialog .figma-card-tier svg')).toHaveCount(0);await expect(page.locator('dialog .figma-card-cover img')).toHaveAttribute('src','/assets/lodge-covers/technopriests.svg');
   await page.screenshot({path:`${dir}/mobile-card-${width}.png`});await page.keyboard.press('Escape');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push(`${width}: original covers in admin/gallery/card; full-cell day images beneath date and caption without gaps; text-only event tags; no overflow`);
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/calendar');await page.locator('.uc-lodges .lino-select-trigger').click();await expect(page.locator('.lino-multi-menu img[src^="/assets/lodges/"]').first()).toBeVisible();
 checks.push('Lodge filter still uses the separate original icon assets');assert.deepEqual(errors,[]);console.log(JSON.stringify({dir,checks,errors}));
}finally{await browser?.close();server.kill();writeFileSync(path.join(dir,'report.json'),JSON.stringify({checks,errors},null,2));}
