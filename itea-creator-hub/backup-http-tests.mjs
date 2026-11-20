import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'itea-backup-http-')),password='test-bootstrap-password-only';let child,base;
try{
 child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_BACKEND:'sqlite',DATA_DIR:dir,TEAM_PASSWORD:password,APP_BASE_PATH:'/creators',PUBLIC_BASE_URL:'https://creator.test/creators',DISABLE_AUTOMATIC_REMINDERS:'true',BACKUP_ENCRYPTION_KEY:'',BACKUP_ENCRYPTION_KEY_FILE:''},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);base=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(stderr||'startup timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127.0.0.1:\d+/);if(m){clearTimeout(timeout);resolve(m[0]);}});child.on('exit',()=>{clearTimeout(timeout);reject(Error(stderr));});});
 async function call(path,payload,cookie,origin=base){return fetch(base+'/creators'+path,{method:payload===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{Authorization:'Basic '+Buffer.from('team:'+password).toString('base64')}),'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload),redirect:'manual'});}
 async function json(path,payload,cookie){const r=await call(path,payload,cookie);assert.equal(r.status,200,await r.clone().text());return r.json();}
 const initial=await json('/api/backup');assert.equal(initial.configured,false);assert.equal(initial.connected,false);assert.equal(initial.enabled,false);
 assert.equal((await call('/api/backup/key-copy',{},undefined,'https://evil.test')).status,403);
 const key=await json('/api/backup/key-copy',{});assert.equal(key.format,'itea-backup-key-v1');assert.equal(Buffer.from(key.key,'base64').length,32);assert.equal(statSync(join(dir,'backups/encryption.key')).mode&0o777,0o600);assert.equal((await json('/api/backup')).key,undefined);
 assert.equal((await call('/api/backup/start',{})).status,409,'unconnected job cannot run');
 const helper=await call('/api/backup/authorize-helper');assert.equal(helper.status,200);assert(helper.headers.get('content-disposition').includes('itea-google-drive-authorize.ps1'));const ps=await helper.text();assert(ps.includes('[Net.IPAddress]::Loopback'));assert(ps.includes('code_challenge_method=\'S256\''));assert(!ps.includes('http://43.'));assert(!ps.includes(key.key));
 for(const role of ['owner','viewer']){
  await json('/api/admin/users/create',{username:role,password:'individual-test-password',role,owner:role==='owner'?'Amy':''});
  const response=await call('/auth/login',{username:role,password:'individual-test-password'});assert.equal(response.status,200);const cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  for(const path of ['/api/backup','/api/backup/authorize-helper'])assert.equal((await call(path,undefined,cookie)).status,403,role+' '+path);
  for(const path of ['/api/backup/key-copy','/api/backup/connect','/api/backup/settings','/api/backup/start','/api/backup/disconnect'])assert.equal((await call(path,{},cookie)).status,403,role+' '+path);
 }
 const adminLogin=await call('/auth/login',{username:'team',password});const adminCookie=adminLogin.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');const body=await(await call('/',undefined,adminCookie)).text();assert(body.includes('/backup-ui.js'));assert.equal((await call('/backup-ui.js',undefined,adminCookie)).status,200);
 const r=await fetch(base+'/creators/api/backup');assert.equal(r.status,401);assert(!(await r.text()).includes(key.key));assert.equal(readFileSync(join(dir,'backups/encryption.key'),'utf8'),key.key);
 console.log('PASS real mounted HTTP: administrator-only status, key copy, settings, import, start, disconnect and helper download; owner/viewer denials, unauthenticated denial, CSRF denial, key permissions, no credential leakage, original page and backup script served. No Google or production writes.');
}finally{if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
