import {randomBytes,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {forbidden,userInfo} from './access-control.mjs';
const scrypt=promisify(scryptCallback);
export const TEAM_ACCESS_ID='BUILTIN_TEAM_ACCESS';
const policyFor=rows=>rows.find(r=>r.id===TEAM_ACCESS_ID&&r.kind==='builtin-account-policy');
const administrator=row=>row?.kind==='user'&&row.role==='admin'&&row.administrator===true;
export function checkBootstrapAccess(actor,rows){if(actor.id!=='bootstrap')return;const role=policyFor(rows)?.teamRole==='viewer'?'viewer':'admin';forbidden(actor.role===role,'team 账号权限已变化，请重新登录');}
export function createAdministratorAccess({store}){
 let policyFlight=null;
 const getPolicy=async()=>{const epoch=store.rowsEpoch||0,providerEpoch=store.lark?.readEpoch||0;let flight=policyFlight;if(!flight||flight.epoch!==epoch||flight.providerEpoch!==providerEpoch){flight={epoch,providerEpoch,promise:store.get?store.get(TEAM_ACCESS_ID):store.rows({coalesce:true}).then(policyFor)};policyFlight=flight;}try{return await flight.promise;}finally{if(policyFlight===flight)policyFlight=null;}};
 const normalizeUser=u=>({...userInfo(u),...(administrator(u)?{role:'admin'}:{})});
 const teamUser=rows=>({id:'bootstrap',username:'team',role:policyFor(rows)?.teamRole==='viewer'?'viewer':'admin',owner:'',enabled:true,version:1,builtin:true});
 function view(rows,actor){const policy=policyFor(rows),admins=rows.filter(r=>administrator(r)&&r.enabled!==false),candidate=admins[0];return {complete:policy?.teamRole==='viewer',account:candidate?.username||'',canCreate:actor.id==='bootstrap'&&actor.role==='admin'&&policy?.teamRole!=='viewer'&&!admins.length,canComplete:actor.role==='admin'&&actor.id===candidate?.id&&policy?.teamRole!=='viewer'};}
 return {normalizeUser,teamUser,view,async bootstrap(){const p=await getPolicy();forbidden(!p||p.kind==='builtin-account-policy'&&p.teamRole==='viewer'&&typeof p.administratorId==='string'&&p.administratorId,'team 账号配置异常，请管理员核对');return {id:'bootstrap',username:'team',role:p?.teamRole==='viewer'?'viewer':'admin',owner:''};},async handle(path,v,actor,rows,json){
  if(path!=='admin-account/create'&&path!=='admin-account/complete')return false;
  const state=view(rows,actor);
  if(path==='admin-account/create'){
   forbidden(state.canCreate,'已有独立管理员或无权创建接管账号');
   forbidden(typeof v.username==='string'&&/^[a-zA-Z0-9_.-]{3,50}$/.test(v.username)&&v.username.toLowerCase()!=='team','管理员账号需为3至50位字母、数字或_.-，不能使用 team');
   forbidden(typeof v.password==='string'&&v.password.length>=12&&v.password.length<=200,'管理员密码需为12至200位');
   forbidden(!rows.some(r=>r.kind==='user'&&r.username.toLowerCase()===v.username.toLowerCase()),'账号名已存在，请使用新的管理员账号名');
   const salt=randomBytes(16).toString('hex'),passwordHash=Buffer.from(await scrypt(v.password,salt,64,{maxmem:64*1024*1024})).toString('hex');
   const row={id:'USER_'+randomBytes(16).toString('hex'),kind:'user',username:v.username,role:'admin',administrator:true,owner:'',enabled:true,version:1,salt,passwordHash,created:new Date().toISOString(),createdBy:actor.username};
   await store.put(row,{rows});json({ok:true,user:normalizeUser(row),teamChanged:false});return true;
  }
  forbidden(state.canComplete&&actor.id!=='bootstrap','请先使用新管理员账号登录，再完成 team 交接');
  forbidden(v.confirm===true,'请确认将 team 调整为查阅账号');
  const candidate=rows.find(r=>r.id===actor.id&&administrator(r)&&r.enabled!==false);forbidden(candidate,'新管理员账号已变化，请重新登录');
  await store.put({id:TEAM_ACCESS_ID,kind:'builtin-account-policy',teamRole:'viewer',administratorId:actor.id,administrator:actor.username,completedBy:actor.username,completedAt:new Date().toISOString()},{rows});
  json({ok:true,teamRole:'viewer',administrator:actor.username});return true;
 }};
}
