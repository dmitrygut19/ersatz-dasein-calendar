import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

mkdirSync('artifacts',{recursive:true});
const directory=mkdtempSync(path.resolve('artifacts/mentor-native-'));
const token=randomBytes(32).toString('hex');
const socket=createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['dist/server/entry.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),CALENDAR_EXPERIMENT:'local',CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:path.join(directory,'test.sqlite')},stdio:'ignore'});
let browser;
try {
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  const api=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
  const type=(await api('/api/types',{name:'Исходная кнопка',accessLabel:'Все',theme:'ordinary'})).type;
  const now=new Date(), date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-15`;
  await api('/api/events',{title:'Исходная кнопка',date,start:'12:00',end:'13:00',typeId:type.id,url:'https://mentors.ersdsgn.club/'});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const source=await context.newPage(), local=await context.newPage();
  await Promise.all([source.goto('https://mentors.ersdsgn.club/',{waitUntil:'domcontentloaded'}),local.goto(base+'/calendar')]);
  await local.locator('.uc-caption').filter({hasText:'Исходная кнопка'}).click();
  await Promise.all([source.evaluate(()=>document.fonts.ready),local.evaluate(()=>document.fonts.ready)]);
  const reference=source.locator('.app-button--v2').first(), target=local.locator('.uc-card-btn');
  const properties=button=>{
    const pick=(element,keys)=>{const css=getComputedStyle(element);return Object.fromEntries(keys.map(key=>[key,css[key]]));};
    return {
      root:pick(button,['height','width','maxWidth','fontSize','fontWeight','lineHeight','letterSpacing','backgroundColor','color','padding','overflow','display','alignItems','justifyContent']),
      text:pick(button.querySelector('.app-button__text'),['fontSize','fontWeight','lineHeight','letterSpacing','padding','zIndex']),
      inner:pick(button.querySelector('.app-button__inner'),['height','width','overflow','display','position']),
      decor:[...button.querySelectorAll('.app-button__decor')].map(element=>pick(element,['height','width','position','bottom','zIndex','transitionDuration','objectFit','transform'])),
      border:pick(button.querySelector('.app-button__border'),['height','width','maxWidth','objectFit','zIndex','transform']),
      structure:[...button.children].map(child=>({tag:child.tagName,className:child.className})),
    };
  };
  await source.mouse.move(0,0); await local.mouse.move(0,0);
  await expect(target).toBeEnabled();
  const actual=await target.evaluate(properties), expected=await reference.evaluate(properties);
  assert.deepEqual(actual,expected,'Native button geometry, typography, layers and transition must match mentors');
  const assets=[];
  for(const name of ['button-decor-left.png','button-decor-right.png','button-border.png']){
    const response=await context.request.get('https://mentors.ersdsgn.club/icons/'+name); assert.equal(response.status(),200);
    const digest=value=>createHash('sha256').update(value).digest('hex');
    assert.equal(digest(await response.body()),digest(readFileSync('public/assets/mentors/buttons/'+name)));
    assets.push(name);
  }
  await reference.hover(); await source.waitForTimeout(400);
  await target.hover(); await local.waitForTimeout(400);
  const hover=await target.evaluate(properties), referenceHover=await reference.evaluate(properties);
  assert.deepEqual(hover.decor,referenceHover.decor,'Hover motion must match the live source');
  await target.screenshot({path:path.join(directory,'local-button.png')});
  await reference.screenshot({path:path.join(directory,'source-button.png')});
  const result={source:'https://mentors.ersdsgn.club/',geometry:actual,hover:hover.decor,assets,passed:true};
  writeFileSync(path.join(directory,'report.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({directory,passed:true,assets,geometry:actual.root},null,2));
}finally{await browser?.close();const exited=once(server,'exit');server.kill();await exited;}
