import assert from 'node:assert/strict';
import {WorkflowStore} from './workflow-store.mjs';
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
let clock=0,scans=0,value='old',offline=false;
const lark={readEpoch:0},store=new WorkflowStore({lark,now:()=>clock});
store.readRows=async()=>{scans++;if(offline)throw Error('offline');return [{id:'R',value}];};
let rows=await store.rows({browse:true});assert.equal(scans,1);rows[0].value='caller mutation';assert.equal((await store.rows({browse:true}))[0].value,'old');assert.equal(scans,1);
await store.rows({coalesce:true});await store.rows();assert.equal(scans,3,'ordinary coalesced and mutation reads remain fresh');
clock=15000;value='new';assert.equal((await store.rows({browse:true}))[0].value,'new');assert.equal(scans,4);
value='forced';assert.equal((await store.rows({browse:true,force:true}))[0].value,'forced');assert.equal(scans,5);
store.putRow=async row=>row;await store.put({id:'R'});value='after-write';assert.equal((await store.rows({browse:true}))[0].value,'after-write');assert.equal(scans,6);
lark.readEpoch++;value='provider-write';assert.equal((await store.rows({browse:true}))[0].value,'provider-write');assert.equal(scans,7);
clock+=15000;offline=true;await assert.rejects(store.rows({browse:true}),/offline/);assert.equal(store.browseCache,null);await assert.rejects(store.rows({browse:true}),/offline/);offline=false;await store.rows({browse:true});
const slow=new WorkflowStore({lark:{readEpoch:0},now:()=>clock}),readGate=gate();let count=0;slow.readRows=async()=>{count++;if(count===1)return readGate.promise;return[{id:'fresh'}]};const old=slow.rows({browse:true}),shared=slow.rows({browse:true});assert.equal(count,1);slow.putRow=async row=>row;await slow.put({id:'saved'});assert.equal((await slow.rows({browse:true}))[0].id,'fresh');readGate.resolve([{id:'stale'}]);await Promise.all([old,shared]);assert.equal((await slow.rows({browse:true}))[0].id,'fresh','pre-write late result cannot replace post-write cache');
// Model the production workflow size using paginated provider reads, without credentials or writes.
let requests=0;const paged=new WorkflowStore({lark:{readEpoch:0,list:async()=>{for(let i=0;i<8;i++)requests++;return Array.from({length:3537},(_,i)=>({record_id:'rec'+i,fields:{工作流ID:'W'+i,数据:JSON.stringify({id:'W'+i,kind:'notification'})}}))}}});paged.tablePath='/open-apis/test/tables/workflow';assert.equal((await paged.rows({browse:true})).length,3537);assert.equal(requests,8);await paged.rows({browse:true});await paged.rows({browse:true});assert.equal(requests,8,'repeat browsing makes zero extra provider requests');await paged.rows();assert.equal(requests,16,'fresh operation still fetches provider');
console.log('PASS workflow browsing: bounded15s cache, clones, concurrent sharing, forced refresh, fresh default/coalesced reads, local/provider write invalidation, no stale-on-error, late-reader isolation; 3537-row fixture repeat browsing avoids8 record-page requests.');
