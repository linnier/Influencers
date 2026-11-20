import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {readdir,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';

const zip=promisify(gzip),unzip=promisify(gunzip),MAGIC=Buffer.from('ITEABK01');
export const MAX_ARCHIVE_BYTES=128*1024*1024;
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function backupKey(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value)||Buffer.from(value,'base64').length!==32)throw Error('请在服务器设置独立的 BACKUP_ENCRYPTION_KEY（32 字节 Base64），并另存离线副本');
 return Buffer.from(value,'base64');
}
export function seal(value,key,purpose='archive'){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('itea-backup-v1:'+purpose));
 return Buffer.concat([MAGIC,nonce,cipher.update(value),cipher.final(),cipher.getAuthTag()]);
}
export function unseal(value,key,purpose='archive'){
 if(value.length<36||value.length>MAX_ARCHIVE_BYTES+1024||!value.subarray(0,8).equals(MAGIC))throw Error('备份文件格式或大小无效');
 try{const cipher=createDecipheriv('aes-256-gcm',key,value.subarray(8,20));cipher.setAAD(Buffer.from('itea-backup-v1:'+purpose));cipher.setAuthTag(value.subarray(-16));return Buffer.concat([cipher.update(value.subarray(20,-16)),cipher.final()]);}catch{throw Error('备份密钥不匹配，或文件已损坏');}
}
function csv(rows){
 const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))],cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\uFEFF'+[columns.map(cell).join(','),...rows.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n');
}
export async function imageFiles(dataDir){
 const dir=join(dataDir,'mail-images'),files=[];let names;try{names=await readdir(dir)}catch(e){if(e.code==='ENOENT')return files;throw e;}
 let bytes=0;for(const name of names.sort()){
  if(!/^[a-f0-9]{40}\.json$/.test(name))continue;
  const path=join(dir,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>800000)throw Error('产品图片文件异常，备份已停止');
  bytes+=stat.size;if(bytes>64*1024*1024)throw Error('产品图片超过本版 64MB 备份上限');
  const data=await readFile(path,'utf8');const image=JSON.parse(data);if(image.id!==name.slice(0,-5))throw Error('产品图片编号不匹配');files.push({path:'mail-images/'+name,content:data});
 }return files;
}
export async function makeArchive({source,images=[],startedAt,completedAt},key){
 const state=source.business.state,rows=source.workflow.rows;
 for(const kind of ['people','accounts','projects','collabs','posts'])if(!Array.isArray(state?.[kind]))throw Error('业务备份不完整');
 if(!Array.isArray(rows))throw Error('工作流备份不完整');
 const files=[{path:'snapshot.json',content:JSON.stringify(source)},...Object.entries(state).filter(([,v])=>Array.isArray(v)).map(([kind,rows])=>({path:'csv/'+kind+'.csv',content:csv(rows)})),{path:'csv/workflow.csv',content:csv(rows)},...images];
 const manifest={format:'itea-backup',version:1,startedAt,completedAt,source:source.backend,consistency:source.consistency,counts:Object.fromEntries([...Object.entries(state).map(([k,v])=>[k,v.length]),['workflow',rows.length],['images',images.length]]),files:files.map(f=>({path:f.path,bytes:Buffer.byteLength(f.content),sha256:sha256(f.content)}))};
 const plain=Buffer.from(JSON.stringify({manifest,files}));if(plain.length>MAX_ARCHIVE_BYTES)throw Error('备份超过本版 128MB 上限，请扩展备份容量后重试');
 const encrypted=seal(await zip(plain),key);
 // Authenticate, decompress and verify every member before upload.
 await inspectArchive(encrypted,key);return {data:encrypted,manifest};
}
export async function inspectArchive(data,key){
 const plain=await unzip(unseal(data,key),{maxOutputLength:MAX_ARCHIVE_BYTES});const parsed=JSON.parse(plain);
 if(parsed.manifest?.format!=='itea-backup'||parsed.manifest.version!==1||!Array.isArray(parsed.files)||!Array.isArray(parsed.manifest.files)||parsed.files.length!==parsed.manifest.files.length)throw Error('备份清单格式无效');
 const seen=new Set();for(let i=0;i<parsed.files.length;i++){const f=parsed.files[i],entry=parsed.manifest.files[i];if(typeof f.content!=='string'||!(/^(snapshot\.json|csv\/(people|accounts|projects|collabs|posts|workflow)\.csv|mail-images\/[a-f0-9]{40}\.json)$/).test(f.path)||seen.has(f.path)||entry.path!==f.path||entry.bytes!==Buffer.byteLength(f.content)||entry.sha256!==sha256(f.content))throw Error('备份文件清单校验失败');seen.add(f.path);}
 if(!seen.has('snapshot.json'))throw Error('备份缺少资料快照');return parsed;
}

// Only exact app-owned backups in this instance's folder are candidates.
export function expiredBackups(files,{instance,folder,daily=30,monthly=12}){
 const valid=files.filter(f=>f.appProperties?.iteaBackup==='1'&&f.appProperties.instance===instance&&f.parents?.includes(folder)&&/^\d{4}-\d{2}-\d{2}$/.test(f.appProperties.day)&&/^itea-.*\.iteabackup$/.test(f.name)&&f.trashed!==true).sort((a,b)=>b.appProperties.day.localeCompare(a.appProperties.day)||String(b.createdTime).localeCompare(String(a.createdTime)));
 const keep=new Set(),days=new Set(),months=new Set();for(const f of valid){const day=f.appProperties.day,month=day.slice(0,7);if(!days.has(day)&&days.size<daily){days.add(day);keep.add(f.id);}if(!months.has(month)&&months.size<monthly){months.add(month);keep.add(f.id);}}
 return valid.filter(f=>!keep.has(f.id));
}
