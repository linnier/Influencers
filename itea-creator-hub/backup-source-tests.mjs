import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LarkStore} from './lark-store.mjs';
import {WorkflowStore} from './workflow-store.mjs';
import {createBackupSource} from './backup-source.mjs';

const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const dir=mkdtempSync(join(tmpdir(),'itea-backup-source-'));
const root='/open-apis/bitable/v1/apps/fixture',path=root+'/tables/workflow';
const record={record_id:'r1',fields:{工作流ID:'R1',数据:JSON.stringify({id:'R1',kind:'invite'})}};
const state={people:[],accounts:[],projects:[],collabs:[],posts:[]};
function fixture(){
 const lark=new LarkStore({baseToken:'fixture'}),store=new WorkflowStore({lark});
 lark.list=async target=>target===root+'/tables'?[{name:'协作工作流',table_id:'workflow'}]:target.endsWith('/fields')?[]:[structuredClone(record)];
 lark.readFresh=async()=>({state:structuredClone(state),revision:'fresh'});
 lark.requestInner=async target=>target.includes('batch_update')?{records:[{record_id:'r1'}]}:target.includes('batch_create')?{records:[{record_id:'new'}]}:{record:{record_id:'r1'}};
 const started=gate(),release=gate();lark.snapshot=async()=>{started.resolve();await release.promise;return {root,revision:'snapshot',state:structuredClone(state)}};
 const collect=createBackupSource({lark,store,dataDir:dir,build:'test'});
 return {lark,store,collect,started,release};
}
try{
 const f=fixture(),exporting=f.collect();await f.started.promise;
 await f.lark.read({browse:true,force:true});
 await f.store.rows({browse:true,force:true});
 await f.store.visibilityRows({force:true});
 await f.store.invitationRows({force:true});
 assert(f.lark.readEpoch>0);assert(f.store.rowsEpoch>0);
 assert.equal(f.lark.mutationEpoch,0);assert.equal(f.store.writeEpoch,0);
 f.release.resolve();assert.equal((await exporting).source.workflow.rows[0].id,'R1','ordinary refreshes must not invalidate a backup');

 for(const [label,write] of [
  ['business save',async f=>f.lark.withMutation(async()=>{})],
  ['business record request',async f=>f.lark.request(root+'/tables/business/records',{method:'POST',body:{}})],
  ['workflow-only provider write',async f=>{f.lark.markWorkflowTable(path);await f.lark.request(path+'/records/r1',{method:'PUT',body:{}})}],
  ['workflow put',async f=>f.store.put({id:'R1',kind:'invite',_record:'r1'})],
  ['workflow batch insert',async f=>f.store.putMany([{id:'NEW',kind:'invite'}],{existingRows:[]})],
  ['workflow batch update',async f=>f.store.updateMany([{id:'R1',kind:'invite',value:1}],{existingRows:[{id:'R1',_record:'r1'}]})]
 ]){
  const f=fixture(),exporting=f.collect(),rejected=assert.rejects(exporting,/资料有变化/,label);await f.started.promise;await write(f);f.release.resolve();await rejected;assert.equal(f.lark.mutationDepth,0);assert.equal(f.store.writeDepth,0);
 }
 // A long workflow operation can span multiple provider requests: refuse while it is active.
 for(const kind of ['business','workflow']){
  const f=fixture(),pending=gate(),began=gate();let saving;
  if(kind==='business')saving=f.lark.withMutation(async()=>{began.resolve();await pending.promise;});
  else {f.store.putRow=async()=>{began.resolve();await pending.promise;return {id:'R1'}};saving=f.store.put({id:'R1'});}
  await began.promise;await assert.rejects(f.collect(),/资料正在保存/);pending.resolve();await saving;
 }
 {const f=fixture();await assert.rejects(f.lark.withMutation(async()=>{throw Error('write rejected')}),/write rejected/);assert.equal(f.lark.mutationDepth,0);
 f.store.putRow=async()=>{throw Error('provider failure')};await assert.rejects(f.store.put({id:'R1'}),/provider failure/);assert.equal(f.store.writeDepth,0);}
 console.log('PASS backup concurrency with real stores: business/workflow/visibility/invitation forced refreshes can overlap export; completed and in-flight business, workflow-only, single and batch writes still block inconsistent backups; failed writes release counters. Mock provider only.');
}finally{rmSync(dir,{recursive:true,force:true});}
