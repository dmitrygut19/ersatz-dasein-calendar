import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.CARD_REVIEW_URL||'http://127.0.0.1:4353',dir='artifacts/mobile-event-dialog';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:650},reducedMotion:'reduce'});
 async function dragHandle(delta,cancel=false){
  const handle=page.locator('.uc-sheet-handle'),box=await handle.boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+delta,{steps:8});
  if(cancel)await handle.dispatchEvent('pointercancel',{pointerId:1,isPrimary:true,clientY:y+delta});
  await page.mouse.up();
 }
 page.on('pageerror',e=>errors.push(e.message));
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()).slice(0,7);
 const data=await (await fetch(`${base}/api/calendar?from=${month}-01&to=${month}-31`)).json();
 // Filter preservation must not depend on the local seed's optional affiliations.
 for(const event of data.events){event.affiliationDegree='I';event.affiliationDegrees=['I'];}
 await page.route('**/api/calendar?**',route=>route.fulfill({json:data}));
 assert.ok(data.events.some(e=>e.canFollow)&&data.events.some(e=>!e.canFollow));
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:650});await page.goto(base+'/calendar');
  const days=page.locator('.uc-date-button'),card=page.locator('dialog .uc-card'),dialog=page.getByRole('dialog');
  await expect(days).toHaveCount(new Set(data.events.map(e=>e.date)).size);
  await expect(page.locator('.uc-day img,.uc-mobile-variants,.uc-grid-images,aside.uc-panel')).toHaveCount(0);
  assert.equal(await page.locator('.uc-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),7);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${dir}/${width}-month.png`,fullPage:true});
  for(const index of [0,Math.floor(await days.count()/2),await days.count()-1]){
   const trigger=days.nth(index);await trigger.scrollIntoViewIfNeeded();await trigger.focus();
   const before=await page.evaluate(()=>({y:scrollY,label:document.querySelector('.uc-month').textContent}));
   await trigger.click();await expect(dialog).toBeVisible();await expect(card).toHaveCount(1);
   await expect(card).toHaveAttribute('aria-busy','false');
   const bounds=await dialog.boundingBox();assert.equal(bounds.x,0);assert.equal(bounds.width,width);assert.ok(bounds.height<=650-24+1);assert.ok(bounds.height>650*2/3);assert.ok(Math.abs(bounds.y+bounds.height-650)<1);assert.ok(bounds.y>=23);
   assert.equal(await dialog.evaluate(e=>getComputedStyle(e,'::backdrop').backgroundColor),'rgba(0, 0, 0, 0.4)');
   assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
   const close=dialog.locator('.uc-sheet-handle');
   await expect(dialog.locator('.uc-card-close')).toHaveCount(0);
   await close.focus();await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)));
   await page.screenshot({path:`${dir}/${width}-week-${index}.png`});
   if(index===0)await page.keyboard.press('Escape');else if(index===await days.count()-1)await page.goBack();else await page.mouse.click(width/2,8);
   await expect(dialog).toHaveCount(0);await expect(page.locator('.uc-card')).toHaveCount(0);
   await expect.poll(()=>page.evaluate(()=>document.body.style.position)).not.toBe('fixed');
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(before.y);
   assert.equal(await page.locator('.uc-month').textContent(),before.label);
   assert.ok(await trigger.evaluate(e=>e===document.activeElement));
   await expect(page.locator('.uc-selected')).toHaveCount(1);
  }
  const multi=data.events.find(e=>data.events.filter(other=>other.date===e.date).length>1);
  const dayIndex=Number(multi.date.slice(-2));
  const multiDay=page.locator('.uc-day').filter({has:page.locator('.uc-compact-date',{hasText:new RegExp(`^${dayIndex}$`)})}).locator('.uc-date-button');
  await multiDay.click();const firstName=await card.locator('.uc-card-name').textContent();
  await dialog.getByRole('button',{name:'Следующее событие в этот день'}).click();await expect(card.locator('.uc-card-name')).not.toHaveText(firstName);
  await expect.poll(()=>dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);
  await page.goBack();await expect(dialog).toHaveCount(0);
  for(const allowed of [true,false]){
   const event=data.events.find(e=>e.canFollow===allowed && data.events.filter(other=>other.date===e.date).length===1);
   const trigger=page.locator('.uc-day').filter({has:page.locator('.uc-compact-date',{hasText:new RegExp(`^${Number(event.date.slice(-2))}$`)})}).locator('.uc-date-button');
   await trigger.click();await expect(card).toHaveAttribute('aria-busy','false');
   await expect(card.locator('.figma-card-gate')).toHaveCount(allowed?0:1);
   await expect(card.locator('.figma-card-cover img')).toHaveCount(event.cover?1:0);
   await page.goBack();await expect(dialog).toHaveCount(0);
  }
  const beforeLength=await page.evaluate(()=>history.length);
  for(let i=0;i<4;i++){await days.first().click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>history.state?.calendarEventDialog??null)).toBe(null);}
  assert.equal(await page.evaluate(()=>history.length),beforeLength);
  await days.first().click();await expect(dialog).toBeVisible();
  const handle=page.locator('.uc-sheet-handle');
  await dragHandle(-100);await expect(handle).toHaveAttribute('aria-expanded','true');
  await dragHandle(100);await expect(handle).toHaveAttribute('aria-expanded','false');await expect(dialog).toBeVisible();
  await dragHandle(12);await expect(dialog).toBeVisible();assert.equal(await dialog.evaluate(e=>getComputedStyle(e).transform),'matrix(1, 0, 0, 1, 0, 0)');
  await dragHandle(30,true);await expect(dialog).toBeVisible();assert.equal(await dialog.evaluate(e=>getComputedStyle(e).transform),'matrix(1, 0, 0, 1, 0, 0)');
  await dragHandle(100);await expect(dialog).toHaveCount(0);
  await days.first().click();await expect(dialog).toBeVisible();
  const chosen=await page.locator('.uc-selected').innerText();
  await page.mouse.click(width/2,8);await expect(dialog).toHaveCount(0);assert.equal(await page.locator('.uc-selected').innerText(),chosen);
  checks.push(`${width}: drag up expands, drag down collapses/closes, incomplete drag settles, backdrop closes without selecting background`);
  await days.first().click();await expect(dialog).toBeVisible();await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('aside.uc-panel .uc-card')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.body.style.position)).not.toBe('fixed');
  await expect.poll(()=>page.evaluate(()=>history.state?.calendarEventDialog??null)).toBe(null);
  await page.setViewportSize({width,height:650});await expect(dialog).toBeVisible();await page.goBack();await expect(dialog).toHaveCount(0);
  checks.push(`${width}: text month, no overflow, three weeks, focus trap/return, scroll restore, selected day, multi-event pager, access/cover, history cycles, resize cleanup`);
 }
 await page.setViewportSize({width:390,height:650});await page.goto(base+'/calendar');
 const degree=page.getByRole('group',{name:'Фильтры событий',exact:true}).getByRole('group',{name:'Градус',exact:true});
 await degree.getByRole('button',{name:'I',exact:true}).click();
 await page.locator('.uc-date-button').first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(degree.getByRole('button',{name:'I',exact:true})).toHaveAttribute('aria-pressed','true');
 checks.push('closing preserves active degree filter');
 const long=structuredClone(data),event=long.events.find(e=>e.canFollow&&data.events.filter(other=>other.date===e.date).length===1);event.description='Полное длинное описание встречи. '.repeat(250);
 await page.route('**/api/calendar?**',route=>route.fulfill({json:long}));
 await page.setViewportSize({width:320,height:568});await page.reload();await expect(page.locator('.uc-date-button')).not.toHaveCount(0);
 const trigger=page.locator('.uc-day').filter({has:page.locator('.uc-compact-date',{hasText:new RegExp(`^${Number(event.date.slice(-2))}$`)})}).locator('.uc-date-button');
 await trigger.click();const card=page.locator('dialog .uc-card'),dialog=page.getByRole('dialog');await expect(card).toHaveAttribute('aria-busy','false');
 await dragHandle(-100);await expect(page.locator('.uc-sheet-handle')).toHaveAttribute('aria-expanded','true');
 assert.ok((await dialog.boundingBox()).height>=568-25);
 await card.getByRole('link',{name:'Добавить в календарь',exact:true}).scrollIntoViewIfNeeded();
 await expect(dialog.locator('.uc-sheet-handle')).toBeInViewport();
 assert.ok(await page.locator('.uc-mobile-dialog-scroll').evaluate(e=>e.scrollTop>0));
 await page.mouse.wheel(0,400);assert.equal(await page.evaluate(()=>scrollY),0);
 await expect(dialog).toBeVisible();
 await page.setViewportSize({width:650,height:320});await expect(dialog.locator('.uc-sheet-handle')).toBeInViewport();assert.ok((await dialog.boundingBox()).height<=320-23);
 await page.setViewportSize({width:320,height:568});
 await page.screenshot({path:`${dir}/long-card-actions.png`});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.unroute('**/api/calendar?**');
 await page.route('**/api/calendar?**',route=>route.fulfill({json:data}));
 checks.push('long card: internal scroll, visible bottom actions and fixed handle, background locked');
 await page.setViewportSize({width:390,height:1200});await page.reload();await expect(page.locator('.uc-date-button')).not.toHaveCount(0);await page.locator('.uc-date-button').first().click();
 await expect(page.locator('dialog .uc-card')).toHaveAttribute('aria-busy','false');
 const short=await page.locator('.uc-mobile-dialog-scroll').evaluate(e=>({height:e.clientHeight,content:e.scrollHeight,bottom:e.lastElementChild.getBoundingClientRect().bottom,containerBottom:e.getBoundingClientRect().bottom}));
 assert.ok(short.height>0);assert.ok((await page.getByRole('dialog').boundingBox()).height<1200*2/3);
 await page.screenshot({path:dir+'/short-sheet.png'});await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 checks.push('stable bounded sheet height; long card survives landscape/small height');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:650});await page.reload();await expect(page.locator('.uc-date-button')).not.toHaveCount(0);await trigger.click();
 await expect(dialog).toBeVisible();assert.ok((await dialog.evaluate(e=>getComputedStyle(e).animationName)).includes('uc-sheet-in'));
 await dialog.evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
 await dragHandle(-100);await expect(page.locator('.uc-sheet-handle')).toHaveAttribute('aria-expanded','true');
 await dialog.evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
 await page.context().route('https://calendar.google.com/**',route=>route.fulfill({body:'Calendar destination'}));
 const popupPromise=page.waitForEvent('popup');await dialog.getByRole('link',{name:'Добавить в календарь',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();assert.ok(popup.url().startsWith('https://calendar.google.com/'));await popup.close();
 await expect(dialog).toBeVisible();await page.screenshot({path:dir+'/expanded-sheet.png'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 checks.push('normal motion: opening/expansion/closing animate; add-calendar action works after dragging; reduced motion also covered');
 await page.setViewportSize({width:1440,height:900});await page.reload();await expect(page.locator('.uc-caption')).not.toHaveCount(0);await page.locator('.uc-caption').first().click();
 await expect(page.locator('aside.uc-panel .uc-card')).toBeVisible();await expect(page.locator('dialog')).toHaveCount(0);
 assert.equal(await page.evaluate(()=>document.body.style.position),'');await page.screenshot({path:dir+'/desktop.png'});
 checks.push('desktop retains original side panel and document scroll');
 assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));}
