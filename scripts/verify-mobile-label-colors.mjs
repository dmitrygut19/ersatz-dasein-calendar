import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.CARD_REVIEW_URL||'http://127.0.0.1:4397';
const dir=process.env.LABEL_COLOR_REPORT_DIR||'artifacts/mobile-label-colors';
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],screens=[];
try{
 const page=await browser.newPage({reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 const month=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'}).slice(0,7);
 const data=await (await fetch(`${base}/api/calendar?from=${month}-01&to=${month}-31`)).json();
 assert.ok(data.events.length);
 await page.route('**/api/calendar?**',route=>route.fulfill({json:data}));
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.goto(base+'/calendar');await expect(page.locator('.uc-cell-label').first()).toBeVisible();
  const labels=await page.locator('.uc-cell-event').evaluateAll(es=>es.map(e=>{const l=e.querySelector('.uc-cell-label'),s=getComputedStyle(l);return {title:l.textContent,token:e.dataset.mobileColor,bg:s.backgroundColor,color:s.color,h:l.getBoundingClientRect().height,padding:s.padding,ellipsis:s.textOverflow};}));
  const colors=new Map();for(const l of labels){assert.equal(l.h,16);assert.equal(l.ellipsis,'ellipsis');if(colors.has(l.token))assert.equal(colors.get(l.token),l.bg);colors.set(l.token,l.bg);}
  assert.ok(colors.size>=4);assert.equal(new Set(colors.values()).size,colors.size);
  assert.ok(labels.filter(l=>/^Онбординг/u.test(l.title)).every(l=>l.token==='gray-700'));
  // Resolve color-mix into sRGB through canvas, then check actual text contrast.
  const contrasts=await page.locator('.uc-cell-label').evaluateAll(es=>{
   const ctx=document.createElement('canvas').getContext('2d');
   const rgb=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
   const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   return es.map(e=>{const s=getComputedStyle(e),a=lum(rgb(s.color)),b=lum(rgb(s.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  });assert.ok(Math.min(...contrasts)>=4.5);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${dir}/${width}.png`,fullPage:true});screens.push({width,labels,minContrast:Math.min(...contrasts)});
  await page.locator('.uc-date-button').first().click();await expect(page.locator('dialog[open] .uc-card')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);
 }
 checks.push('320/390/430: stable lodge grouping, neutral onboarding, distinct backgrounds, text contrast >=4.5, unchanged 16px labels/ellipsis, no overflow, card opens/closes');
 // Same topic, changed title/degree/access/custom colour must keep its identity.
 const sample=structuredClone(data),first=sample.events[0];sample.events=Array.from({length:4},(_,i)=>({...first,id:`color-test-${i}`,title:['One','Two','Onboarding label with a lodge','Unknown'][i],topicLodgeId:i===3?'unmapped-lodge':'tech-priesthood',typeName:i===2?'Онбординг-сессия':first.typeName,canFollow:i%2===0,affiliationDegree:i?'III':'I',appearance:{...first.appearance,accent:i?'#000000':'#FFFFFF'}}));
 await page.route('**/api/calendar?**',route=>route.fulfill({json:sample}));await page.reload();await expect(page.locator('.uc-cell-label')).toHaveCount(4);
 const tokens=await page.locator('.uc-cell-event').evaluateAll(es=>es.map(e=>e.dataset.mobileColor));assert.equal(new Set(tokens.slice(0,3)).size,1);assert.equal(tokens[3],'gray-700');
 sample.events[0].topicLodgeId=null;sample.events[0].communityEvent=true;sample.events[0].typeName='Общая встреча';sample.events[1].topicLodgeId=null;sample.events[1].communityEvent=true;sample.events[1].typeName='Онбординг-сессия';
 await page.reload();await expect(page.locator('.uc-cell-event').first()).toHaveAttribute('data-mobile-color','copper-600');await expect(page.locator('.uc-cell-event').nth(1)).toHaveAttribute('data-mobile-color','gray-700');
 checks.push('topic outranks title/access/degree/custom appearance; unknown topics neutral; common meeting copper; onboarding neutral');
 await page.unrouteAll();await page.setViewportSize({width:1440,height:900});await page.goto(base+'/calendar');await expect(page.locator('.uc-caption').first()).toBeVisible();await expect(page.locator('[data-mobile-color]')).toHaveCount(0);await page.screenshot({path:dir+'/desktop.png'});
 checks.push('desktop has its existing cover grid and no mobile colour bindings');assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({checks,errors,screens},null,2));console.log(JSON.stringify({checks,errors},null,2));}
