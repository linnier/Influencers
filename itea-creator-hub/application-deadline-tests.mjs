import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {createWorkflow,applicationReward} from './workflow.mjs';
const RealDate=Date;let time='2026-11-12T02:00:00Z';globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]))}static now(){return new RealDate(time).valueOf()}};
const db=new DatabaseSync(':memory:'),state={people:[{id:'D',name:'Creator',email:'creator@example.test'}],accounts:[{id:'A',person:'D',platform:'Instagram',handle:'deadline_creator',fans:1000,url:''}],projects:[{id:'P',name:'Deadline fixture',currency:'SGD'}],collabs:[],posts:[]};
const flow=createWorkflow({lark:null,db,auth:{session:()=>({user:'team'})},getState:async()=>({state,revision:0}),saveState:async()=>{},validate:()=>{},baseURL:'https://creator.test',appId:'synthetic',appSecret:'synthetic'});
async function call(path,payload,pub=false){const req=Readable.from(payload===undefined?[]:[Buffer.from(JSON.stringify(payload))]);req.method=payload===undefined?'GET':'POST';req.headers={host:'creator.test',origin:'https://creator.test','content-type':'application/json'};let data,status;const res={writeHead(s){status=s},end(v){data=JSON.parse(v)}};assert(await flow[pub?'publicHandle':'handle'](req,res,new URL(path,'https://creator.test')));assert.equal(status,200);return data}
const signup=email=>({name:'Applicant',email,itea:'',contact:'',region:'SG',notes:'',consent:true,accounts:[{platform:'Instagram',handle:'applicant',fans:null,url:''}]}),settings=async deadline=>flow.store.put({id:'SET',kind:'settings',project:'P',settings:{inviteDeadline:deadline}}),reward={amount:0,vouchers:10,deadline:'2026-12-01'};
try{
 const open=await call('/api/workflow/open',{project:'P',reward}),path='/api/apply/'+open.link.split('/').pop(),original=(await flow.store.rows()).find(r=>r.kind==='invite');
 assert.equal((await call(path,undefined,true)).reward.deadline,'2026-12-01');
 await settings('2026-11-12');assert.equal((await call(path,undefined,true)).reward.deadline,'2026-11-12','old public link immediately follows shortened project date');
 time='2026-11-12T15:59:59Z';await call(path,signup('before@example.test'),true);assert.equal((await flow.store.rows()).filter(r=>r.kind==='application').length,1,'Singapore cutoff day inclusive');
 time='2026-11-12T16:00:00Z';await assert.rejects(call(path,undefined,true),/报名已截止/);await assert.rejects(call(path,signup('after@example.test'),true),/报名已截止/);assert.equal((await flow.store.rows()).filter(r=>r.kind==='application').length,1,'preopened tab cannot submit after midnight; earlier application retained');
 await assert.rejects(call('/api/workflow/open',{project:'P',reward}),/项目报名已截止/);await assert.rejects(call('/api/workflow/plan',{project:'P',people:['D'],reward,title:'Invitation',body:'{{报名链接}}'}),/项目报名已截止/);
 assert.deepEqual((await flow.store.rows()).find(r=>r.id===original.id),original,'old invitation history never rewritten');
 await settings('2026-11-11');time='2026-11-12T02:00:00Z';await assert.rejects(call(path,undefined,true),/报名已截止/);await assert.rejects(call(path,signup('old-tab@example.test'),true),/报名已截止/);
 await settings('2026-11-25');const planned=await call('/api/workflow/plan',{project:'P',people:['D'],reward,title:'Invitation',body:'{{报名链接}}'});assert.equal(planned.invites[0].reward.deadline,'2026-11-25','new invitation email and link use effective cutoff');const invitation=planned.invites[0],dedicated='/api/apply/'+invitation.link.split('/').pop();
 await settings('2026-11-13');assert.equal((await call(dedicated,undefined,true)).reward.deadline,'2026-11-13');await call(dedicated,signup('creator@example.test'),true);const stored=(await flow.store.rows()).find(r=>r.id===invitation.id);assert.deepEqual(stored.reward,invitation.reward,'dedicated submission changes status without overwriting original offer');assert.equal(stored.status,'报名待审核');
 await settings('2026-11-30');assert.equal(applicationReward({project:'P',reward:{deadline:'2026-11-14'}},await flow.store.rows()).deadline,'2026-11-14','project extension cannot reopen an earlier-expired individual link');
 await settings('invalid');await assert.rejects(call(path,undefined,true),/项目报名截止日期无效/);
 console.log('PASS registration deadline: old shared/dedicated links capped by current project setting, Singapore 23:59:59 / midnight boundary, late GET and preopened POST blocked without saving, expired project cannot generate invites, accurate new email cutoff, earlier-link limit and immutable invitation/history. In-memory fixtures only, no production writes or mail.');
}finally{db.close();globalThis.Date=RealDate}
