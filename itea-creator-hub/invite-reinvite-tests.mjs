import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {createWorkflow} from './workflow.mjs';
const db=new DatabaseSync(':memory:'),state={people:[{id:'D',name:'Creator',email:'creator@example.test',owner:'Amy'}],accounts:[{id:'A',person:'D',platform:'Instagram',handle:'creator',url:'',fans:1000}],projects:[{id:'P',name:'Project',currency:'SGD',owner:'Amy',budget:1000},{id:'OTHER',name:'Other',currency:'SGD',owner:'Amy',budget:1000}],collabs:[],posts:[]};let externalCalls=0;
const flow=createWorkflow({db,lark:null,auth:{session:()=>({user:'team'})},getState:async()=>({state,revision:1}),saveState:()=>{throw Error('unexpected business write')},validate:()=>{},baseURL:'https://creator.test',appId:'test',appSecret:'test',fetchImpl:async()=>{externalCalls++;throw Error('must not send')}});
const payload={project:'P',people:['D'],reward:{amount:0,vouchers:10,deadline:'2099-01-01'},title:'Invite {{达人名称}}',body:'Apply {{报名链接}}'};
async function call(path,data){const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);req.method=data?'POST':'GET';req.headers={host:'creator.test',origin:'https://creator.test','content-type':'application/json'};let result;await flow.handle(req,{writeHead(status){assert.equal(status,200)},end(body){result=JSON.parse(body)}},new URL('https://creator.test/api/workflow'+path));return result;}
try{
 const first=(await call('/plan',payload)).invites[0];await assert.rejects(call('/plan',payload),/已有邀约/);
 assert.equal((await call('/cancel',{id:first.id,digest:first.digest,confirm:true})).cancelled,true);const cancelled=(await flow.store.rows()).find(r=>r.id===first.id);
 const next=(await call('/plan',{...payload,reward:{...payload.reward,vouchers:5}})).invites[0];assert.notEqual(next.id,first.id);assert.equal(next.status,'待发送');assert.equal(next.reward.vouchers,5);assert.equal(next.reward.amount,0);assert.notEqual(next.link,first.link);assert.deepEqual((await flow.store.rows()).find(r=>r.id===first.id),cancelled,'historical cancellation unchanged');await assert.rejects(call('/plan',payload),/已有邀约/);
 await call('/cancel',{id:next.id,digest:next.digest,confirm:true});const races=await Promise.allSettled([call('/plan',payload),call('/plan',payload)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'locked concurrent re-invites create one pending invitation');const third=races.find(r=>r.status==='fulfilled').value.invites[0];await call('/cancel',{id:third.id,digest:third.digest,confirm:true});
 for(const status of ['待发送','准备草稿','发送中','已提交邮箱','已送达','结果未知','报名待审核','已确认合作','不合作']){await flow.store.put({...third,status});await assert.rejects(call('/plan',payload),/已有邀约/,status);}
 await flow.store.put({...third,status:'已取消发送',message:'receipt'});await assert.rejects(call('/plan',payload),/已有邀约/);
 await flow.store.put({...third,status:'已取消发送'});await flow.store.put({id:'APP',kind:'application',invite:third.id,project:'P',status:'待审核'});await assert.rejects(call('/plan',payload),/已有邀约/);
 const other=(await call('/plan',{...payload,project:'OTHER'})).invites[0];assert.equal(other.project,'OTHER');assert.equal(externalCalls,0);
 assert.equal(globalThis.CooperationStatus.blocksInvitation({...first,status:'已取消发送'},[]),false);assert.equal(globalThis.CooperationStatus.blocksInvitation({...first,status:'已取消发送'},[{id:'A',kind:'application',invite:first.id}]),true);
 console.log('PASS cancelled re-invitation: actual cancel/replan, fresh links/rewards, historical records unchanged, pending duplicate and concurrent duplicate rejection, sent/unknown/application/receipt guards, project scope, no mail or business writes.');
}finally{db.close()}
