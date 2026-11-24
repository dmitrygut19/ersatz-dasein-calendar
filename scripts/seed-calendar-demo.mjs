import Database from 'better-sqlite3';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
export const reviewFile=path.resolve(process.env.CALENDAR_PUBLIC_DEMO_DIRECTORY ?? 'data/public-demo','calendar.sqlite');
export function seedPublicCalendar(file=reviewFile,remove=false){
 if(process.env.CALENDAR_PUBLIC_DEMO!=='1'||path.resolve(file)!==reviewFile)throw Error('Only the explicitly enabled public demo database is supported.');
 mkdirSync(path.dirname(file),{recursive:true});
 const db=new Database(file);db.pragma('foreign_keys=ON');
 try{
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  for(const name of readdirSync('drizzle').filter(s=>s.endsWith('.sql')).sort()){
   if(!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name))db.transaction(()=>{db.exec(readFileSync(path.join('drizzle',name),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,Date.now());})();
  }
  const tokens=JSON.parse(readFileSync('design/tokens.json','utf8'));
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date()),now=Date.now();
  db.transaction(()=>{
   for(const table of ['event_type_usage','type_suggestions','type_skips'])db.prepare(`DELETE FROM ${table} WHERE event_id IN(SELECT id FROM events WHERE substr(id,1,14)='demo-calendar-')`).run();
   for(const table of ['events','participants','lodges','participant_groups','event_types'])db.prepare(`DELETE FROM ${table} WHERE substr(id,1,14)='demo-calendar-'`).run();
   if(remove)return;
   const oldIds=['demo-congress-series','demo-saturnalia-series','demo-congress-sunday','demo-saturnalia-special','demo-title-medium','demo-title-long','demo-platform-youtube'];
   for(const id of oldIds){for(const table of ['event_type_usage','type_suggestions','type_skips'])db.prepare(`DELETE FROM ${table} WHERE event_id=?`).run(id);db.prepare('DELETE FROM events WHERE id=?').run(id);}
   const typeInsert=db.prepare("INSERT INTO event_types(id,name,access_label,cover_path,theme,created_at,updated_at) VALUES(?,?,'Все',?,'ordinary',?,?)");
   for(const [id,title,cover] of [['congress','Конгресс','columns'],['arena','Арена','philosopher'],['sat','Сатурналии','saturnalia']])typeInsert.run('demo-calendar-'+id,title,'/assets/event-covers/community-demo/'+cover+'.png',now,now);
   const directory=db.prepare("SELECT id,name FROM lodges WHERE substr(id,1,14)<>'demo-calendar-' ORDER BY id").all();
   if(!directory.length)throw Error('The lodge directory is empty');
   const insert=db.prepare('INSERT INTO events(id,title,description,url,start_date,start_time,end_time,type_id,status,settings,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
   for(const [id,day,locked] of [['open',17,false],['locked',24,true]]){
    insert.run('demo-calendar-'+id,'Сатурналии','Командный конкурс: корифеи собирают команды, дизайнеры проходят этапы и борются за победу.','https://meet.jit.si/ersatz-saturnalia',today.slice(0,8)+String(day),'20:00','21:00','demo-calendar-sat','confirmed',JSON.stringify({requiresAuth:locked,coverPath:'/assets/event-covers/community-demo/saturnalia.png',accessLabel:'Все',communityEvent:false,topicLodgeId:directory[day===17?0:1].id,affiliationDegree:'III',appearance:{theme:'ordinary',start:tokens.eventTheme.saturnalia.backgroundStart,end:tokens.eventTheme.saturnalia.backgroundEnd,text:tokens.eventTheme.saturnalia.text,accent:'#AF5120',bordered:true,coverMode:'poster',buttonBackground:'#2B2121',buttonText:'#FAF2ED',buttonAccent:'#AF5120'}}),now,now);
   }
   const accents=['#AF5120','#3E7C5A','#6B6461'];
   const titles=Array.from({length:22},(_,i)=>['Конгресс','Арена','Сатурналии'][i%3]);
   const days=[1,2,4,6,8,9,10,12,13,14,15,16,17,18,20,21,22,23,24,26,27,28];
   for(let index=0;index<titles.length;index++){
    const cover='/assets/event-covers/community-demo/'+(titles[index]==='Сатурналии'?'saturnalia':titles[index]==='Арена'?'lyre':index%2?'columns':'philosopher')+'.png';
    const start=index%2?'19:00':'12:00',end=index%2?'20:00':'13:00';
    const appearance={theme:'ordinary',start:'#FFFFFF',end:'#FFFFFF',text:'#2B2121',accent:accents[index%3],bordered:true,coverMode:'poster',buttonBackground:'#2B2121',buttonText:'#FAF2ED',buttonAccent:'#AF5120'};
    if(titles[index]==='Сатурналии'){appearance.start=tokens.eventTheme.saturnalia.backgroundStart;appearance.end=tokens.eventTheme.saturnalia.backgroundEnd;appearance.text=tokens.eventTheme.saturnalia.text;}
    insert.run('demo-calendar-extra-'+index,titles[index],titles[index]+': встречаемся, обсуждаем идеи, делимся опытом и планируем совместные проекты.','https://meet.jit.si/ersatz-community-demo',today.slice(0,8)+String(days[index]).padStart(2,'0'),start,end,['demo-calendar-congress','demo-calendar-arena','demo-calendar-sat'][index%3],'confirmed',JSON.stringify({requiresAuth:index%4===1,accessLabel:(index===0||index%4===2)?directory[index%directory.length].name:'Все',audienceLodgeIds:(index===0||index%4===2)?[directory[index%directory.length].id]:[],communityEvent:false,topicLodgeId:directory[index%directory.length].id,affiliationDegree:['I','II','III'][Math.floor(index/directory.length)%3],coverPath:cover,appearance}),now,now);
   }

  })();
  return {today,count:db.prepare("SELECT COUNT(*) n FROM events WHERE substr(id,1,14)='demo-calendar-'").get().n};
 }finally{db.close();}
}
