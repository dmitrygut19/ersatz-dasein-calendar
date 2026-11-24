import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.CARD_REVIEW_URL||'http://127.0.0.1:4396';
const dir=process.env.SHEET_DRAG_REPORT_DIR||'artifacts/sheet-drag';
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[],samples=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true,isMobile:true});
 page.on('pageerror',e=>errors.push(e.message));
 const cdp=await page.context().newCDPSession(page);
 const sheet=page.locator('.uc-mobile-dialog[open]'),handle=page.locator('.uc-sheet-handle');
 const rect=()=>sheet.evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,height:r.height,transform:getComputedStyle(e).transform,expanded:e.querySelector('button').getAttribute('aria-expanded')};});
 const finish=()=>sheet.evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const touch=async(type,y)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:195,y}],});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));};
 async function open(){await page.goto(base+'/calendar');await page.locator('.uc-date-button').first().click();await expect(sheet).toBeVisible();await finish();}
 async function start(){const b=await handle.boundingBox();const y=b.y+b.height/2;await touch('touchStart',y);return y;}
 async function track(y,delta,initial){await touch('touchMove',y+delta);const r=await rect();samples.push({delta,...r});assert.ok(Math.abs(r.top-initial.top-delta)<1.5,JSON.stringify({initial,delta,r}));await page.waitForTimeout(60);assert.ok(Math.abs((await rect()).top-r.top)<.5,'held sheet drifts');assert.equal(await sheet.evaluate(e=>e.getAnimations().length),0,'animation during drag');}
 await open();let initial=await rect(),y=await start();
 await touch('touchEnd');await finish();
 await expect(handle).toHaveAttribute('aria-expanded','false');
 assert.ok(Math.abs((await rect()).height-initial.height)<1,'tap changes sheet height');
 await handle.click();await finish();await expect(handle).toHaveAttribute('aria-expanded','false');
 await handle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');await finish();await expect(handle).toHaveAttribute('aria-expanded','false');
 checks.push('tap, mouse click and keyboard activation on the handle do not resize the sheet');
 y=await start();
 for(const delta of [-8,-24,-64,-40,-12,18,-20])await track(y,delta,initial);
 let before=await rect();await touch('touchEnd');assert.ok(Math.abs((await rect()).top-before.top)<3,'release jumps');await finish();assert.ok(Math.abs((await rect()).top-initial.top)<1);
 checks.push('native Chromium touch: slow movement, reversals in both directions, held position, partial release');
 y=await start();await touch('touchMove',y-90);await touch('touchEnd');await finish();await expect(handle).toHaveAttribute('aria-expanded','true');
 const expandedHeight=(await rect()).height;y=await start();await touch('touchEnd');await finish();await expect(handle).toHaveAttribute('aria-expanded','true');assert.ok(Math.abs((await rect()).height-expandedHeight)<1,'tap collapses expanded sheet');
 y=await start();await touch('touchMove',y+90);await touch('touchEnd');
 await page.waitForTimeout(35);await handle.evaluate(e=>e.addEventListener('pointerdown',()=>{window.__grabTop=e.closest('dialog').getBoundingClientRect().top;},{capture:true,once:true}));y=await start();let grabbed=await rect();const grabTop=await page.evaluate(()=>window.__grabTop);assert.ok(Math.abs(grabbed.top-grabTop)<1.5,JSON.stringify({grabbed,grabTop}));
 for(const delta of [-15,10,-5])await track(y,delta,grabbed);
 await touch('touchCancel');await finish();await expect(handle).toHaveAttribute('aria-expanded','false');
 checks.push('fast swipe expands/collapses; regrab interrupts settling at rendered position; touchcancel settles');
 y=await start();await touch('touchMove',y+30);
 await touch('touchCancel');await finish();assert.equal(await sheet.evaluate(e=>e.classList.contains('uc-sheet-dragging')),false);
 // Release actual pointer capture, independent of Chromium pointer id allocation.
 y=await start();await touch('touchMove',y+20);await handle.evaluate(e=>{for(let n=0;n<50;n++)if(e.hasPointerCapture(n))e.releasePointerCapture(n);});await touch('touchCancel');await finish();
 assert.equal(await sheet.evaluate(e=>e.classList.contains('uc-sheet-dragging')),false);
 checks.push('lost pointer capture releases drag state');
 await page.goBack();await expect(sheet).toHaveCount(0);await page.setViewportSize({width:320,height:320});
 await page.route('**/api/calendar?**',async route=>{const response=await route.fetch(),data=await response.json();for(const e of data.events){e.description='Long event content. '.repeat(500);e.canFollow=true;e.reason=null;e.calendarUrl='https://calendar.google.com/calendar/render?action=TEMPLATE';}await route.fulfill({json:data});});
 await open();const scroll=sheet.locator('.uc-mobile-dialog-scroll');const top=(await rect()).top;
 await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight;});assert.ok(await scroll.evaluate(e=>e.scrollTop>0));assert.equal((await rect()).top,top);
 await expect(sheet.getByRole('link',{name:'Добавить в календарь',exact:true})).toBeVisible();
 const b=await scroll.boundingBox();await touch('touchStart',b.y+60);await touch('touchMove',b.y+10);await touch('touchEnd');assert.equal((await rect()).top,top);
 y=await start();await touch('touchMove',y+60);await touch('touchEnd');await expect(sheet).toHaveCount(0);assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
 checks.push('320px short screen: long content scroll and action remain available; content touch does not drag; swipe closes');
 assert.deepEqual(errors,[]);
}finally{await browser.close();mkdirSync(dir,{recursive:true});writeFileSync(dir+'/report.json',JSON.stringify({checks,errors,samples},null,2));console.log(JSON.stringify({checks,errors},null,2));}
