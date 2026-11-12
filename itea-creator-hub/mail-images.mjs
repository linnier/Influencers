import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {LarkError} from './lark-store.mjs';

const fail=message=>{throw new LarkError(message,400)},types=['invite','confirmed','issued','reminder'];
export const MAX_IMAGE_BYTES=500*1024;
export function imageSize(b,mime){
 let width=0,height=0;
 if(mime==='image/png'&&b.length>=33&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR'){width=b.readUInt32BE(16);height=b.readUInt32BE(20);}
 if(mime==='image/jpeg'&&b[0]===255&&b[1]===216){
  for(let i=2;i+4<b.length;){if(b[i++]!==255)break;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const n=b.readUInt16BE(i);if(n<2||i+n>b.length)break;if([192,193,194].includes(marker)&&n>=8){height=b.readUInt16BE(i+3);width=b.readUInt16BE(i+5);break;}i+=n;}
 }
 if(!width||!height||width>4096||height>4096||width*height>12e6)fail('图片格式或尺寸无效，请上传 JPG 或 PNG（最长边不超过4096像素）');
 return {width,height};
}
export function createMailImages({dataDir}){
 const dir=resolve(dataDir,'mail-images');mkdirSync(dir,{recursive:true});
 function get(id){if(typeof id!=='string'||!/^[a-f0-9]{40}$/.test(id))fail('图片编号无效');let r;try{r=JSON.parse(readFileSync(resolve(dir,id+'.json'),'utf8'));}catch{fail('邮件图片不存在，请重新上传');}return r;}
 const descriptor=r=>({id:r.id,name:r.name,mime:r.mime,width:r.width,height:r.height});
 function upload(project,v){if(!v||!['image/jpeg','image/png'].includes(v.mime)||typeof v.base64!=='string'||!v.base64.length||v.base64.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(v.base64))fail('请上传不超过500KB的 JPG 或 PNG 图片');const buffer=Buffer.from(v.base64,'base64');if(buffer.toString('base64')!==v.base64||buffer.length>MAX_IMAGE_BYTES)fail('图片内容无效或超过500KB');const size=imageSize(buffer,v.mime),r={id:randomBytes(20).toString('hex'),project,name:String(v.name||'产品图片').replace(/[\r\n\x00-\x1f]/g,'').slice(0,120),mime:v.mime,...size,base64:v.base64,created:new Date().toISOString()};writeFileSync(resolve(dir,r.id+'.json'),JSON.stringify(r),{flag:'wx',mode:0o600});return descriptor(r);}
 function selection(project,images=[]){if(!Array.isArray(images)||images.length>4)fail('每个项目最多使用4张邮件图片');const ids=new Set();return images.map(v=>{if(!v||ids.has(v.id))fail('邮件图片重复或无效');ids.add(v.id);const r=get(v.id);if(r.project!==project)fail('邮件图片不属于此项目');if(!Array.isArray(v.types)||!v.types.length||v.types.some(t=>!types.includes(t)))fail('请选择图片适用的邮件类型');if(v.caption!==undefined&&(typeof v.caption!=='string'||v.caption.length>160))fail('图片说明最多160字');return {...descriptor(r),types:[...new Set(v.types)],caption:v.caption||''};});}
 function attachments(project,design){return selection(project,(design?.images||[]).map(v=>({...v,types:[design.kind]}))).map(v=>{const r=get(v.id);return {...descriptor(r),base64:r.base64,cid:'itea-photo-'+r.id+'@itea.sg'};});}
 async function handle(req,res,url,actor,payload,{getState,rows,checkActor,json}){
  if(!url.pathname.startsWith('/api/mail-images'))return false;
  if(!['admin','owner'].includes(actor.role))throw new LarkError('仅管理员或项目负责人可使用邮件图片',403);
  checkActor(actor,rows);let project,record;
  const match=url.pathname.match(/^\/api\/mail-images\/([a-f0-9]{40})$/);
  if(req.method==='POST'&&url.pathname==='/api/mail-images')project=payload?.project;
  else if(req.method==='GET'&&match){record=get(match[1]);project=record.project;}
  else throw new LarkError('图片请求无效',400);
  const state=(await getState({rows})).state,p=state.projects.find(x=>x.id===project);
  if(!p||actor.role==='owner'&&p.owner!==actor.owner)throw new LarkError('无权使用此项目的邮件图片',403);
  if(record){res.writeHead(200,{'Content-Type':record.mime,'Content-Length':Buffer.byteLength(record.base64,'base64'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Content-Disposition':'inline'});res.end(Buffer.from(record.base64,'base64'));}
  else json(res,200,{image:upload(project,payload)});
  return true;
 }
 return {upload,get,selection,attachments,handle};
}
