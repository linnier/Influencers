import {createHash} from 'node:crypto';
const SCOPE='https://www.googleapis.com/auth/drive.file';
export {SCOPE};
const fail=(text,status=502)=>{throw Object.assign(Error(text),{status});};
export class BackupDrive{
 constructor({clientId,clientSecret,fetchImpl=fetch,now=Date.now}){Object.assign(this,{clientId,clientSecret,fetch:fetchImpl,now});this.access=null;this.flight=null;}
 async request(url,options={},timeout=20000){
  let response;try{response=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)})}catch{fail('Google Drive 连接失败或超时，请稍后重试');}
  let data;try{data=await response.json()}catch{fail('Google Drive 返回格式异常');}
  if(!response.ok){const code=data?.error?.status||data?.error;if(code==='invalid_grant')fail('Google 授权已失效，请重新连接 Google Drive',409);fail('Google Drive 请求失败（HTTP '+response.status+'），请核查授权、可用空间或 Google 服务状态');}
  return data;
 }
 token(body){return this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:this.clientId,client_secret:this.clientSecret})});}
 async accessToken(refreshToken){
  if(this.access?.refresh===refreshToken&&this.access.until>this.now())return this.access.value;
  if(this.flight)return this.flight;
  const flight=(async()=>{const v=await this.token({grant_type:'refresh_token',refresh_token:refreshToken});if(!v.access_token)fail('Google 未返回访问凭据');this.access={refresh:refreshToken,value:v.access_token,until:this.now()+Math.max(0,Number(v.expires_in||0)-60)*1000};return v.access_token;})();this.flight=flight;try{return await flight}finally{this.flight=null;}
 }
 clear(){this.access=null;}
 async api(path,refreshToken,options={}){const token=await this.accessToken(refreshToken);return this.request('https://www.googleapis.com/drive/v3'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});}
 async createFolder(refreshToken,instance){const f=await this.api('/files?fields=id',refreshToken,{method:'POST',body:JSON.stringify({name:'itea 系统备份',mimeType:'application/vnd.google-apps.folder',appProperties:{iteaBackupFolder:'1',instance}})});if(!f.id)fail('Google Drive 未确认备份文件夹');return f.id;}
 async folder(refreshToken,id,instance){const f=await this.api('/files/'+encodeURIComponent(id)+'?fields=id,mimeType,trashed,appProperties',refreshToken);if(f.trashed||f.mimeType!=='application/vnd.google-apps.folder'||f.appProperties?.instance!==instance||f.appProperties?.iteaBackupFolder!=='1')fail('专用备份文件夹已移除或不匹配，请重新连接',409);return f;}
 async list(refreshToken,folder){const files=[];let page;const seen=new Set();for(let i=0;i<100;i++){const q=new URLSearchParams({q:"'"+folder.replaceAll("'","\\'")+"' in parents and trashed = false",fields:'files(id,name,parents,size,md5Checksum,createdTime,trashed,appProperties),nextPageToken',pageSize:'1000',...(page?{pageToken:page}:{})});const d=await this.api('/files?'+q,refreshToken);if(!Array.isArray(d.files))fail('Google Drive 文件列表不完整');files.push(...d.files);if(files.length>5000)fail('Google Drive 备份列表超过本版上限，已停止清理');if(!d.nextPageToken)return files;if(seen.has(d.nextPageToken))fail('Google Drive 分页异常');seen.add(d.nextPageToken);page=d.nextPageToken;}fail('Google Drive 备份文件数量超过读取上限');}
 async upload(refreshToken,folder,{data,name,instance,day,job}){
  const ids=await this.api('/files/generateIds?count=1&space=drive&type=files',refreshToken),id=ids.ids?.[0];if(!id)fail('Google Drive 未返回文件编号');
  const meta={id,name,mimeType:'application/octet-stream',parents:[folder],appProperties:{iteaBackup:'1',instance,day,job}};
  const token=await this.accessToken(refreshToken);let result;
  try{
   let response;try{response=await this.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(data.length)},body:JSON.stringify(meta),redirect:'error',signal:AbortSignal.timeout(20000)})}catch{fail('Google Drive 上传连接失败或超时');}
   if(!response.ok)fail('Google Drive 未能开始上传，请检查可用空间及授权');
   let session;try{session=new URL(response.headers.get('location'));}catch{fail('Google Drive 未返回上传地址');}
   if(session.protocol!=='https:'||session.hostname!=='www.googleapis.com'||session.port||!session.pathname.startsWith('/upload/drive/v3/files')||session.username||session.password)fail('Google Drive 上传地址异常');
   result=await this.request(session.href,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream','Content-Length':String(data.length)},body:data},120000);
  }
  catch(error){
   // Reconcile the pre-generated ID if the upload response was lost. Never blindly upload twice.
   try{result=await this.api('/files/'+encodeURIComponent(id)+'?fields=id,size,md5Checksum',refreshToken)}catch{throw error;}
  }
  if(result.id!==id||String(result.size)!==String(data.length)||result.md5Checksum!==createHash('md5').update(data).digest('hex'))fail('Google Drive 文件大小或校验值不匹配，不能确认备份成功');return result;
 }
 async trash(refreshToken,id){const result=await this.api('/files/'+encodeURIComponent(id)+'?fields=id,trashed',refreshToken,{method:'PATCH',body:JSON.stringify({trashed:true})});if(result.id!==id||result.trashed!==true)fail('Google Drive 未确认旧版本移入回收站');}
}
