import {createHash} from 'node:crypto';
import {LarkError} from './lark-store.mjs';
const fields=['工作流ID','数据'];
const scalar=v=>Array.isArray(v)?v.map(x=>x.text||'').join(''):String(v??'');
// This table is deliberately separate from the existing five business tables.
// The encrypted mailbox authorization record is never returned by the HTTP API.
export class WorkflowStore{
 constructor({lark,db,browseTtlMs=15000,now=Date.now}){this.lark=lark;this.db=db;this.queue=Promise.resolve();this.rowsEpoch=0;this.rowsFlight=null;this.browseTtlMs=browseTtlMs;this.now=now;this.browseCache=null;this.browseFlight=null;if(!lark)db.exec('CREATE TABLE IF NOT EXISTS collaboration_workflow (id TEXT PRIMARY KEY, data TEXT NOT NULL)');}
 observeRead(promise){return this.lark?.observeRead?this.lark.observeRead(promise):promise;}
 async lock(fn){const owner=this.lark||this,key=this.lark?'writeQueue':'queue',previous=owner[key];let release;owner[key]=new Promise(r=>release=r);await previous;try{return await fn()}finally{release()}}
 async path(required=true){if(!this.lark)return '';if(this.tablePath){this.lark.markWorkflowTable?.(this.tablePath);return this.tablePath;}const root='/open-apis/bitable/v1/apps/'+encodeURIComponent(await this.lark.resolveBase()),matches=(await this.lark.list(root+'/tables',100)).filter(t=>t.name==='协作工作流');if(matches.length>1)throw new LarkError('Base中有重复的协作工作流表，请管理员核对',409);if(!matches.length){if(!required)return null;throw new LarkError('请先点击“启用邀约与报名”，准备 Lark 工作流表',409)}this.tablePath=root+'/tables/'+encodeURIComponent(matches[0].table_id);this.lark.markWorkflowTable?.(this.tablePath);return this.tablePath;}
 async prepare(){return this.lock(async()=>{if(!this.lark)return {ready:true};let path=await this.path(false);if(!path){const root='/open-apis/bitable/v1/apps/'+encodeURIComponent(await this.lark.resolveBase());const d=await this.lark.request(root+'/tables',{method:'POST',body:{table:{name:'协作工作流',default_view_name:'全部记录',fields:fields.map(field_name=>({field_name,type:1}))}}});const id=d?.table_id||d?.table?.table_id;if(!id)throw new LarkError('创建工作流表结果未知，请刷新核查');path=root+'/tables/'+encodeURIComponent(id);}const existing=await this.lark.list(path+'/fields',200);for(const name of fields)if(!existing.some(f=>f.field_name===name))await this.lark.request(path+'/fields',{method:'POST',body:{field_name:name,type:1}});return {ready:true};});}
 async rows({coalesce=false,browse=false,force=false}={}){if(browse)return this.readBrowse({force});if(!coalesce)return this.readRows();let flight=this.rowsFlight,ownsFlight=false;if(!flight||flight.epoch!==this.rowsEpoch){flight={epoch:this.rowsEpoch,promise:this.readRows()};this.rowsFlight=flight;ownsFlight=true;}try{return structuredClone(await this.observeRead(flight.promise))}finally{if(ownsFlight&&this.rowsFlight===flight)this.rowsFlight=null}}

 async readBrowse({force=false}={}){
  if(force&&this.browseFlight?.epoch===this.rowsEpoch&&this.browseFlight.providerEpoch===(this.lark?.readEpoch||0))return structuredClone(await this.observeRead(this.browseFlight.promise));
  if(force){this.rowsEpoch++;this.browseCache=null;}
  const epoch=this.rowsEpoch,providerEpoch=this.lark?.readEpoch||0,started=this.now(),matches=value=>value?.epoch===epoch&&value.providerEpoch===providerEpoch;
  if(!force&&matches(this.browseCache)&&this.browseCache.until>started)return structuredClone(this.browseCache.rows);
  let flight=this.browseFlight,ownsFlight=false;
  if(force||!matches(flight)){flight={epoch,providerEpoch,promise:this.rows({coalesce:true})};this.browseFlight=flight;ownsFlight=true;}
  try{const rows=await this.observeRead(flight.promise);if(this.rowsEpoch===epoch&&(this.lark?.readEpoch||0)===providerEpoch)this.browseCache={epoch,providerEpoch,rows:structuredClone(rows),until:this.now()+this.browseTtlMs};return structuredClone(rows);}
  catch(e){if(ownsFlight&&this.rowsEpoch===epoch)this.browseCache=null;throw e;}
  finally{if(ownsFlight&&this.browseFlight===flight)this.browseFlight=null;}
 }

