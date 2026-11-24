import Database from 'better-sqlite3';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
export function seedSharedCalendar(file,config){
  mkdirSync(path.dirname(file),{recursive:true});const db=new Database(file);db.pragma('foreign_keys=ON');
  try{
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)');
    for(const name of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())if(!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name))db.transaction(()=>{db.exec(readFileSync(path.join('drizzle',name),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,Date.now());})();
    if(db.prepare("SELECT 1 FROM calendar_settings WHERE key='shared_calendar_initialized'").get()){
      applyConfiguredLodgeCovers(db,config);applyConfiguredFullLodgeCovers(db,config);return;
    }
    const now=Date.now();
    db.transaction(()=>{
      db.exec('DELETE FROM event_type_usage; DELETE FROM type_suggestions; DELETE FROM type_skips; DELETE FROM import_matches; DELETE FROM events; DELETE FROM external_sources; DELETE FROM event_types;');
      const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));};
      for(const type of config.types)insert('event_types',type);
      for(const event of config.events){insert('events',event);insert('event_type_usage',{event_id:event.id,event_type_id:event.type_id});}
      for(const rule of config.rules)for(const lodgeId of rule.settings.audienceLodgeIds){
        const lodge=db.prepare('SELECT name FROM lodges WHERE id=?').get(lodgeId);const id='shared-lodge-'+lodgeId;
        db.prepare('INSERT INTO participant_groups(id,name,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(name) DO NOTHING').run(id,lodge.name,now,now);
        db.prepare('UPDATE lodges SET group_id=(SELECT id FROM participant_groups WHERE name=?) WHERE id=?').run(lodge.name,lodgeId);
      }
      insert('external_sources',{id:'shared-community-calendar',provider:'google',calendar_id:config.calendarId,calendar_summary:'Календарь сообщества',status:'connected',tokens:JSON.stringify({feedUrl:config.url}),last_sync_at:null,last_sync_error:null,created_at:now,updated_at:now});
      insert('calendar_settings',{key:'external_event_defaults',value:JSON.stringify(config.rules)});
      insert('calendar_settings',{key:'shared_calendar_initialized',value:'1'});
    })();
    applyConfiguredLodgeCovers(db,config);
    applyConfiguredFullLodgeCovers(db,config);
  }finally{db.close();}
}

// Apply the reviewed explicit type covers once, retaining custom and release covers.
export function applyConfiguredLodgeCovers(db,config){
  if(db.prepare("SELECT 1 FROM calendar_settings WHERE key='lodge_covers_20261120'").get())return;
  db.transaction(()=>{
    for(const type of config.types){
      if(!/^\/assets\/(lodges|lodge-covers)\/(sequencers|technopriests|gambling|atemporal|ship|students-comrades)\.svg$/.test(type.cover_path||''))continue;
      db.prepare("UPDATE event_types SET cover_path=?,updated_at=? WHERE id=? AND (cover_path IS NULL OR cover_path='')").run(type.cover_path,Date.now(),type.id);
    }
    db.prepare('INSERT INTO calendar_settings(key,value) VALUES(?,?)').run('lodge_covers_20261120','1');
  })();
}

export function applyConfiguredFullLodgeCovers(db,config){
  if(db.prepare("SELECT 1 FROM calendar_settings WHERE key='full_lodge_covers_20261120'").get())return;
  const eligible=config.types.filter(type=>/^\/assets\/lodge-covers\/(sequencers|technopriests|gambling|atemporal|ship|students-comrades)\.svg$/.test(type.cover_path||''));
  if(!eligible.length)return;
  db.transaction(()=>{
    for(const type of eligible){
      const previous=type.cover_path.replace('/lodge-covers/','/lodges/');
      db.prepare("UPDATE event_types SET cover_path=?,updated_at=? WHERE id=? AND (cover_path IS NULL OR cover_path='' OR cover_path=?)").run(type.cover_path,Date.now(),type.id,previous);
    }
    db.prepare('INSERT INTO calendar_settings(key,value) VALUES(?,?)').run('full_lodge_covers_20261120','1');
  })();
}
