import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {WorkflowStore} from './workflow-store.mjs';
import {createDiscovery,discoveryTags,appendDiscoveryTags,importPlan} from './discovery-core.mjs';
const db=new DatabaseSync(':memory:'),store=new WorkflowStore({db}),actor={id:'A',role:'owner',owner:'Amy'},url='https://www.instagram.com/unified_tags/',id='DISC_'+createHash('sha256').update(actor.id+'\0'+url).digest('hex').slice(0,40);
const original={id,kind:'discovery',by:'A',name:'Unified',email:'tags@example.test',category:'二次元、VIP',tags:'二次元，vip；艺术',region:'MY',note:'keep',accounts:[{platform:'Instagram',handle:'unified_tags',url,fans:123}],sources:[{url,kind:'手动补充',excerpt:'keep'}]};
const state={people:[],accounts:[],projects:[],collabs:[],posts:[]};
const handler=createDiscovery({store,getState:async()=>({state,revision:1}),fetchPage:async()=>{throw Error('offline fixture')},checkActor:()=>{},validate:()=>{},saveState:async()=>{throw Error('unexpected business write')}});
async function call(path,payload){let result;await handler.handle({method:payload===undefined?'GET':'POST'},{},new URL('https://test/api/discovery'+path),actor,payload,(_,status,data)=>{assert.equal(status,200);result=data});return result}
try{
 await store.put(original);const before=await store.rows();let row=(await call('')).rows[0];assert.equal(row.tags,'二次元、VIP、艺术');assert.equal(row.category,'');assert.deepEqual(await store.rows(),before,'GET does not migrate stored data');
 assert.equal(discoveryTags({category:'艺术',tags:'艺术,VIP'}),'艺术、VIP');const plan=appendDiscoveryTags([original],'探店、vip');assert.equal(plan.changed[0].tags,'二次元、VIP、艺术、探店');assert.equal(plan.changed[0].category,'');assert.equal(importPlan(state,[original],{owner:'Amy',actor}).state.people[0].tag,'二次元、VIP、艺术');
 const save=tags=>call('/save',{id,name:original.name,url,email:original.email,fans:123,region:'MY',note:'keep',sources:original.sources,tags});
 await save('艺术、艺术,美食');row=(await call('')).rows[0];assert.equal(row.tags,'艺术、美食');assert.equal(row.category,'');assert.equal(row.region,'MY');assert.equal(row.note,'keep');assert.deepEqual(row.sources,original.sources);
 await save('');assert.equal((await call('')).rows[0].tags,'');await call('/profile-cards',{cards:[{schema:'itea.creator.profile-card.v1',url,platform:'Instagram',handle:'unified_tags',name:'Unified',email:original.email,emailSource:'visible-profile-card',cardText:'Unified tags@example.test',fans:123,fansDisplay:'123'}]});assert.equal((await call('')).rows[0].tags,'','cleared legacy labels do not return');
 await call('/save',{id,name:original.name,url,email:original.email,sources:original.sources,category:'旧接口'});assert.equal((await call('')).rows[0].tags,'旧接口');
 await call('/tags',{ids:[id],tags:'批量'});await call('/save',{id,name:original.name,url,email:original.email,sources:original.sources});assert.equal((await call('')).rows[0].tags,'旧接口、批量','field edit preserves unified labels');
 await assert.rejects(save('x'.repeat(2001)),/2000/);assert.equal((await call('')).rows[0].tags,'旧接口、批量');
 console.log('PASS unified discovery tags: legacy read merge without writes, dedupe, canonical manual replacement/clear, legacy API compatibility, bulk shared data, import retention and limits.');
}finally{db.close()}
