import {createHash,randomBytes} from 'node:crypto';
import {normalizeOffer} from './project-offers.mjs';
import {LarkError} from './lark-store.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),check=(ok,m,status=400)=>{if(!ok)throw new LarkError(m,status);};
export async function agreementChange({path,v,p,rows,current,store,saveState,validate,settings,preview,reviewer}){
 let a=rows.find(r=>['application','cooperation-agreement'].includes(r.kind)&&r.id===v.id&&r.project===p.id&&r.status==='已确认合作');
 if(!a&&v.person){
  a=rows.find(r=>['application','cooperation-agreement'].includes(r.kind)&&r.project===p.id&&r.person===v.person&&r.status==='已确认合作');
  if(!a){const live=current.state.collabs.filter(c=>c.project===p.id&&c.person===v.person&&(c.confirmed||c.confirmedUnknown)&&!['已取消','未选中'].includes(c.stage));check(live.length,'该达人尚未确认合作或记录已变化');const receipt=globalThis.CooperationStatus.coupon(current.state,rows,p.id,v.person);a={id:'AGREEMENT_'+hash([p.id,v.person]).slice(0,32),kind:'cooperation-agreement',project:p.id,person:v.person,status:'已确认合作',reward:{amount:live.some(c=>typeof c.agreedPrice==='number')?live.reduce((n,c)=>n+(c.agreedPrice||0),0):null,vouchers:receipt.agreed}};}
 }
 check(a,'该达人尚未确认合作或记录已变化');
 const cs=current.state.collabs.filter(c=>c.project===p.id&&c.person===a.person&&(c.confirmed||c.confirmedUnknown)&&!['已取消','未选中'].includes(c.stage));check(cs.length,'合作已取消或不存在');
 const offer=normalizeOffer({...v.offer,feeMode:'fixed'},{defaults:settings,resolve:true}),issued=globalThis.CooperationStatus.coupon(current.state,rows,p.id,a.person).issued;
 check(offer.vouchers>=issued,'约定券数不能少于已登记发放数量，请先核对发券记录');
 const shape=(list)=>list.map(c=>({id:c.id,agreedPrice:c.agreedPrice??null,due:c.due||''})).sort((a,b)=>a.id.localeCompare(b.id));
 const next=structuredClone(current.state),targets=next.collabs.filter(c=>cs.some(x=>x.id===c.id));targets.forEach((c,i)=>{c.agreedPrice=i===0?offer.amount:null;c.due=offer.publishDeadline;});validate(next);
 const digest=hash([a.id,a.reward,a.offerVersion||0,offer,current.revision,settings,issued,rows.filter(r=>r.project===p.id&&r.person===a.person&&['report','issue','issue-completion'].includes(r.kind)).map(r=>{const clean={...r};delete clean._record;return clean;})]),at=new Date().toISOString();
 if(path==='agreement-preview'){
  check(!a.offerPending,'上次权益保存尚未完成，请按原内容核查后重试',409);
  return {offer,digest,changeId:randomBytes(20).toString('hex'),notice:await preview({...a,reward:offer},next,rows)};
 }
 check(v.confirm===true&&typeof v.changeId==='string'&&/^[a-f0-9]{40}$/.test(v.changeId),'请先预览并确认权益调整');
 const auditID='OFFER_CHANGE_'+v.changeId,noticeID='OFFER_NOTICE_'+v.changeId,oldAudit=rows.find(r=>r.id===auditID),notice=rows.find(r=>r.id===noticeID);
 if(a.lastOfferChange===v.changeId){
  check(oldAudit?.project===p.id&&hash(oldAudit.after)===hash(offer),'同一调整请求内容已变化',409);
  if(oldAudit.status!=='已保存')await store.put({...oldAudit,status:'已保存',completed:at},{rows});if(notice&&notice.status==='等待权益保存')await store.put({...notice,status:'待发送'},{rows});
  return {ok:true,alreadyApplied:true,noticeId:noticeID};
 }
 if(a.offerPending||oldAudit){
  check((!a.offerPending||a.offerPending===v.changeId)&&oldAudit?.project===p.id&&oldAudit?.person===a.person&&oldAudit?.application===a.id&&oldAudit?.digest===v.digest&&hash(oldAudit.after)===hash(offer),'已有未完成的权益调整，请勿覆盖或重复提交',409);
  const actual=shape(cs),before=oldAudit.beforeBusiness,after=oldAudit.afterBusiness;
  check(hash(actual)===hash(before)||hash(actual)===hash(after),'合作费用或日期已被其他人修改，请核对未完成调整',409);
  if(!notice&&oldAudit.notice)await store.put({id:noticeID,kind:'notification',project:p.id,person:a.person,type:'confirmed',...oldAudit.notice,status:'等待权益保存',created:oldAudit.created,attempts:0,change:v.changeId},{rows});
  if(!a.offerPending)await store.put({...a,offerPending:v.changeId},{rows});
 }else{
  check(digest===v.digest,'合作记录、模板或项目资料已变化，请重新预览',409);
  const prepared=await preview({...a,reward:offer},next,rows);
  await store.put({id:auditID,kind:'offer-change',project:p.id,person:a.person,application:a.id,before:globalThis.CooperationOffers.publicReward(a.reward),after:offer,notice:prepared,beforeBusiness:shape(cs),afterBusiness:shape(targets),digest,created:at,by:reviewer(),status:'保存中'},{rows});
  await store.put({id:noticeID,kind:'notification',project:p.id,person:a.person,type:'confirmed',...prepared,status:'等待权益保存',created:at,attempts:0,change:v.changeId},{rows});
  await store.put({...a,offerPending:v.changeId},{rows});
 }
 // Write only this person's fee/date fields into the current state. No payments or vouchers are issued.
 await saveState(next,current.revision);
 await store.put({...a,reward:offer,offerPending:undefined,lastOfferChange:v.changeId,offerVersion:(a.offerVersion||0)+1},{rows});
 const audit=oldAudit||await store.get(auditID),held=notice||await store.get(noticeID);
 await store.put({...audit,status:'已保存',completed:new Date().toISOString()});
 await store.put({...held,status:'待发送'});
 return {ok:true,noticeId:noticeID};
}
