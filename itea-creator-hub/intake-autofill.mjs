import {createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';

// Ephemeral challenges deliberately expire on restart; nothing is written to the creator library.
export function createIntakeAutofill({store,mail,getState,key,profile,json,body,origin,rate,check}){
 const challenges=new Map(),limits=new Map();
 const normalize=v=>String(v??'').trim().toLowerCase().replace(/^@/,'');
 const digest=v=>createHmac('sha256',key).update('intake-autofill:'+v).digest('hex');
 const validEmail=v=>typeof v==='string'&&v.length<=254&&/^[^\s@;；]+@[^\s@]+\.[^\s@]+$/.test(v);
 const failure='验证码无效或已过期，请重新获取；也可直接填写资料，由团队核对。';
 const generic='若 itea 账号与原登记邮箱一致，验证码将发送至该邮箱。请查看收件箱或垃圾邮件；未收到可继续手动填写或联系团队。';
 function cleanup(){const now=Date.now();for(const [id,c]of challenges)if(c.expires<=now)challenges.delete(id);for(const [k,c]of limits)if(c.until<=now)limits.delete(k);}
 function allowance(k,max,windowMs,cooldown=0){const now=Date.now(),old=limits.get(k);check(!old||(old.count<max&&now-old.last>=cooldown),'获取验证码过于频繁，请稍后再试，或继续手动填写。');check(limits.size<10000,'请稍后再试');limits.set(k,{count:(old?.count||0)+1,last:now,until:old?.until||now+windowMs});}
 function find(s,itea,email){const matches=s.people.filter(p=>normalize(p.itea)===normalize(itea));return matches.length===1&&normalize(matches[0].email)===normalize(email)?matches[0]:null;}
 function accountURL(a){if(profile(a.url,a.platform))return a.url;const h=normalize(a.handle);let value='';if(a.platform==='Instagram')value='https://www.instagram.com/'+encodeURIComponent(h)+'/';if(a.platform==='TikTok')value='https://www.tiktok.com/@'+encodeURIComponent(h);if(a.platform==='小红书')value='https://www.xiaohongshu.com/user/profile/'+encodeURIComponent(h);return profile(value,a.platform)?value:'';}
 async function handle(req,res,url,formId){
  const m=url.pathname.match(/^\/api\/creator\/entry\/([\w.-]+)\/autofill\/(request|verify)$/);if(!m)return false;
  check(req.method==='POST','请求方法无效');origin(req);rate(req);const v=await body(req);check(v&&typeof v==='object'&&!Array.isArray(v),'提交格式错误');cleanup();
  // Validation of the signed form link is delegated to the caller, with no business-state read for metadata GETs.
  const rows=await store.rows(),form=rows.find(r=>r.kind==='intake-form'&&r.id===formId);
  check(form?.enabled,'链接不存在或暂未开放申请');
  check(typeof v.itea==='string'&&v.itea.trim()&&v.itea.length<=120&&validEmail(v.email),'请填写 itea 账号与有效的原登记邮箱');
  const identity=digest(JSON.stringify([form.id,normalize(v.itea),normalize(v.email)]));
  if(m[2]==='request'){
   allowance('account:'+digest(normalize(v.itea)),3,15*60000,60000);
   allowance('email:'+digest(normalize(v.email)),3,15*60000,60000);
   allowance('global',100,3600000);
   check(challenges.size<5000,'请稍后再试');
   const nonce=randomBytes(24).toString('base64url'),code=String(randomInt(100000,1000000));
   const c={form:form.id,identity,expires:Date.now()+10*60000,attempts:0,code:digest(nonce+':'+code),person:'',ready:false};challenges.set(nonce,c);
   const s=(await getState()).state,p=find(s,v.itea,v.email);
   if(p){c.person=p.id;try{await mail.access();const draft=await mail.draft({to:p.email.trim(),id:'verify-'+nonce,subject:'itea 资料验证 / Verify your creator details',body:'你的 itea 达人资料验证码：'+code+'\n10分钟内有效，仅用于自动填写已有资料。请勿向他人提供验证码。若非本人操作，请忽略本邮件。\n\nYour verification code is '+code+'. Valid for 10 minutes. Use it to retrieve your existing creator details. Do not share this code. Ignore this email if you did not request it.'});await mail.send(draft);c.ready=true;}catch{console.error('达人资料验证邮件未确认发送；未开放资料读取。');}}
   json(res,200,{challenge:nonce,message:generic,retryAfter:60});return true;
  }
  const c=typeof v.challenge==='string'?challenges.get(v.challenge):null;
  check(c&&c.expires>Date.now()&&c.form===form.id&&c.identity===identity&&c.attempts<5,failure);c.attempts++;
  const provided=digest(v.challenge+':'+String(v.code??''));
  check(c.ready&&timingSafeEqual(Buffer.from(c.code,'hex'),Buffer.from(provided,'hex')),failure);
  challenges.delete(v.challenge);const s=(await getState()).state,p=find(s,v.itea,v.email);check(p&&p.id===c.person,failure);
  const accounts=s.accounts.filter(a=>a.person===p.id).map(a=>({platform:a.platform,url:accountURL(a),fans:Number.isSafeInteger(a.fans)&&a.fans>=0?a.fans:null})).filter(a=>a.url).slice(0,10);
  json(res,200,{profile:{name:p.name||'',itea:p.itea||'',email:p.email||'',contact:p.contact||'',region:p.region||'',accounts},message:'已验证并带出已有资料。修改后提交，仍需团队逐条审核。'});return true;
 }
 return {handle};
}
