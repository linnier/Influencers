import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const LIFE=12*60*60*1000,COOKIE='itea_session',MODE='itea_login_mode';
const digest=s=>createHash('sha256').update(s).digest();
export function createTeamAuth({password,secureCookies=false,now=Date.now,lookupUser}){
 const key=createHmac('sha256',password||'local-no-password').update('itea.team.session.v1').digest(),revoked=new Map(),attempts=new Map();
 const sign=s=>createHmac('sha256',key).update(s).digest('base64url');
 const equal=(a,b)=>timingSafeEqual(digest(a),digest(b));
 const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>{const i=x.indexOf('=');return i<0?['','']:[x.slice(0,i).trim(),x.slice(i+1).trim()]}));
 function prune(){const t=now();for(const [k,v]of revoked)if(v<=t)revoked.delete(k);for(const [k,v]of attempts)if(v.until<=t)attempts.delete(k);}
 function session(req){if(!password)return {user:'team'};const token=cookies(req)[COOKIE];if(!token||token.length>1000)return null;const [body,sig,...extra]=token.split('.');if(!body||!sig||extra.length||!equal(sign(body),sig))return null;let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{return null}if(!((p.v===1&&p.user==='team')||(p.v===2&&typeof p.uid==='string'&&Number.isSafeInteger(p.uv)&&typeof p.user==='string'))||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(p.iat)||p.iat>now()+60000||p.exp<=now()||p.exp-p.iat!==LIFE||!/^\w{32}$/.test(p.id)||revoked.has(p.id))return null;return p;}
 function basic(req){if(!password)return true;if(cookies(req)[MODE]==='form')return false;return equal(String(req.headers.authorization||''),'Basic '+Buffer.from('team:'+password).toString('base64'));}
 function cookie(name,value,maxAge){return name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+maxAge+(secureCookies?'; Secure':'');}
 const modeCookie=()=>cookie(MODE,'form',LIFE/1000);
 function token(user){const iat=now(),p={v:user?2:1,user:user?.username||'team',...(user?{uid:user.id,uv:user.version}:{}),iat,exp:iat+LIFE,id:randomBytes(16).toString('hex')},body=Buffer.from(JSON.stringify(p)).toString('base64url');return body+'.'+sign(body);}
 function originOK(req){try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}}
 function reply(res,status,data,headers={}){res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));}
 async function handle(req,res,pathname){
  if(!['/auth/login','/auth/logout'].includes(pathname))return false;
  if(req.method!=='POST'){reply(res,405,{error:'不支持该请求'},{Allow:'POST'});return true;}
  if(!originOK(req)){reply(res,403,{error:'请求来源不合法'});return true;}
  prune();
  if(pathname==='/auth/logout'){const s=session(req);if(s?.id){if(revoked.size>=10000){reply(res,503,{error:'请稍后重试退出登录'});return true;}revoked.set(s.id,s.exp);}res.writeHead(303,{'Location':'/login','Cache-Control':'no-store','Set-Cookie':[cookie(COOKIE,'',0),modeCookie()]});res.end();return true;}
  const isJSON=String(req.headers['content-type']||'').startsWith('application/json'),isForm=String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded');
  if(!isJSON&&!isForm){reply(res,415,{error:'登录请求格式不支持'});return true;}
  const ip=secureCookies?String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim():req.socket.remoteAddress||'local';const attempt=attempts.get(ip);
  function failure(status,message,reason){if(isJSON)reply(res,status,{error:message});else{res.writeHead(303,{'Location':'/login?error='+reason,'Cache-Control':'no-store','Set-Cookie':modeCookie()});res.end();}}
  if(attempt?.count>=10){if(isJSON)reply(res,429,{error:'尝试次数较多，请15分钟后再试'},{'Retry-After':String(Math.max(1,Math.ceil((attempt.until-now())/1000)))});else failure(429,'尝试次数较多，请15分钟后再试','limited');return true;}
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){reply(res,413,{error:'登录内容过长'});return true;}body+=chunk;}
  let values;try{values=isJSON?JSON.parse(body):Object.fromEntries(new URLSearchParams(body))}catch{reply(res,400,{error:'登录内容格式错误'});return true;}
  const username=typeof values?.username==='string'?values.username.trim():'',entered=typeof values?.password==='string'?values.password:'';
  let account=null;const valid=password&&username.length<=120&&entered.length<=1000&&(username==='team'?equal(username+'\0'+entered,'team\0'+password):!!(account=await lookupUser?.(username,entered)));if(!valid){
   if(!attempt&&attempts.size>=10000){reply(res,503,{error:'登录繁忙，请稍后重试'});return true;}attempts.set(ip,{count:(attempt?.count||0)+1,until:attempt?.until||now()+15*60*1000});failure(401,'账号或密码不正确，请重新输入','credentials');return true;
  }
  attempts.delete(ip);const headers={'Set-Cookie':[cookie(COOKIE,token(account),LIFE/1000),modeCookie()]};
  if(isJSON)reply(res,200,{ok:true},headers);else{res.writeHead(303,{'Location':'/','Cache-Control':'no-store',...headers});res.end();}return true;
 }
 return {session,basic,handle,modeCookie};
}
