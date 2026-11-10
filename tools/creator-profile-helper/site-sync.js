(function(root){'use strict';
const SITE='https://47.86.198.65/creators/',ORIGIN='https://47.86.198.65/*',ARCHIVE='itea.discovery.archive.v1',CONNECTION='itea.discovery.connection.v1';
const lock=fn=>navigator.locks.request(ARCHIVE,fn);
const clone=v=>JSON.parse(JSON.stringify(v));
async function archive(){return (await chrome.storage.local.get(ARCHIVE))[ARCHIVE]||[];}
async function connection(){return (await chrome.storage.local.get(CONNECTION))[CONNECTION]||null;}
async function tab(){const found=await chrome.tabs.query({url:SITE+'*'});const current=found.find(t=>t.url?.startsWith(SITE));if(!current)throw Error('请保持一个已登录的达人系统标签页打开，再点“重试待保存”。');return current.id;}
async function request(id,action,cards,expectedActorId){const results=await chrome.scripting.executeScript({target:{tabId:id},world:'MAIN',func:async(action,cards,expected)=>{
 if(location.origin!=='https://47.86.198.65'||!location.pathname.startsWith('/creators/'))return {error:'系统标签页地址不一致'};
 const path=action==='me'?'/creators/api/discovery/connection':'/creators/api/discovery/profile-cards';
 try{const response=await fetch(path,action==='me'?{credentials:'same-origin',cache:'no-store'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({cards,expectedActorId:expected})});if(response.status===401)return {error:'系统登录已过期，请在系统页面登录后重试。'};const data=await response.json();if(response.ok&&action==='save'){try{document.getElementById('discoveryReload')?.click()}catch{}}return response.ok?{data}:{error:data.error||'系统保存失败'};}catch{return {error:'系统页面无法连接，请确认已登录且网络正常。'};}
 },args:[action,cards||[],expectedActorId||'']});const result=results[0]?.result;if(!result||result.error)throw Error(result?.error||'系统没有返回保存结果');return result.data;}
async function flush(){return lock(async()=>{const config=await connection(),rows=await archive();if(!config?.enabled)return {saved:0,pending:rows.filter(r=>!r.savedAt).length,reason:'未连接系统，结果已保存在本机。'};let saved=0,error='';
 const pending=rows.filter(r=>!r.savedAt&&(!r.actorId||r.actorId===config.actorId));if(!pending.length)return {saved:0,pending:rows.filter(r=>!r.savedAt).length,reason:rows.some(r=>!r.savedAt)?'有其他账号的待保存记录，需切回对应账号同步。':''};
 try{const id=await tab(),actor=await request(id,'me');if(actor.id!==config.actorId)throw Error('系统登录账号已变化，请重新连接，避免保存到其他账号。');
  for(let i=0;i<pending.length;i+=30){const batch=pending.slice(i,i+30),result=await request(id,'save',batch.map(r=>r.record),config.actorId);if(result.collected!==batch.length)throw Error('服务器返回的保存数量不一致，已保留本机记录供重试。');for(const row of batch){row.savedAt=new Date().toISOString();row.actorId=config.actorId;row.error='';}saved+=batch.length;await chrome.storage.local.set({[ARCHIVE]:rows});}
 }catch(e){error=String(e.message||e);for(const r of pending)if(!r.savedAt)r.error=error;await chrome.storage.local.set({[ARCHIVE]:rows});}
 return {saved,pending:rows.filter(r=>!r.savedAt).length,error};
 });}
async function keep(record,{sync=true}={}){if(!record?.email||record.schema!=='itea.creator.profile-card.v1')throw Error('只保存含公开邮箱的有效资料卡');await lock(async()=>{const config=await connection(),rows=await archive(),actorId=config?.enabled?config.actorId:null;
 const existing=rows.find(r=>r.record.url===record.url&&r.actorId===actorId);const row={record:clone(record),actorId,savedAt:'',updatedAt:new Date().toISOString(),error:''};if(existing)Object.assign(existing,row);else{if(rows.length>=300){const old=rows.findIndex(r=>r.savedAt);if(old<0)throw Error('本机有300条待保存线索，请先同步或导出再继续');rows.splice(old,1);}rows.push(row);}await chrome.storage.local.set({[ARCHIVE]:rows});});return sync?flush():{saved:0,pending:(await archive()).filter(r=>!r.savedAt).length};}
async function connect(){// Invoked directly from the user's connect button.
 const allowed=await chrome.permissions.request({origins:[ORIGIN]});if(!allowed)throw Error('未授权系统网址；结果仍可保存在本机。');
 let id;try{id=await tab()}catch{await chrome.tabs.create({url:SITE,active:true});throw Error('已打开系统，请登录后回助手再次点击“连接并自动保存”。');}
 const actor=await request(id,'me');if(typeof actor.id!=='string'||!actor.id)throw Error('系统连接接口尚未更新，请先更新系统后重试。');if(!['admin','owner'].includes(actor.role))throw Error('需要管理员或负责人账号才能保存达人线索。');
 await chrome.storage.local.set({[CONNECTION]:{enabled:true,actorId:actor.id,username:actor.username}});return {actor,result:await flush()};
}
async function disconnect(){await chrome.storage.local.set({[CONNECTION]:null});}
root.IteaSync={SITE,ARCHIVE,CONNECTION,archive,connection,keep,flush,connect,disconnect};
})(globalThis);
