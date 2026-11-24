import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {seedSharedCalendar} from './seed-shared-calendar.mjs';
// Local launch with the real community calendar (config snapshot + Google iCal refresh).
const file=path.resolve('artifacts/telegram-review/connected-calendar.sqlite');
seedSharedCalendar(file,JSON.parse(readFileSync('config/community-calendar.json','utf8')));
const token=randomBytes(32).toString('hex');
const port=process.env.PORT||'4390';
const server=spawn(process.execPath,['dist/server/entry.mjs'],{stdio:'inherit',env:{
 ...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:port,
 CALENDAR_ADMIN_OPEN:'0',CALENDAR_ALLOW_REMOTE:'0',CALENDAR_PUBLIC_DEMO:'0',CALENDAR_DEMO_REMOTE:'0',CALENDAR_EXPERIMENT:'local',
 CALENDAR_EXPERIMENT_TOKEN:token,CALENDAR_DATABASE_PATH:file,
}});
console.log(`Local review: http://127.0.0.1:${port}/#${token}`);
{
 const origin=`http://127.0.0.1:${port}`;
 for(let attempt=0;attempt<50;attempt++){
  try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}
 }
 try{
  const response=await fetch(origin+'/api/integration',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'sync'}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const {integration}=await response.json();console.log('Configured calendar sync:',integration.state);
 }catch{
  console.error('Google refresh unavailable; retained the connected-calendar snapshot. See integration status in admin.');
 }
}
process.on('SIGINT',()=>server.kill());process.on('SIGTERM',()=>server.kill());
server.on('exit',code=>{process.exitCode=code??1;});
