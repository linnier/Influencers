import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync,chmodSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {backupKey,seal,unseal,sha256,makeArchive,expiredBackups} from './backup-archive.mjs';
import {BackupDrive} from './backup-drive.mjs';

const fail=(text,status=400)=>{throw Object.assign(Error(text),{status});};
export function singaporeDay(time){return new Date(time+8*3600000).toISOString().slice(0,10);}
export function createBackups({dataDir,collect,env=process.env,now=Date.now,driveFactory=options=>new BackupDrive(options),schedule=true,detach=fn=>setImmediate(fn)}){
 const dir=join(dataDir,'backups');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 const configPath=join(dir,'status.json'),credentialPath=join(dir,'google.enc');
 let stateError='',state={version:1,instance:randomUUID(),enabled:false,hour:3,daily:30,monthly:12,history:[],attempts:0};
 if(existsSync(configPath)){
  try{const saved=JSON.parse(readFileSync(configPath,'utf8'));if(saved.version!==1||typeof saved.instance!=='string'||!saved.instance||!Array.isArray(saved.history)||!Number.isInteger(saved.hour)||saved.hour<0||saved.hour>23||!Number.isInteger(saved.daily)||saved.daily<1||saved.daily>365||!Number.isInteger(saved.monthly)||saved.monthly<1||saved.monthly>60)throw Error();state=saved;}catch{stateError='备份状态文件损坏，请保留原文件并由管理员核查';}
 }
 const atomic=(path,data)=>{const tmp=path+'.tmp-'+randomUUID();writeFileSync(tmp,data,{mode:0o600,flag:'wx'});renameSync(tmp,path);chmodSync(path,0o600);};
 const save=()=>{if(stateError)fail(stateError,409);atomic(configPath,JSON.stringify(state));};
 if(state.active){state.history.unshift({...state.active,status:'interrupted',message:'服务重启，前次备份未确认；不会将其视为成功'});state.active=null;save();}
 const keyPath=env.BACKUP_ENCRYPTION_KEY_FILE||join(dir,'encryption.key');
 let key=null,keyError='';try{const value=env.BACKUP_ENCRYPTION_KEY||(existsSync(keyPath)?readFileSync(keyPath,'utf8').trim():'');if(value)key=backupKey(value);else keyError='尚未初始化备份密钥';}catch{keyError='备份密钥配置无效，请核对服务器原密钥，不要覆盖';}
 let credentials=null,connectionError='',drive=null,activePromise=null,ticking=false;
 const useCredentials=value=>{credentials=value;drive=driveFactory({clientId:value.clientId,clientSecret:value.clientSecret});};
 if(existsSync(credentialPath)&&key){try{useCredentials(JSON.parse(unseal(readFileSync(credentialPath),key,'google-credentials').toString()))}catch{connectionError='Google 连接凭据无法解密，请核对原备份密钥，或重新授权导入';}}
 const persistCredentials=value=>{atomic(credentialPath,seal(Buffer.from(JSON.stringify(value)),key,'google-credentials'));useCredentials(value);connectionError='';};
 function status(){return {configured:!!key,connected:!!credentials,error:stateError||keyError||connectionError,enabled:state.enabled,hour:state.hour,timeZone:'Asia/Singapore',daily:state.daily,monthly:state.monthly,folderURL:credentials?.folder?'https://drive.google.com/drive/folders/'+encodeURIComponent(credentials.folder):null,keyFingerprint:key?sha256(key).slice(0,12):null,active:state.active||null,history:state.history.slice(0,20),lastSuccess:state.lastSuccess||state.history.find(h=>h.status==='success')||null};}
 const idle=()=>{if(stateError)fail(stateError,409);if(state.active)fail('备份正在进行，请完成后再更改连接或设置',409);};
 function keyCopy(){idle();if(!key){if(existsSync(credentialPath)||existsSync(keyPath)||env.BACKUP_ENCRYPTION_KEY||env.BACKUP_ENCRYPTION_KEY_FILE||state.lastSuccess||state.history.some(h=>h.status==='success'))fail('原密钥不可用，请由部署管理员核对，不能重新生成覆盖',409);const nextKey=randomBytes(32);atomic(keyPath,nextKey.toString('base64'));key=nextKey;keyError='';}return {format:'itea-backup-key-v1',key:key.toString('base64'),fingerprint:sha256(key).slice(0,12)};}
 async function connect(value){
  idle();if(!key)fail(keyError,409);
  if(!value||value.format!=='itea-google-drive-connection-v1'||typeof value.clientId!=='string'||!value.clientId.endsWith('.apps.googleusercontent.com')||value.clientId.length>300||typeof value.clientSecret!=='string'||!value.clientSecret||value.clientSecret.length>500||typeof value.refreshToken!=='string'||!value.refreshToken||value.refreshToken.length>4096)fail('请选择 itea 本机授权工具生成的连接文件');
  // Mark the connection operation busy, so connect/start/disconnect cannot race.
  const pending={id:randomUUID(),startedAt:new Date(now()).toISOString(),status:'connecting'};state.active=pending;save();
  try{
   const candidate={clientId:value.clientId,clientSecret:value.clientSecret,refreshToken:value.refreshToken},next=driveFactory(candidate);
   await next.accessToken(candidate.refreshToken);
   const folder=await next.createFolder(candidate.refreshToken,state.instance);
   persistCredentials({...candidate,folder});state.enabled=false;return status();
  }finally{state.active=null;save();}
 }
 function configure(v){idle();if(!key||!credentials)fail('请先配置备份密钥并连接 Google Drive',409);if(typeof v.enabled!=='boolean'||!Number.isInteger(v.hour)||v.hour<0||v.hour>23||!Number.isInteger(v.daily)||v.daily<1||v.daily>365||!Number.isInteger(v.monthly)||v.monthly<1||v.monthly>60)fail('备份设置无效');Object.assign(state,{enabled:v.enabled,hour:v.hour,daily:v.daily,monthly:v.monthly});save();return status();}
 function disconnect(){idle();state.enabled=false;if(existsSync(credentialPath))unlinkSync(credentialPath);credentials=null;drive?.clear();drive=null;connectionError='';save();return status();}
 async function run(job){
  let uploaded=false;
  try{
   const data=await collect(),archive=await makeArchive(data,key),day=singaporeDay(now());
   await drive.folder(credentials.refreshToken,credentials.folder,state.instance);
   const name='itea-'+day+'-'+job.id+'.iteabackup',remote=await drive.upload(credentials.refreshToken,credentials.folder,{data:archive.data,name,instance:state.instance,day,job:job.id});
   // Persist success before retention; pruning errors do not erase a verified backup.
   const result={...job,status:'success',completedAt:new Date(now()).toISOString(),fileId:remote.id,name,bytes:archive.data.length,sha256:sha256(archive.data),counts:archive.manifest.counts,verification:'本机解密及逐文件校验通过；云端大小和 MD5 匹配'};
   state.history.unshift(result);state.lastSuccess=result;state.history=state.history.slice(0,60);save();uploaded=true;
   try{const files=await drive.list(credentials.refreshToken,credentials.folder);for(const f of expiredBackups(files,{instance:state.instance,folder:credentials.folder,daily:state.daily,monthly:state.monthly}))await drive.trash(credentials.refreshToken,f.id);}
   catch{result.warning='备份已保存；旧备份清理失败，下次备份时重试';save();}
  }catch(e){
   if(!uploaded){const message=String(e.message||'备份失败');state.history.unshift({...job,status:'failed',completedAt:new Date(now()).toISOString(),message:/1254607/.test(message)?'Lark 数据尚未准备完成，请稍后重试':safeMessage(message)});state.history=state.history.slice(0,60);}
  }finally{state.active=null;save();}
 }
 function start(trigger='manual'){
  idle();if(!key||!credentials)fail(keyError||connectionError||'请先连接 Google Drive',409);
  const job={id:randomUUID(),trigger,status:'running',startedAt:new Date(now()).toISOString()};state.active=job;save();
  activePromise=new Promise(resolve=>detach(()=>{run(job).finally(resolve).catch(()=>{});}));return {...job};
 }
 async function tick(){if(ticking||state.active||!state.enabled||!key||!credentials)return;ticking=true;try{
  const time=now(),day=singaporeDay(time),hour=new Date(time+8*3600000).getUTCHours();if(hour<state.hour||state.history.some(h=>h.status==='success'&&singaporeDay(Date.parse(h.startedAt))===day))return;
  if(state.attemptDay!==day){state.attemptDay=day;state.attempts=0;}
  if(state.attempts>=3||state.nextAttempt>time)return;state.attempts++;state.nextAttempt=time+3600000;save();start('scheduled');
 }finally{ticking=false;}}
 const timer=schedule?setInterval(()=>void tick().catch(()=>{}),60000):null;timer?.unref();
 if(schedule)detach(()=>void tick().catch(()=>{}));
 async function handle(req,res,url,actor,payload,json){
  if(!url.pathname.startsWith('/api/backup'))return false;
  if(actor?.role!=='admin')fail('仅管理员可管理备份',403);
  if(req.method==='GET'&&url.pathname==='/api/backup'){json(res,200,status());return true;}
  if(req.method==='POST'){
   let origin;try{origin=new URL(req.headers.origin)}catch{fail('禁止跨站修改',403);}if(origin.host!==req.headers.host)fail('禁止跨站修改',403);
   if(url.pathname==='/api/backup/key-copy'){json(res,200,keyCopy());return true;}
   if(url.pathname==='/api/backup/connect'){await connect(payload);json(res,200,status());return true;}
   if(url.pathname==='/api/backup/settings'){json(res,200,configure(payload));return true;}
   if(url.pathname==='/api/backup/start'){json(res,202,start());return true;}
   if(url.pathname==='/api/backup/disconnect'){json(res,200,disconnect());return true;}
  }
  json(res,404,{error:'备份操作不存在'});return true;
 }
 return {status,keyCopy,connect,configure,disconnect,start,tick,handle,settled:()=>activePromise,close:()=>clearInterval(timer)};
}
function safeMessage(message){
 // Preserve known read errors without leaking provider URLs, credentials or row content.
 if(/备份|图片|工作流|记录数量|分页|Google Drive|Google 授权|Lark.*(超时|连接|接口失败)/.test(message)&&message.length<240&&!/https?:|token|secret|password|Bearer/i.test(message))return message;
 return '备份未完成，请检查 Lark 读取、Google 授权及网络后重试';
}
