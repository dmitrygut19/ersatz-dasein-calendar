import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import {installSoundProbe,soundFingerprints} from './sound-probe.mjs';
mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/calendar-sounds-'));
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['scripts/render-start.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_ADMIN_OPEN:'1',CALENDAR_ALLOW_REMOTE:'1',CALENDAR_PUBLIC_DEMO:'',CALENDAR_DEMO_REMOTE:'',CALENDAR_EXPERIMENT:'',CALENDAR_EXPERIMENT_TOKEN:'',CALENDAR_DATABASE_PATH:path.join(directory,'calendar.sqlite')},stdio:'ignore'});
let browser;const checks=[],errors=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/calendar')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addInitScript(installSoundProbe,soundFingerprints);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/calendar');await expect(page.locator('.uc-caption').first()).toBeVisible();
 assert.equal(await page.evaluate(()=>window.__decodedSounds.length),0,'No audio decoded on load');
 await page.keyboard.press('Shift');
 await expect.poll(()=>page.evaluate(()=>new Set(window.__decodedSounds).size)).toBe(14);
 const plays=()=>page.evaluate(()=>window.__soundPlays);
 const clear=()=>page.evaluate(()=>{window.__soundPlays=[];});
 const nextMonth=page.getByRole('button',{name:'Следующий месяц',exact:true});
 await clear();await nextMonth.hover();await expect.poll(()=>plays()).toContain('small-hover.mp3');
 await clear();await nextMonth.click();await expect.poll(()=>plays()).toEqual(['small-click.mp3']);
 await page.getByRole('button',{name:'Предыдущий месяц',exact:true}).click();
 await expect(page.locator('.uc-caption').first()).toBeVisible();
 await page.locator('.uc-caption').first().hover();await clear();
 await page.locator('.uc-caption').first().click();await expect.poll(()=>plays()).toEqual(['view-open.mp3']);
 const day=page.locator('.uc-selected');
 const previous=day.getByRole('button',{name:'Предыдущее событие',exact:true});
 const next=day.getByRole('button',{name:'Следующее событие',exact:true});
 await previous.hover();await clear();await previous.dispatchEvent('click');assert.deepEqual(await plays(),[]);
 await next.hover();await clear();await next.click();await expect.poll(()=>plays()).toEqual(['small-click.mp3']);
 await page.locator('.uc-card-close').hover();await clear();await page.locator('.uc-card-close').click();
 await expect.poll(()=>plays()).toEqual(['view-close.mp3']);
 checks.push('All 14 files decode lazily; navigation, pager, open and close play one correct sound; disabled is silent');
 const primary=page.getByRole('button',{name:'Войти через Telegram',exact:true});
 const hoverVariants=[];
 for(let i=0;i<4;i++){
   await page.mouse.move(0,0);await clear();await primary.hover();
   await expect.poll(()=>plays()).toHaveLength(1);
   const file=(await plays())[0];assert.match(file,/^accent-hover-[123]\.mp3$/);
   if(i)assert.notEqual(file,hoverVariants[i-1]);hoverVariants.push(file);
 }
 await clear();await primary.click();
 await expect.poll(()=>plays()).toHaveLength(1);assert.match((await plays())[0],/^accent-click-[12]\.mp3$/);
 checks.push('Primary buttons use accent variants without immediate repeats or pointerdown/click doubling');
 assert.equal(await page.locator('.uc-sound-toggle').count(),0);
 await page.evaluate(()=>localStorage.setItem('lino-muted','1'));
 await page.reload();await expect(page.locator('.uc-caption').first()).toBeVisible();
 assert.equal(await page.getByRole('button',{name:/Включить звук|Выключить звук/}).count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lino-muted')),'0');
 await page.keyboard.press('Shift');await expect.poll(()=>page.evaluate(()=>new Set(window.__decodedSounds).size)).toBe(14);
 await page.locator('.uc-caption').first().hover();await clear();
 await page.locator('.uc-caption').first().click();await expect.poll(()=>plays()).toEqual(['view-open.mp3']);
 checks.push('No sound toggle; sounds remain enabled after reload, including an older saved muted preference');
 const initial=new Date();
 for(let offset=0;offset<17;offset++){
   const date=new Date(initial.getFullYear(),initial.getMonth()+offset,1),days=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
   const numbers=await page.locator('.uc-day-number').allTextContents();
   assert.deepEqual(numbers.map(value=>parseInt(value,10)),Array.from({length:days},(_,i)=>i+1));
   const first=await page.locator('.uc-day').evaluateAll(els=>els.findIndex(el=>!el.classList.contains('uc-muted')));
   assert.equal(first,(date.getDay()+6)%7);
   assert.equal(await page.locator('.uc-muted button').count(),0);
   assert.ok(await page.locator('.uc-muted').evaluateAll(els=>els.every(el=>getComputedStyle(el).visibility==='hidden')));
   await nextMonth.click();
 }
 checks.push('17 months including leap February: only 1..last are visible, weekday alignment is correct, padding cells cannot open events');
 await page.goto(base+'/calendar');await expect(page.locator('.uc-caption').first()).toBeVisible();
 for(const width of [1440,1100,390,320]){
   await page.setViewportSize({width,height:1100});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(directory,`calendar-${width}.png`),fullPage:true,animations:'disabled'});
 }
 await page.goto(base+'/admin');await expect(page.locator('.admin-preview')).toBeVisible();
 await page.keyboard.press('Shift');assert.equal(await page.evaluate(()=>window.__decodedSounds.length),0);
 assert.equal(await page.locator('.admin-preview .uc-sound-toggle').count(),0);
 assert.deepEqual(errors,[]);
 writeFileSync(path.join(directory,'report.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({directory,checks,errors},null,2));
}finally{await browser?.close();server.kill();}
