// Render start: seed the (ephemeral on free tier) database, then launch the server.
// Seeding is idempotent — safe on every boot.
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { seedDemo } from './seed.mjs';
import {seedPublicCalendar} from './seed-calendar-demo.mjs';
import {seedSharedCalendar} from './seed-shared-calendar.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

// This launcher serves the review site. Explicit 0 restores the protected mode.
if (process.env.CALENDAR_DEMO_REMOTE === '1') process.env.CALENDAR_PUBLIC_DEMO ??= '1';
const file = process.env.CALENDAR_PUBLIC_DEMO === '1'
  ? path.resolve(process.env.CALENDAR_PUBLIC_DEMO_DIRECTORY ?? 'data/public-demo', 'calendar.sqlite')
  : path.resolve(process.env.CALENDAR_DATABASE_PATH ?? 'data/experiment.sqlite');
const shared=process.env.CALENDAR_PUBLIC_DEMO==='1' && process.env.CALENDAR_SHARED_CALENDAR!=='0' && existsSync('config/community-calendar.json');
if(shared){
  const config=JSON.parse(readFileSync('config/community-calendar.json','utf8'));
  process.env.CALENDAR_SHARED_CALENDAR='1';process.env.CALENDAR_SHARED_FEED_URL=config.url;
  process.env.CALENDAR_SHARED_DATABASE_PATH ??= path.resolve(path.dirname(file),'../shared-community/calendar.sqlite');
  seedSharedCalendar(process.env.CALENDAR_SHARED_DATABASE_PATH,config);
  // Both the admin and the public calendar use this real-source database.
  // The previous demo file is left intact, but is no longer served here.
}else{
  if (!file.includes(`${path.sep}calendar-app${path.sep}`)) seedDemo(file);
  if(process.env.CALENDAR_PUBLIC_DEMO==='1')seedPublicCalendar(file);
}
await import('../dist/server/entry.mjs');
if(shared){
  // Keep the checked snapshot available even if Google is temporarily offline.
  const origin=`http://127.0.0.1:${process.env.PORT||4321}`;
  for(let attempt=0;attempt<50;attempt++){
    try{await fetch(origin+'/api/calendar/sync',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'sync'}),signal:AbortSignal.timeout(25000)});break;}
    catch{await new Promise(resolve=>setTimeout(resolve,100));}
  }
}
