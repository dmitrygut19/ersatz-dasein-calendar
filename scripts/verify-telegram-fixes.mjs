import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const base=process.env.REVIEW_URL||'http://127.0.0.1:4391';
const before=process.argv.includes('--before'),dir=`artifacts/telegram-review/${before?'before':'after'}`;
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base+'/#'+(process.env.REVIEW_TOKEN||'telegram-review-local-only-20261120'));await page.waitForURL('**/admin');
 for(const width of [320,390,430,980,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/admin');
  await expect(page.locator('.event-group-card').first()).toBeVisible();
  if(!before)await expect(page.locator('.missing-cover').first()).toBeVisible();
  await page.screenshot({path:`${dir}/admin-list-${width}.png`,fullPage:true});
  const rows=await page.locator('.event-list-identity').evaluateAll(els=>els.map(e=>({width:e.clientWidth,text:e.lastElementChild.clientWidth,title:e.querySelector('.event-title').textContent})));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  results.push({width,rows,overflow});if(!before){assert.equal(overflow,false);assert.ok(rows.every(r=>r.text>=Math.min(160,width-80)),JSON.stringify(rows));}
  await page.locator('.admin-preview').screenshot({path:`${dir}/admin-grid-${width}.png`});
  if(!before && width<=700){
   const empty=page.locator('.uc-admin-empty').first();await expect(empty).toBeVisible();
   assert.ok((await empty.boundingBox()).height<=100);await empty.click();
   await expect(page.locator('.editor-panel')).toBeVisible();
   await expect(page.locator('#event-date')).toHaveValue(await empty.getAttribute('aria-label').then(v=>v.slice(-10)));
   if(width===390){
    await page.getByLabel('Название',{exact:true}).fill('[Тест] Создание из дня');
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/events')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Добавить событие',exact:true}).click();
    const response=await saved;assert.ok(response.ok());const {event}=await response.json();
    await expect(page.getByRole('button',{name:'[Тест] Создание из дня',exact:true})).toBeVisible();
    assert.ok((await page.request.delete(base+'/api/events/'+event.id,{headers:{Origin:base}})).ok());
   }
  }
 }
 if(!before){
  await page.goto(base+'/admin');await page.getByRole('button',{name:'Выпуски серии',exact:true}).first().click();
  await expect(page.locator('.group-release').first()).toBeVisible();await page.locator('.group-release').first().click();
  await expect(page.getByRole('button',{name:'Настройки события',exact:true})).toBeVisible();
  await page.goto(base+'/admin?screen=appearance-type');
  const names=['Жречество — Секвенсоры','Техножречество','Гемблинг','Атемпораль','Наймиты и капиталисты','Студенты и камрады'];
  for(const name of names){const option=page.getByRole('button',{name:'Выбрать обложку '+name,exact:true});await option.click();await expect(option).toHaveAttribute('aria-pressed','true');}
  await page.locator('.appearance-editor').screenshot({path:`${dir}/lodge-cover-gallery.png`});
  const covers=['sequencers','technopriests','gambling','atemporal','ship','students-comrades'];
  for(const name of covers){
   const coverPath=`/assets/lodges/${name}.svg`;
   const response=await page.request.post(base+'/api/types',{headers:{Origin:base},data:{name:'[Тест] '+name,accessLabel:'Все',points:0,theme:'ordinary',coverPath}});
   assert.ok(response.ok(),await response.text());const {type}=await response.json();
   assert.equal(type.coverPath,coverPath);
   const asset=await page.request.get(base+coverPath);assert.ok(asset.ok());assert.match(await asset.text(),/<svg/);
   assert.deepEqual(await asset.body(),readFileSync('public'+coverPath));
   assert.ok((await page.request.delete(base+'/api/types/'+type.id,{headers:{Origin:base}})).ok());
  }
  results.push({seriesActions:true,createFromDay:true,lodgeCovers:6});
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/calendar');
 const response=await page.request.get(base+'/api/calendar?from=2026-11-01&to=2026-11-30');
 const data=await response.json();writeFileSync(`${dir}/data.json`,JSON.stringify(data,null,2));
 // Controlled public data: same API shape, two records on day 12, long and locked states.
 const sample=data.events[0];assert.ok(sample);
 const events=[{...sample,id:'review-a',date:'2026-11-12',title:'Закрытая встреча',canFollow:false,description:'Закрытая встреча',url:''},
 {...sample,id:'review-b',date:'2026-11-12',title:'Доступная встреча с длинным описанием',canFollow:true,description:'Подробное описание встречи. '.repeat(300),url:'https://example.org/meeting',calendarUrl:'https://example.org/calendar'},
 {...sample,id:'review-c',date:'2026-11-19',title:'Другая встреча',canFollow:true,cover:'/assets/lodges/sequencers.svg',description:'Короткое описание',url:'https://example.org/meeting'}];
 await page.route('**/api/calendar?**',async route=>{await new Promise(r=>setTimeout(r,120));await route.fulfill({json:{...data,events}});});
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.goto(base+'/calendar');
  const day=page.locator('.uc-date-button').first();await day.click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.locator('dialog .uc-card')).toHaveAttribute('aria-busy','false');
  await page.screenshot({path:`${dir}/public-locked-${width}.png`});
  const next=dialog.getByRole('button',{name:'Следующее событие в этот день'});
  await next.scrollIntoViewIfNeeded();
  const hit=await next.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});
  results.push({width,pagerHit:hit,sheetHeight:(await dialog.boundingBox()).height});
  if(!before){
   assert.equal(hit,true,'Locked overlay must not intercept the day pager');
   const h=(await dialog.boundingBox()).height;await next.click();await expect(dialog.locator('.uc-card-name')).toHaveText(events[1].title);
   await expect(dialog.locator('.uc-card')).toHaveAttribute('aria-busy','false');
   assert.ok(Math.abs((await dialog.boundingBox()).height-h)<2,'Switching cards must preserve sheet height');
   await dialog.getByRole('link',{name:'Добавить в календарь',exact:true}).scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.uc-mobile-dialog-scroll').evaluate(e=>e.scrollTop>0));
   await expect(dialog.locator('.uc-sheet-handle')).toBeInViewport();
   await page.screenshot({path:`${dir}/public-long-${width}.png`});
   await dialog.getByRole('button',{name:'Предыдущее событие в этот день'}).click();
   await expect(dialog.locator('.uc-card-name')).toHaveText(events[0].title);
   await expect.poll(()=>page.locator('.uc-mobile-dialog-scroll').evaluate(e=>e.scrollTop)).toBe(0);
  }
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  if(!before){
   for(let i=0;i<3;i++){
    await page.locator('.uc-date-button').last().click();await expect(dialog).toBeVisible();
    await expect(dialog.locator('.uc-card')).toHaveAttribute('aria-busy','false');
    if(i===0)await page.screenshot({path:`${dir}/public-svg-cover-${width}.png`});
    const handle=page.locator('.uc-sheet-handle'),b=await handle.boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+100,{steps:10});await page.mouse.up();
    await expect(dialog).toHaveCount(0);assert.equal(await page.evaluate(()=>document.body.style.position),'');
   }
   await day.click();await page.mouse.click(width/2,5);await expect(dialog).toHaveCount(0);
  }
 }
 if(!before){
  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const mp=await mobile.newPage();await mp.route('**/api/calendar?**',r=>r.fulfill({json:{...data,events}}));
  await mp.goto(base+'/calendar');await mp.locator('.uc-date-button').first().tap();
  const md=mp.getByRole('dialog');await expect(md).toBeVisible();await md.getByRole('button',{name:'Следующее событие в этот день'}).tap();
  await expect(md.locator('.uc-card-name')).toHaveText(events[1].title);
  const cdp=await mobile.newCDPSession(mp);
  async function swipe(x,y,end){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*i/12}]});await new Promise(r=>setTimeout(r,20));}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const content=await mp.locator('.uc-mobile-dialog-scroll').boundingBox();
  await swipe(195,content.y+content.height-40,content.y+40);
  await expect.poll(()=>mp.locator('.uc-mobile-dialog-scroll').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await expect(md).toBeVisible();await expect(mp.locator('.uc-sheet-handle')).toHaveAttribute('aria-expanded','false');
  for(const delta of [-100,100,100]){
   const h=await mp.locator('.uc-sheet-handle').boundingBox();await swipe(195,h.y+h.height/2,h.y+h.height/2+delta);
  }
  await expect(md).toHaveCount(0);assert.equal(await mp.evaluate(()=>document.body.style.position),'');
  results.push({touch:true,contentScrollIndependent:true,dragExpandCollapseClose:true});await mobile.close();
 }
 // Desktop-site approximation: touch-capable Android UA with a 980 CSS px layout viewport.
 const touch=await browser.newContext({viewport:{width:980,height:1740},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36'});
 await touch.addCookies(await page.context().cookies());const tp=await touch.newPage();await tp.goto(base+'/admin');
 await expect(tp.locator('.event-group-card').first()).toBeVisible();await tp.screenshot({path:`${dir}/android-desktop-site.png`,fullPage:true});
 const desktopSite=await tp.evaluate(()=>({width:innerWidth,touch:matchMedia('(hover:none)').matches,overflow:document.documentElement.scrollWidth>innerWidth}));
 results.push({desktopSite});if(!before)assert.equal(desktopSite.overflow,false);await touch.close();
 assert.deepEqual(errors,[]);
 writeFileSync(`${dir}/report.json`,JSON.stringify({results,errors,physicalPhone:false},null,2));
 console.log(JSON.stringify({dir,results,errors},null,2));
}finally{await browser.close();}
