import './public/invite-schedule.js';
import './public/cooperation-offers.js';
import './public/cooperation-status.js';
import {createHash} from 'node:crypto';
import {LarkError} from './lark-store.mjs';
const core=globalThis.CooperationOffers,hash=v=>createHash('sha256').update(v).digest('hex'),key=(kind,project,id)=>'OFFER_'+hash(kind+':'+project+':'+id).slice(0,32),check=(v,m,status=400)=>{if(!v)throw new LarkError(m,status);};
export function normalizeOffer(raw,options){try{return core.clean(raw,options)}catch(e){throw new LarkError(e.message,400)}}
export function offerRows(rows,project){return rows.filter(r=>r.project===project&&['offer-scheme','project-selection'].includes(r.kind));}
export function selectedOffer(rows,project,person){return rows.find(r=>r.kind==='project-selection'&&r.project===project&&r.person===person&&r.status==='预选');}
export function offerDefaults(rows,project){return rows.find(r=>r.kind==='settings'&&r.project===project)?.settings||{};}
export function offerPhase(rows,selection){return rows.some(r=>r.kind==='invite'&&r.project===selection.project&&r.person===selection.person&&CooperationStatus.blocksInvitation(r,rows))?'已进入邀约流程':'预选';}
export function createProjectOffers({store,getState,actor=()=>null,authorizeMutation=async()=>{}}){
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const clean=(v,defaults,allowPending=false)=>normalizeOffer(v,{defaults,allowPending});
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/project-offers'))return false;
  if(req.method==='GET'){
   const project=url.searchParams.get('project'),principal=actor();check(typeof project==='string'&&project.length<=80,'项目参数无效');
   if(principal?.role==='viewer'){json(res,200,{readOnly:true,schemes:[],selections:[]});return true;}
   const rows=await store.invitationRows({project,force:req.headers['x-data-refresh']==='1'||url.searchParams.get('fresh')==='1'}),data=offerRows(rows,project);
   json(res,200,{schemes:data.filter(r=>r.kind==='offer-scheme'),removedVersions:Object.fromEntries(data.filter(r=>r.kind==='project-selection'&&r.status!=='预选').map(r=>[r.person,r.version])),selections:data.filter(r=>r.kind==='project-selection'&&r.status==='预选').map(r=>({...r,phase:offerPhase(rows,r)}))});return true;
  }
  check(req.method==='POST','请求方式无效');let origin;try{origin=new URL(req.headers.origin)}catch{}check(origin?.host===req.headers.host,'禁止跨站提交');check((req.headers['content-type']||'').startsWith('application/json'),'需要JSON请求');let raw='',size=0;for await(const part of req){size+=part.length;check(size<=80000,'提交资料过长');raw+=part;}let v;try{v=JSON.parse(raw)}catch{throw new LarkError('提交格式错误',400)}
  await store.lock(async()=>{
   const rows=await store.rows(),state=(await getState({rows})).state,p=state.projects.find(p=>p.id===v.project);check(p,'项目不存在');await authorizeMutation(url.pathname,v,rows,state);
   const defaults=offerDefaults(rows,p.id),at=new Date().toISOString(),by=actor()?.username||'team',path=url.pathname.slice('/api/project-offers/'.length);
   if(path==='scheme'){
    check(typeof v.name==='string'&&v.name.trim()&&v.name.length<=60,'方案名称须为1至60字');check(typeof v.id==='string'&&/^[\w-]{8,100}$/.test(v.id),'方案编号无效');
    const id=key('scheme',p.id,v.id),old=rows.find(r=>r.id===id);check(!old||old.project===p.id&&old.kind==='offer-scheme','方案归属已变化',409);check((old?.version||0)===v.expectedVersion,'合作方案已变化，请刷新后核对',409);
    check(!rows.some(r=>r.kind==='offer-scheme'&&r.project===p.id&&r.id!==id&&r.name===v.name.trim()),'当前项目已有同名方案');
    const offer=clean(v.offer,defaults),saved=await store.put({id,sourceId:v.id,kind:'offer-scheme',project:p.id,name:v.name.trim(),offer,version:(old?.version||0)+1,created:old?.created||at,updated:at,by},{rows});json(res,200,{ok:true,scheme:saved});return;
   }
   check(['add','apply','personal','remove','progress'].includes(path),'操作不存在',404);check(Array.isArray(v.people)&&v.people.length>=1&&v.people.length<=100&&new Set(v.people).size===v.people.length,'请选择1至100位不同达人');
   check(v.people.every(id=>state.people.some(p=>p.id===id)),'达人不存在或已移入回收站');const expected=v.versions||{};
   const scheme=path==='apply'?rows.find(r=>r.kind==='offer-scheme'&&r.project===p.id&&r.id===v.scheme):null;
   if(path==='apply')check(scheme&&scheme.version===v.schemeVersion,'方案已变化，请重新核对',409);
   if(path==='personal')check(v.people.length===1,'个人权益请逐位修改');if(path==='apply')check(typeof v.replacePersonal==='boolean'&&v.confirm===true,'请先核对应用范围');
   if(path==='progress')check(typeof v.progress==='string'&&core.progressStates.includes(v.progress),'跟进状态无效');
   const updates=[],creates=[],skipped=[];
   for(const person of v.people){
    const id=key('selection',p.id,person),old=rows.find(r=>r.id===id);check((old?.version||0)===(expected[person]||0),'预选资料已变化，请刷新后核对',409);
    check(!old||old.project===p.id&&old.kind==='project-selection','记录归属已变化',409);
    check(!rows.some(r=>r.kind==='invite'&&r.project===p.id&&r.person===person&&CooperationStatus.blocksInvitation(r,rows)),'该达人已进入邀约流程，请在邀约记录或合作记录中调整');
    if(path==='add'&&old?.status==='预选'){skipped.push(person);continue;}
    if(path==='apply'&&old?.status==='预选'&&old.personalized&&!v.replacePersonal){skipped.push(person);continue;}
    const offer=path==='add'?(old?.offer||{type:'pending',amount:null,vouchers:0}):['remove','progress'].includes(path)?old?.offer:clean(path==='apply'?scheme.offer:v.offer,defaults);
    if(['remove','progress'].includes(path))check(old?.status==='预选','预选记录已变化',409);
    const record={...old,...(path==='progress'?{progress:v.progress,progressBy:by,progressUpdated:at}:{}),id,kind:'project-selection',project:p.id,person,offer,status:path==='remove'?'已移出':'预选',personalized:path==='personal'?true:path==='apply'?false:old?.personalized||false,schemeId:path==='apply'?scheme.id:old?.schemeId||'',schemeName:path==='apply'?scheme.name:old?.schemeName||'',schemeVersion:path==='apply'?scheme.version:old?.schemeVersion||0,version:(old?.version||0)+1,created:old?.created||at,updated:at,by};
    (old?updates:creates).push(record);
   }
   await store.putMany(creates,{existingRows:rows});await store.updateMany(updates,{existingRows:rows});json(res,200,{ok:true,updated:creates.length+updates.length,skipped,...(path==='progress'?{selections:updates.map(r=>({...r,phase:'预选'}))}:{})});
  });return true;
 }
 return {handle};
}
