import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
mkdirSync('artifacts',{recursive:true});
const dir=mkdtempSync(path.resolve('artifacts/backup-test-')),source=path.join(dir,'source.sqlite'),backups=path.join(dir,'copies');
const db=new Database(source);db.pragma('journal_mode=WAL');db.exec('CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES (\'persisted in WAL\')');
function run(keep='2',file=source){return spawnSync(process.execPath,['scripts/backup-db.mjs'],{encoding:'utf8',env:{...process.env,CALENDAR_DATABASE_PATH:file,CALENDAR_BACKUP_DIR:backups,CALENDAR_BACKUPS_KEEP:keep}});}
try {
 assert.equal(run().status,0);
 const original=readdirSync(backups);
 for(const keep of ['0','-1','1.5','NaN','Infinity','']){assert.notEqual(run(keep).status,0);assert.deepEqual(readdirSync(backups),original);}
 const missing=path.join(dir,'missing.sqlite');assert.notEqual(run('2',missing).status,0);assert.equal(existsSync(missing),false);assert.deepEqual(readdirSync(backups),original);
 // Rapid backups must remain independent files, including within the same second.
 assert.equal(run().status,0);assert.equal(readdirSync(backups).length,2);
 db.prepare('INSERT INTO fixture VALUES (?)').run('new data');assert.equal(run().status,0);
 const files=readdirSync(backups).sort();assert.equal(files.length,2);
 for(const file of files){const copy=new Database(path.join(backups,file),{readonly:true});try{assert.equal(copy.pragma('integrity_check',{simple:true}),'ok');assert.ok(copy.prepare('SELECT value FROM fixture').all().some(r=>r.value==='persisted in WAL'));}finally{copy.close();}}
 const last=new Database(path.join(backups,files.at(-1)),{readonly:true});assert.equal(last.prepare('SELECT count(*) AS n FROM fixture').get().n,2);last.close();
 console.log('PASS WAL backup, restore integrity, rotation, unique names, missing source and invalid retention preserve good copies');
} finally {db.close();}