 async visibilityRows({force=false}={}){
  const select=rows=>rows.filter(r=>r.kind==='trash'||r.kind==='creator-merge');
  if(!this.lark||this.visibilityFiltersUnsupported)return select(await this.rows({coalesce:true,browse:true,force}));
  if(force&&this.visibilityFlight?.epoch===this.rowsEpoch&&this.visibilityFlight.providerEpoch===(this.lark.readEpoch||0))return structuredClone(await this.visibilityFlight.promise);
  if(force)this.rowsEpoch++;
  const epoch=this.rowsEpoch,providerEpoch=this.lark.readEpoch||0,started=this.now(),valid=v=>v?.epoch===epoch&&v.providerEpoch===providerEpoch;
  if(!force&&valid(this.browseCache)&&this.browseCache.until>started)return structuredClone(select(this.browseCache.rows));
  if(!force&&valid(this.visibilityCache)&&this.visibilityCache.until>started)return structuredClone(this.visibilityCache.rows);
  let flight=this.visibilityFlight,ownsFlight=false;
  if(force||!valid(flight)){
   const promise=(async()=>{const path=await this.path(false);if(!path)return [];const filter='OR(CurrentValue.[数据].contains('+JSON.stringify('"trash"')+'),CurrentValue.[数据].contains('+JSON.stringify('"creator-merge"')+'))';
    try{return select(this.decodeRows(await this.lark.list(path+'/records?filter='+encodeURIComponent(filter))));}
    catch(e){if((e.status===400&&/Lark请求参数错误/.test(e.message))||/Lark接口失败（1254018）/.test(e.message)){this.visibilityFiltersUnsupported=true;return select(await this.rows({coalesce:true,browse:true,force}));}throw e;}
   })();flight={epoch,providerEpoch,promise};this.visibilityFlight=flight;ownsFlight=true;
  }
  try{const rows=await this.observeRead(flight.promise);if(this.rowsEpoch===epoch&&(this.lark.readEpoch||0)===providerEpoch)this.visibilityCache={epoch,providerEpoch,rows:structuredClone(rows),until:this.now()+this.browseTtlMs};return structuredClone(rows);}
  catch(e){if(ownsFlight&&this.rowsEpoch===epoch)this.visibilityCache=null;throw e;}
  finally{if(ownsFlight&&this.visibilityFlight===flight)this.visibilityFlight=null;}
 }
 async reminderSettingsRows(){
  const select=rows=>rows.filter(r=>r.kind==='settings');
  if(!this.lark||this.settingsFiltersUnsupported)return select(await this.rows({coalesce:true}));
  const path=await this.path(false);if(!path)return [];const filter='CurrentValue.[数据].contains('+JSON.stringify('"settings"')+')';
  try{return select(this.decodeRows(await this.lark.list(path+'/records?filter='+encodeURIComponent(filter))));}
  catch(e){if((e.status===400&&/Lark请求参数错误/.test(e.message))||/Lark接口失败（1254018）/.test(e.message)){this.settingsFiltersUnsupported=true;return select(await this.rows({coalesce:true}));}throw e;}
 }
 async managementRows(){
  const kinds=['user','trash','management-audit','builtin-account-policy'],select=rows=>rows.filter(r=>kinds.includes(r.kind));
  if(!this.lark||this.managementFiltersUnsupported)return select(await this.rows({coalesce:true}));
  const epoch=this.rowsEpoch,providerEpoch=this.lark.readEpoch||0;let flight=this.managementFlight,ownsFlight=false;
  if(!flight||flight.epoch!==epoch||flight.providerEpoch!==providerEpoch){
   const promise=(async()=>{const path=await this.path(false);if(!path)return [];const filter='OR('+kinds.map(kind=>'CurrentValue.[数据].contains('+JSON.stringify(JSON.stringify(kind))+')').join(',')+')';try{return select(this.decodeRows(await this.lark.list(path+'/records?filter='+encodeURIComponent(filter))));}catch(e){if((e.status===400&&/Lark请求参数错误/.test(e.message))||/Lark接口失败（1254018）/.test(e.message)){this.managementFiltersUnsupported=true;return select(await this.rows({coalesce:true}));}throw e;}})();flight={epoch,providerEpoch,promise};this.managementFlight=flight;ownsFlight=true;
  }
  try{return structuredClone(await this.observeRead(flight.promise));}finally{if(ownsFlight&&this.managementFlight===flight)this.managementFlight=null;}
 }
 async invitationRows({project='',force=false}={}){
  if(typeof project!=='string'||project.length>80||/[\r\n]/.test(project))throw new LarkError('项目参数无效',400);
  const kinds=['invite','application','issue','issue-completion','report'],select=rows=>rows.filter(r=>r.id==='MAIL_AUTH'||kinds.includes(r.kind)&&(!project||r.project===project));
  if(!this.lark||this.invitationFiltersUnsupported)return select(await this.rows({coalesce:true,browse:true,force}));
  this.invitationCache??=new Map();this.invitationFlights??=new Map();
  if(force)this.rowsEpoch++;
  const epoch=this.rowsEpoch,providerEpoch=this.lark.readEpoch||0,started=this.now(),valid=v=>v?.epoch===epoch&&v.providerEpoch===providerEpoch;
  if(!force&&valid(this.browseCache)&&this.browseCache.until>started)return structuredClone(select(this.browseCache.rows));
  const cached=this.invitationCache.get(project);if(!force&&valid(cached)&&cached.until>started)return structuredClone(cached.rows);
  let flight=this.invitationFlights.get(project),ownsFlight=false;
  if(force||!valid(flight)){
   const promise=(async()=>{const path=await this.path(false);if(!path)return [];
    const contains=value=>'CurrentValue.[数据].contains('+JSON.stringify(value)+')',kindFilter='OR('+kinds.map(kind=>contains(JSON.stringify(kind))).join(',')+')',filter='OR(CurrentValue.[工作流ID] = "MAIL_AUTH",'+(project?'AND('+kindFilter+','+contains(JSON.stringify(project))+')':kindFilter)+')';
    try{return select(this.decodeRows(await this.lark.list(path+'/records?filter='+encodeURIComponent(filter))));}
    catch(e){if((e.status===400&&/Lark请求参数错误/.test(e.message))||/Lark接口失败（1254018）/.test(e.message)){this.invitationFiltersUnsupported=true;return select(await this.rows({coalesce:true,browse:true,force}));}throw e;}
   })();flight={epoch,providerEpoch,promise};this.invitationFlights.set(project,flight);ownsFlight=true;
  }
  try{const rows=await this.observeRead(flight.promise);if(this.rowsEpoch===epoch&&(this.lark.readEpoch||0)===providerEpoch){if(this.invitationCache.size>=50&&!this.invitationCache.has(project))this.invitationCache.delete(this.invitationCache.keys().next().value);this.invitationCache.set(project,{epoch,providerEpoch,rows:structuredClone(rows),until:this.now()+this.browseTtlMs});}return structuredClone(rows);}
  catch(e){if(ownsFlight&&this.rowsEpoch===epoch)this.invitationCache.delete(project);throw e;}
  finally{if(ownsFlight&&this.invitationFlights.get(project)===flight)this.invitationFlights.delete(project);}
 }
 decodeRows(records){return records.map(r=>{try{if(!scalar(r.fields?.['工作流ID']).trim()&&!scalar(r.fields?.['数据']).trim())return null;const data=JSON.parse(scalar(r.fields['数据']));if(data.id!==scalar(r.fields['工作流ID']))throw Error();return {...data,_record:r.record_id}}catch{throw new LarkError('协作工作流中有无法识别的记录，请管理员核对',409)}}).filter(Boolean);}
 async get(id){if(typeof id!=='string'||!id||id.length>200)throw new LarkError('工作流ID无效',400);if(!this.lark){const row=this.db.prepare('SELECT data FROM collaboration_workflow WHERE id=?').get(id);if(!row)return null;const data=JSON.parse(row.data);if(data.id!==id)throw new LarkError('工作流ID查询结果不匹配',409);return data;}const path=await this.path(false);if(!path)return null;if(this.targetedReadsUnsupported){const matches=(await this.rows()).filter(r=>r.id===id);if(matches.length>1)throw new LarkError('工作流ID重复，请管理员核对',409);return matches[0]||null;}const filter='CurrentValue.[工作流ID] = '+JSON.stringify(id);let records;try{records=await this.lark.list(path+'/records?filter='+encodeURIComponent(filter),2);}catch(e){if(e.status===400&&/Lark请求参数错误/.test(e.message)){this.targetedReadsUnsupported=true;return this.get(id);}throw e;}const rows=this.decodeRows(records);if(rows.length>1||rows.some(r=>r.id!==id))throw new LarkError('工作流ID查询结果不唯一或不匹配，请管理员核对',409);return rows[0]||null;}
 async readRows(){if(!this.lark)return this.db.prepare('SELECT data FROM collaboration_workflow').all().map(r=>JSON.parse(r.data));const path=await this.path(false);if(!path)return [];return this.decodeRows(await this.lark.list(path+'/records'));}
 async put(row,options){this.rowsEpoch++;try{return await this.putRow(row,options)}finally{this.rowsEpoch++}}
 async putRow(row,{rows}={}){const clean={...row};delete clean._record;const value=JSON.stringify(clean);if(value.length>19000)throw new LarkError('工作流记录过长，请缩短邮件或报名资料',400);if(!this.lark){this.db.prepare('INSERT INTO collaboration_workflow (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(row.id,value);return clean;}const path=await this.path(),record=row._record||(rows||await this.rows()).find(r=>r.id===row.id)?._record;const d=await this.lark.request(path+'/records'+(record?'/'+encodeURIComponent(record):''),{method:record?'PUT':'POST',body:{fields:{'工作流ID':row.id,'数据':value}}});const id=d?.record?.record_id;if(!id)throw new LarkError('工作流保存结果未知，请刷新核查，勿重复提交');return {...clean,_record:id};}
 async putMany(rows,options){this.rowsEpoch++;try{return await this.putManyRows(rows,options)}finally{this.rowsEpoch++}}
 async putManyRows(rows,{existingRows}={}){if(!rows.length)return;if(!this.lark){for(const row of rows)await this.put(row);return;}const path=await this.path(),existing=existingRows||await this.rows();for(const row of rows)if(existing.some(x=>x.id===row.id))throw new LarkError('工作流记录已存在，请刷新核查',409);const records=rows.map(row=>{const data={...row};delete data._record;const value=JSON.stringify(data);if(value.length>19000)throw new LarkError('工作流资料过长',400);return {fields:{'工作流ID':row.id,'数据':value}}});for(let offset=0;offset<records.length;offset+=100){const chunk=records.slice(offset,offset+100),d=await this.lark.request(path+'/records/batch_create',{method:'POST',body:{records:chunk}});if(!Array.isArray(d?.records)||d.records.length!==chunk.length)throw new LarkError('批量保存结果未知，请刷新核查，勿重复提交');}}
 async updateMany(updates,{existingRows}={}){
  if(!Array.isArray(updates)||updates.length>1000)throw new LarkError('批量更新数量无效',400);
  if(!updates.length)return;
  const existing=existingRows||await this.rows(),known=new Map(existing.map(r=>[r.id,r])),seen=new Set();
  const entries=updates.map(row=>{if(!row?.id||seen.has(row.id)||!known.has(row.id))throw new LarkError('批量更新记录已变化，请刷新',409);seen.add(row.id);const clean={...row};delete clean._record;const value=JSON.stringify(clean);if(value.length>19000)throw new LarkError('工作流记录过长，请缩短标签或备注',400);const record=known.get(row.id)._record;if(this.lark&&!record)throw new LarkError('批量更新缺少原记录编号，请刷新',409);return {row:clean,value,record};});
  this.rowsEpoch++;
  try{
   if(!this.lark){this.db.exec('SAVEPOINT workflow_batch_update');try{const statement=this.db.prepare('UPDATE collaboration_workflow SET data=? WHERE id=?');for(const entry of entries){const result=statement.run(entry.value,entry.row.id);if(result.changes!==1)throw new LarkError('批量更新记录已变化，请刷新',409);}this.db.exec('RELEASE workflow_batch_update');}catch(e){this.db.exec('ROLLBACK TO workflow_batch_update; RELEASE workflow_batch_update');throw e;}return;}
   const path=await this.path();
   for(let offset=0;offset<entries.length;offset+=100){const chunk=entries.slice(offset,offset+100),expected=new Set(chunk.map(e=>e.record)),result=await this.lark.request(path+'/records/batch_update',{method:'POST',body:{records:chunk.map(e=>({record_id:e.record,fields:{'工作流ID':e.row.id,'数据':e.value}}))}});if(!Array.isArray(result?.records)||result.records.length!==chunk.length||new Set(result.records.map(r=>r.record_id)).size!==expected.size||result.records.some(r=>!expected.has(r.record_id))){const error=new LarkError('批量保存结果未确认，请刷新核对；再次追加相同标签不会重复添加',502);error.unknown=true;throw error;}}
  }finally{this.rowsEpoch++;}
 }
 revision(rows){return createHash('sha256').update(JSON.stringify(rows.map(r=>{const v={...r};delete v._record;return v}).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');}
}
