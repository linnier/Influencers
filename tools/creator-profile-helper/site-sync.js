(function(root){'use strict';
const SITE='https://43.106.95.29/creators/',ORIGIN='https://43.106.95.29/*',ARCHIVE='itea.discovery.archive.v1',CONNECTION='itea.discovery.connection.v1';
const lock=fn=>navigator.locks.request(ARCHIVE,fn);
const clone=v=>JSON.parse(JSON.stringify(v));
async function archive(){return (await chrome.storage.local.get(ARCHIVE))[ARCHIVE]||[];}
async function connection(){return (await chrome.storage.local.get(CONNECTION))[CONNECTION]||null;}
async function tab(){const found=await chrome.tabs.query({url:SITE+'*'});const current=found.find(t=>t.url?.startsWith(SITE));if(!current)throw Error('请保持一个已登录的达人系统标签页打开，再点“重试待保存”。');return current.id;}
async function request(id,action,cards,expectedActorId){const results=await chrome.scripting.executeScript({target:{tabId:id},world:'MAIN',func:async(action,cards,expected)=>{
 if(location.origin!=='https://43.106.95.29'||!location.pathname.startsWith('/creators/'))return {error:'系统标签页地址不一致'};
 const path=action==='me'?'/creators/api/discovery/connection':action==='list'?'/creators/api/discovery':'/creators/api/discovery/profile-cards';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(path,action==='me'||action==='list'?{credentials:'same-origin',cache:'no-store',signal:controller.signal}:{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({cards,expectedActorId:expected})});if(response.status===401)return {error:'系统登录已过期，请在系统页面登录后重试。'};const data=await response.json();if(response.ok&&action==='save'){try{document.getElementById('discoveryReload')?.click()}catch{}}return response.ok?{data}:{error:data.error||'系统保存失败'};}catch{return {error:'系统页面无法连接或请求超时，结果已保留供重试。'};}finally{clearTimeout(timer);}
 },args:[action,cards||[],expectedActorId||'']});const result=results[0]?.result;if(!result||result.error)throw Error(result?.error||'系统没有返回保存结果');return result.data;}
async function flush(){return navigator.locks.request(ARCHIVE+'.sync',async()=>{
 const snapshot=await lock(async()=>({config:await connection(),rows:clone(await archive())})),{config,rows}=snapshot;
 if(config?.enabled&&config.site!==SITE)return {saved:0,pending:rows.filter(r=>!r.savedAt).length,reason:'系统地址已更新，请点击“连接系统并自动保存”授权新网址；本机记录已保留。'};
 if(!config?.enabled)return {saved:0,pending:rows.filter(r=>!r.savedAt).length,reason:'未连接系统，结果已保存在本机。'};
 const pending=rows.filter(r=>!r.savedAt&&(!r.actorId||r.actorId===config.actorId));let saved=0,error='';
 if(!pending.length)return {saved:0,pending:rows.filter(r=>!r.savedAt).length};
 const update=async(batch,message)=>lock(async()=>{const current=await archive();for(const old of batch){const row=current.find(r=>r.record.url===old.record.url&&r.actorId===old.actorId&&r.updatedAt===old.updatedAt&&JSON.stringify(r.record)===JSON.stringify(old.record));if(!row)continue;if(message)row.error=message;else{row.savedAt=new Date().toISOString();row.actorId=config.actorId;row.error='';}}await chrome.storage.local.set({[ARCHIVE]:current});});
 try{const id=await tab(),actor=await request(id,'me');if(actor.id!==config.actorId)throw Error('系统登录账号已变化，请重新连接，避免保存到其他账号。');
  for(let i=0;i<pending.length;i+=30){const batch=pending.slice(i,i+30),result=await request(id,'save',batch.map(r=>r.record),config.actorId);if(result.collected!==batch.length)throw Error('服务器返回的保存数量不一致，已保留本机记录供重试。');await update(batch,'');saved+=batch.length;}
 }catch(e){error=String(e.message||e);await update(pending.slice(saved),error);}
 return {saved,pending:(await archive()).filter(r=>!r.savedAt).length,error};
 });}
async function keep(record,{sync=true}={}){if(!record?.email||record.schema!=='itea.creator.profile-card.v1')throw Error('只保存含公开邮箱的有效资料卡');await lock(async()=>{const config=await connection(),rows=await archive(),actorId=config?.enabled?config.actorId:null;
 const existing=rows.find(r=>r.record.url===record.url&&r.actorId===actorId);const row={record:clone(record),actorId,savedAt:'',updatedAt:new Date().toISOString(),error:''};if(existing)Object.assign(existing,row);else{if(rows.length>=300){const old=rows.findIndex(r=>r.savedAt);if(old<0)throw Error('本机有300条待保存线索，请先同步或导出再继续');rows.splice(old,1);}rows.push(row);}await chrome.storage.local.set({[ARCHIVE]:rows});});return sync?flush():{saved:0,pending:(await archive()).filter(r=>!r.savedAt).length};}
async function connect(){// Invoked directly from the user's connect button.
 const allowed=await chrome.permissions.request({origins:[ORIGIN]});if(!allowed)throw Error('未授权系统网址；结果仍可保存在本机。');
 let id;try{id=await tab()}catch{await chrome.tabs.create({url:SITE,active:true});throw Error('已打开系统，请登录后回助手再次点击“连接并自动保存”。');}
 const actor=await request(id,'me');if(typeof actor.id!=='string'||!actor.id)throw Error('系统连接接口尚未更新，请先更新系统后重试。');if(!['admin','owner'].includes(actor.role))throw Error('需要管理员或负责人账号才能保存达人线索。');
 await chrome.storage.local.set({[CONNECTION]:{enabled:true,site:SITE,actorId:actor.id,username:actor.username}});return {actor,result:await flush()};
}
async function disconnect(){await chrome.storage.local.set({[CONNECTION]:null});}
async function membership(){const config=await connection();if(!config?.enabled)throw Error('未连接系统，入库状态待核对');if(config.site!==SITE)throw Error('系统地址已更新，请重新连接系统后核对入库状态');const id=await tab(),before=await request(id,'me');if(before.id!==config.actorId)throw Error('系统登录账号已变化，请重新连接后核对入库状态');const result=await request(id,'list'),after=await request(id,'me'),current=await connection();if(after.id!==before.id||current?.actorId!==config.actorId||!current?.enabled)throw Error('系统账号已变化，入库状态待核对');if(result.libraryStatusAvailable===false)throw Error('系统暂时无法核对达人库，稍后重试');return {actorId:config.actorId,rows:result.rows||[]};}
root.IteaSync={membership,SITE,ARCHIVE,CONNECTION,archive,connection,keep,flush,connect,disconnect};
})(globalThis);
