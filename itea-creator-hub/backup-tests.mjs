import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,symlinkSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {backupKey,makeArchive,inspectArchive,expiredBackups,imageFiles} from './backup-archive.mjs';
import {createBackups} from './backup.mjs';
import {createBackupSource} from './backup-source.mjs';
import {BackupDrive} from './backup-drive.mjs';

const dir=mkdtempSync(join(tmpdir(),'itea-backup-')),key=randomBytes(32),keyEnv={BACKUP_ENCRYPTION_KEY:key.toString('base64')};
const sample=()=>({source:{backend:'sqlite',consistency:'test transaction',business:{revision:7,state:{people:[{id:'D1',name:'测试达人',tag:'二次元',email:'private@test.invalid',notes:'=BAD()'}],accounts:[{id:'A1',person:'D1'}],projects:[{id:'P1'}],collabs:[{id:'C1',person:'D1',project:'P1',account:'A1'}],posts:[{id:'POST1',collab:'C1'}]}},workflow:{rows:[{id:'MAIL_AUTH',kind:'mail',encrypted:'sensitive-mail-ciphertext'},{id:'USER1',kind:'user',salt:'private-salt',passwordHash:'private-hash'},{id:'ISSUE1',kind:'issue',vouchers:10}]}},images:[],startedAt:'2026-11-20T00:00:00Z',completedAt:'2026-11-20T00:00:01Z'});
let db;
try{
 assert.throws(()=>backupKey('weak'));assert.deepEqual(backupKey(keyEnv.BACKUP_ENCRYPTION_KEY),key);
 const archive=await makeArchive(sample(),key),decoded=await inspectArchive(archive.data,key);
 assert(!archive.data.includes(Buffer.from('private@test.invalid')));assert(!archive.data.includes(Buffer.from('private-hash')));
 assert.deepEqual(JSON.parse(decoded.files.find(f=>f.path==='snapshot.json').content),sample().source);
 const savedArchive=join(dir,'sample.iteabackup'),keyFile=join(dir,'offline-key.json'),extracted=join(dir,'restore-test');writeFileSync(savedArchive,archive.data);writeFileSync(keyFile,JSON.stringify({key:key.toString('base64')}));
 const verified=spawnSync(process.execPath,['tools/verify-backup.mjs','--key-file',keyFile,savedArchive,extracted],{encoding:'utf8'});assert.equal(verified.status,0,verified.stderr);assert.deepEqual(JSON.parse(readFileSync(join(extracted,'snapshot.json'),'utf8')),sample().source);assert.equal(statSync(join(extracted,'snapshot.json')).mode&0o777,0o600);assert.equal(spawnSync(process.execPath,['tools/verify-backup.mjs','--key-file',keyFile,savedArchive,extracted]).status,1,'existing output must not be overwritten');
 assert(decoded.files.find(f=>f.path==='csv/people.csv').content.includes("'=BAD()"));assert.equal(decoded.manifest.counts.workflow,3);
 await assert.rejects(inspectArchive(archive.data,randomBytes(32)),/密钥/);const damaged=Buffer.from(archive.data);damaged[25]^=1;await assert.rejects(inspectArchive(damaged,key),/损坏/);
 const folder='F',instance='I',f=(id,day,patch={})=>({id,name:'itea-'+id+'.iteabackup',createdTime:day+'T00:00:00Z',parents:[folder],appProperties:{iteaBackup:'1',instance,day},...patch});
 const stale=f('old','2026-07-01'),files=[f('today','2026-11-20'),f('yesterday','2026-11-19'),f('month','2026-10-20'),f('octolder','2026-10-01'),stale,f('unrelated','2026-01-01',{appProperties:{instance:'other',iteaBackup:'1',day:'2026-01-01'}}),f('foreignFolder','2026-01-01',{parents:['other']})];
 assert.deepEqual(expiredBackups(files,{folder,instance,daily:2,monthly:2}).map(f=>f.id),['octolder','old']);
 mkdirSync(join(dir,'mail-images'));const imageId='a'.repeat(40);writeFileSync(join(dir,'mail-images',imageId+'.json'),JSON.stringify({id:imageId,project:'P1',base64:'aGVsbG8='}));assert.equal((await imageFiles(dir)).length,1);
 symlinkSync(join(dir,'mail-images',imageId+'.json'),join(dir,'mail-images','b'.repeat(40)+'.json'));await assert.rejects(imageFiles(dir),/图片文件异常/);rmSync(join(dir,'mail-images','b'.repeat(40)+'.json'));
 db=new DatabaseSync(join(dir,'test.sqlite'));db.exec('CREATE TABLE workspace(id INTEGER,revision INTEGER,state TEXT);CREATE TABLE collaboration_workflow(id TEXT,data TEXT);CREATE TABLE audit(id INTEGER,revision INTEGER,changed_at TEXT)');db.prepare('INSERT INTO workspace VALUES(1,7,?)').run(JSON.stringify(sample().source.business.state));for(const row of sample().source.workflow.rows)db.prepare('INSERT INTO collaboration_workflow VALUES(?,?)').run(row.id,JSON.stringify(row));db.exec("INSERT INTO audit VALUES(1,7,'2026-11-20')");
 const source=await createBackupSource({db,dataDir:dir,build:'test'})();assert.equal(source.source.workflow.rows.length,3);assert.equal(source.source.audit.length,1);assert.equal(source.images.length,1);
 let mutations=0;const fakeLark={readEpoch:0,mutationEpoch:0,mutationDepth:0,writeDepth:0,withReadDeadline:fn=>fn(),snapshot:async()=>({...sample().source.business,root:'/base'}),list:async path=>{if(path==='/base/tables')return [{name:'协作工作流',table_id:'workflow'}];if(path.endsWith('/fields'))return [{field_name:'工作流ID'}];mutations++;return [{record_id:'r1',fields:{}}];}};
 const larkSource=createBackupSource({lark:fakeLark,store:{rowsEpoch:0,decodeRows:()=>[{id:'R1'}]},dataDir:dir,build:'test'});assert.equal((await larkSource()).source.workflow.records[0].record_id,'r1');assert.equal(mutations,1);fakeLark.snapshot=async()=>{fakeLark.mutationEpoch++;return {...sample().source.business,root:'/base'}};await assert.rejects(larkSource(),/资料有变化/);
 const credentials={format:'itea-google-drive-connection-v1',clientId:'test.apps.googleusercontent.com',clientSecret:'private-google-secret',refreshToken:'private-refresh-token'};
 let clock=Date.parse('2026-11-20T18:59:00Z'),collects=0,uploads=0,throwRead=false,pruneFail=false,uploadGate=null,uploadedArchive;
 const fakeDrive={accessToken:async()=> 'access',createFolder:async()=>folder,folder:async()=>{},clear:()=>{},upload:async(_t,_f,args)=>{uploads++;uploadedArchive=args.data;if(uploadGate)await uploadGate;return {id:'UPLOAD'+uploads}},list:async()=>{if(pruneFail)throw Error('quota');return[]},trash:async()=>{throw Error('unexpected trash')}};
 const options={dataDir:join(dir,'manager'),env:keyEnv,schedule:false,now:()=>clock,driveFactory:()=>fakeDrive,collect:async()=>{collects++;if(throwRead)throw Error('Lark接口失败（1254607）');return sample();}};
 const manager=createBackups(options);assert.equal(collects,0);assert.equal(manager.status().connected,false);
 await manager.connect(credentials);assert.equal(manager.status().connected,true);assert.equal(manager.status().enabled,false);assert(!JSON.stringify(manager.status()).includes('private-google-secret'));assert(!readFileSync(join(options.dataDir,'backups/google.enc')).includes(Buffer.from('private-refresh-token')));assert.equal(statSync(join(options.dataDir,'backups/google.enc')).mode&0o777,0o600);
 manager.configure({enabled:true,hour:3,daily:30,monthly:12});await manager.tick();assert.equal(collects,0,'02:59 Singapore is before the scheduled hour');clock+=60000;await manager.tick();assert(manager.status().active);assert.throws(()=>manager.start(),/正在进行/);await manager.settled();assert.equal(uploads,1);assert.equal(manager.status().history[0].status,'success');await inspectArchive(uploadedArchive,key);await manager.tick();assert.equal(collects,1,'successful same-day backup is not repeated');
 const restored=createBackups(options);assert(restored.status().connected);assert.equal(restored.status().history[0].status,'success');assert.equal(restored.status().enabled,true);
 throwRead=true;manager.start();await manager.settled();assert.equal(manager.status().history[0].status,'failed');assert.equal(uploads,1,'partial or failed source must not upload');assert(manager.status().history[0].message.includes('尚未准备'));assert.equal(manager.status().lastSuccess.fileId,'UPLOAD1');throwRead=false;
 pruneFail=true;manager.start();await manager.settled();assert.equal(manager.status().history[0].status,'success');assert(manager.status().history[0].warning.includes('清理失败'));pruneFail=false;
 // Three scheduled attempts, at least an hour apart; status reads never collect business data.
 clock+=86400000;throwRead=true;await manager.tick();await manager.settled();const attempts=collects;await manager.tick();assert.equal(collects,attempts);for(let i=0;i<3;i++){clock+=3600000;await manager.tick();await manager.settled();}assert.equal(collects,attempts+2);for(let i=0;i<10;i++)manager.status();assert.equal(collects,attempts+2);
 const pending=[];const interrupted=createBackups({...options,dataDir:join(dir,'interrupted'),detach:fn=>pending.push(fn)});await interrupted.connect(credentials);interrupted.start();const restarted=createBackups({...options,dataDir:join(dir,'interrupted')});assert.equal(restarted.status().history[0].status,'interrupted');assert(!restarted.status().lastSuccess);assert(!restarted.status().active);
 manager.disconnect();assert(!createBackups(options).status().connected);assert(!createBackups(options).status().error,'disconnect survives restart cleanly');
 const localKey=createBackups({...options,env:{},dataDir:join(dir,'localkey')});assert(!localKey.status().configured);const copy=localKey.keyCopy();assert.equal(copy.key.length,44);assert.equal(createBackups({...options,env:{},dataDir:join(dir,'localkey')}).keyCopy().key,copy.key);assert.equal(statSync(join(dir,'localkey/backups/encryption.key')).mode&0o777,0o600);
 writeFileSync(join(dir,'localkey/backups/status.json'),'{broken');const broken=createBackups({...options,env:{},dataDir:join(dir,'localkey')});assert(broken.status().error.includes('状态文件损坏'));assert.throws(()=>broken.keyCopy(),/损坏/);
 // Provider protocol: token caching, resumable transfer, reconciled unknown outcome, checksum rejection.
 let tokenCalls=0,reconciles=0,transfer='ok',md5=createHash('md5').update(archive.data).digest('hex');
 const drive=new BackupDrive({clientId:'test',clientSecret:'secret',fetchImpl:async(url,o)=>{
  assert.equal(o.redirect,'error');if(url.endsWith('/token')){tokenCalls++;return Response.json({access_token:'access',expires_in:3600});}
  assert.equal(o.headers.Authorization,'Bearer access');if(url.includes('generateIds'))return Response.json({ids:['ID1']});
  if(url.includes('uploadType=resumable')){assert.equal(JSON.parse(o.body).id,'ID1');return new Response(null,{status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=private-session'}});}
  if(url.includes('upload_id=')){assert.equal(o.method,'PUT');assert.deepEqual(o.body,archive.data);if(transfer==='lost')throw Error('network');return Response.json({id:'ID1',size:String(archive.data.length),md5Checksum:transfer==='bad'?'wrong':md5});}
  if(url.includes('/files/ID1')){reconciles++;return Response.json({id:'ID1',size:String(archive.data.length),md5Checksum:md5});}throw Error('unexpected URL');
 }});
 await Promise.all([drive.accessToken('refresh'),drive.accessToken('refresh')]);assert.equal(tokenCalls,1);const args={data:archive.data,name:'itea-test.iteabackup',instance,day:'2026-11-20',job:'test-job'};await drive.upload('refresh',folder,args);transfer='lost';await drive.upload('refresh',folder,args);assert.equal(reconciles,1);transfer='bad';await assert.rejects(drive.upload('refresh',folder,args),/校验值/);
 const invalid=new BackupDrive({fetchImpl:async()=>Response.json({error:'invalid_grant'},{status:400})});await assert.rejects(invalid.accessToken('bad'),/授权已失效/);
 console.log('PASS encrypted archives and round-trip integrity, CSV safety, image guards, transactional SQLite and raw Lark export, concurrent-write refusal, app-scoped retention, encrypted credentials, daily Singapore schedule and bounded retry, no duplicate jobs, interrupted jobs, resumable Drive upload and lost-response reconciliation, safe failures, local offline key initialization. No live providers or production writes.');
}finally{db?.close();rmSync(dir,{recursive:true,force:true});}
