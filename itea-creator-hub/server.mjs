import http from 'node:http';
import './public/post-links.js';
import {configuredLark} from './lark-store.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTeamAuth} from './auth.mjs';
import {createWorkflow} from './workflow.mjs';
import {createLifecycle} from './lifecycle.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
const password=process.env.TEAM_PASSWORD||'';
if(!['127.0.0.1','localhost','::1'].includes(host)&&password.length<16)throw Error('对外访问必须配置至少16位TEAM_PASSWORD，使用HTTPS反向代理。');
const auth=createTeamAuth({password,secureCookies:process.env.RENDER==='true'||process.env.RENDER_EXTERNAL_URL?.startsWith('https://')===true});
const mode=process.env.DATA_BACKEND||'sqlite';
if(!['sqlite','lark'].includes(mode))throw Error('DATA_BACKEND必须为sqlite或lark');
const lark=mode==='lark'?configuredLark():null;
const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(resolve(dataDir,'creator-hub.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, changed_at TEXT NOT NULL);');
const empty={people:[],accounts:[],projects:[],collabs:[],posts:[]};db.prepare('INSERT OR IGNORE INTO workspace (id,revision,state) VALUES (1,0,?)').run(JSON.stringify(empty));
const html=readFileSync(resolve(root,'public/index.html')),loginHTML=readFileSync(resolve(root,'public/login.html')),loginJS=readFileSync(resolve(root,'public/login.js'));
function redirect(res,to){res.writeHead(303,{'Location':to,'Cache-Control':'no-store'});res.end();}
const assets=new Map(['/bulk-core.js','/bulk-ui.js','/finance.js','/creator-import.js','/project-workflow.js','/post-links.js','/multi-import.js','/invite-workflow.js','/lifecycle-ui.js','/ui-preferences.js','/vendor/xlsx.full.min.js'].map(path=>[path,readFileSync(resolve(root,'public'+path))]));
const stages=['已报名','筛选中','沟通中','已确认合作','执行中','已完成','未选中','已取消'];
function requireThat(ok,msg){if(!ok)throw Error(msg)}
function text(v,max=160){return typeof v==='string'&&v.length<=max}
function nonempty(v,max=160){return text(v,max)&&!!v.trim()}
function date(v){return v===''||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}
function safeURL(v){if(v==='')return true;try{return text(v,1000)&&['https:','http:'].includes(new URL(v).protocol)}catch{return false}}
function validate(s){
 requireThat(s&&typeof s==='object'&&!Array.isArray(s),'数据格式错误');
 for(const key of Object.keys(empty)){requireThat(Array.isArray(s[key])&&s[key].length<=10000,'记录数量或格式错误');const ids=new Set();for(const x of s[key]){requireThat(x&&nonempty(x.id,80)&&!ids.has(x.id),'ID不能为空或重复');ids.add(x.id);}}
 const persons=new Set(s.people.map(p=>p.id)),accounts=new Map(s.accounts.map(a=>[a.id,a])),projects=new Set(s.projects.map(p=>p.id)),collabs=new Map(s.collabs.map(c=>[c.id,c]));
 for(const p of s.people)requireThat(nonempty(p.name,60)&&text(p.tag,2000)&&text(p.region,60)&&nonempty(p.owner,60)&&text(p.itea??'',120)&&text(p.contact??'',4000)&&text(p.email??'',4000)&&(!(p.email??'')||p.email.split(/;\s*|；/).every(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))),'达人名称、负责人、邮箱或资料不合法');
 for(const p of s.projects){requireThat(p.budget==null||(typeof p.budget==='number'&&Number.isFinite(p.budget)&&p.budget>=0),'预算必须为非负数');requireThat(!p.currency||['CNY','SGD'].includes(p.currency),'费用币种必须为 CNY 或 SGD');}
 for(const p of s.projects)requireThat(nonempty(p.name,100)&&nonempty(p.owner,60),'项目名称或负责人不合法');
 const accountKeys=new Set();for(const a of s.accounts){requireThat(persons.has(a.person)&&['小红书','Instagram','TikTok'].includes(a.platform)&&nonempty(a.handle,80)&&safeURL(a.url??'')&&(a.fans===null||Number.isSafeInteger(a.fans)&&a.fans>=0),'账号资料或关联达人不合法');const key=a.platform+':'+a.handle.trim().toLowerCase().replace(/^@/,'');requireThat(!accountKeys.has(key),'平台账号重复');accountKeys.add(key);}
 const collabKeys=new Set();for(const c of s.collabs){requireThat(persons.has(c.person)&&accounts.get(c.account)?.person===c.person&&projects.has(c.project),'合作关联记录不合法');requireThat(stages.includes(c.stage)&&nonempty(c.owner,60)&&date(c.due)&&date(c.confirmed)&&Number.isSafeInteger(c.target)&&c.target>=1&&c.target<=100,'合作阶段、负责人、日期或约定数不合法');const key=c.project+':'+c.account;requireThat(!collabKeys.has(key),'同一项目的账号合作重复');collabKeys.add(key);requireThat(!['已确认合作','执行中','已完成'].includes(c.stage)||!!(c.confirmed||c.confirmedUnknown),'已合作记录缺少确认日期');requireThat(!['已报名','筛选中','沟通中'].includes(c.stage)||!(c.confirmed||c.confirmedUnknown),'已确认记录不可退回报名阶段');}
 for(const c of s.collabs)requireThat(c.confirmedUnknown==null||typeof c.confirmedUnknown==='boolean','确认日期未知标记不合法');
 const postKeys=new Set(),checkedPosts=[];for(const p of s.posts){const c=collabs.get(p.collab);requireThat(c&&!!(c.confirmed||c.confirmedUnknown),'Post必须关联有效已确认合作');requireThat((nonempty(p.platformId,120)||nonempty(p.url,1000))&&nonempty(p.title,120)&&date(p.date)&&(!!p.date||p.dateUnknown===true)&&date(p.updated)&&!!p.updated,'Post内容与日期不合法');for(const k of ['views','likes','comments','saves','shares'])requireThat(p[k]===null||Number.isSafeInteger(p[k])&&p[k]>=0,'指标必须为非负整数或空值');const pl=accounts.get(c.account).platform;requireThat(!checkedPosts.some(old=>old.platform===pl&&PostLinks.duplicate(old.post,p,pl)),'笔记链接或平台记录重复');checkedPosts.push({platform:pl,post:p});const key=pl+':'+(p.platformId||p.url).trim();requireThat(!postKeys.has(key),'平台Post ID重复');postKeys.add(key);}
 for(const p of s.posts){const pr=s.projects.find(x=>x.id===collabs.get(p.collab)?.project);requireThat(!(p.currency&&pr?.currency&&p.currency!==pr.currency),'Post币种与项目币种不一致');for(const k of ['price','paidCost'])requireThat(p[k]==null||(typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0),'费用必须为非负数');for(const k of ['reportedInteractions','exposure','paidExposure','paidViews','paidInteractions','follows','sourceRow'])requireThat(p[k]==null||(Number.isSafeInteger(p[k])&&p[k]>=0),'扩展指标必须为非负整数');requireThat(safeURL(p.url??'')&&(!p.currency||['CNY','SGD'].includes(p.currency)),'发布链接或币种不合法');for(const k of ['contentType','form','related','sourceFile','sourceData'])requireThat(text(p[k]??'',k==='sourceData'?20000:4000),'导入资料过长');}
 for(const p of s.posts){requireThat(p.dateUnknown==null||typeof p.dateUnknown==='boolean','发布日期未知标记不合法');requireThat(p.voucherCount==null||Number.isSafeInteger(p.voucherCount)&&p.voucherCount>=0&&p.voucherCount<=1e9,'发券张数必须为非负整数或留空');requireThat(p.voucherCost==null||p.voucherCount!=null&&p.voucherCost===p.voucherCount*3,'券包费用必须等于发券张数乘以3');requireThat(!p.voucherCurrency||p.voucherCurrency==='SGD','券包费用固定以SGD记录');}
 for(const c of s.collabs)requireThat(c.agreedPrice==null||typeof c.agreedPrice==='number'&&Number.isFinite(c.agreedPrice)&&c.agreedPrice>=0,'约定合作费用不合法');
 for(const c of s.collabs)requireThat(c.stage!=='已完成'||s.posts.filter(p=>p.collab===c.id).length>=c.target,'完成合作的发布数量不足');
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const getWorkflowState=async()=>{if(lark)return lark.read();const row=db.prepare('SELECT revision,state FROM workspace WHERE id=1').get();return {revision:row.revision,state:JSON.parse(row.state)}};
const hooks={};
const saveWorkflowState=async(state,revision)=>{if(lark)return lark.saveInner(state,revision);const row=db.prepare('UPDATE workspace SET state=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').get(JSON.stringify(state),revision);if(!row)throw Object.assign(Error('资料已更新，请重新审核'),{status:409});return row;};
const workflow=createWorkflow({lark,db,auth,validate,getState:getWorkflowState,saveState:saveWorkflowState,hooks});
const lifecycle=createLifecycle({store:workflow.store,mail:workflow.mail,getState:getWorkflowState,saveState:saveWorkflowState,validate,key:process.env.LARK_APP_SECRET||password||'local-workflow-development',baseURL:process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL});
hooks.confirmed=lifecycle.confirmed;hooks.issued=lifecycle.issued;
const reminderTimer=setInterval(()=>void lifecycle.tick(),60000);reminderTimer.unref();
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(req.method==='GET'&&url.pathname==='/health'){json(res,200,{ok:true});return}
  if(await auth.handle(req,res,url.pathname))return;
  if(await lifecycle.publicHandle(req,res,url))return;
  if(await workflow.publicHandle(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/login'){if(auth.session(req)){redirect(res,'/');return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Set-Cookie':auth.modeCookie()});res.end(loginHTML);return;}
  if(req.method==='GET'&&url.pathname==='/login.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(loginJS);return;}
  // Navigations use the form session. Existing API clients keep explicit Basic access.
  if(!auth.session(req)&&!(url.pathname.startsWith('/api/')&&auth.basic(req))){if(req.method==='GET'&&url.pathname==='/')redirect(res,'/login');else json(res,401,{error:'登录已过期，请重新登录'});return;}
  if(await lifecycle.handle(req,res,url))return;
  if(await workflow.handle(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"});res.end(html);return}
  if(req.method==='GET'&&assets.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(assets.get(url.pathname));return}
  if(req.method==='GET'&&url.pathname==='/health'){json(res,200,{ok:true});return}
  if(req.method==='GET'&&url.pathname==='/api/connection'){json(res,200,lark?lark.status():{mode:'sqlite',configured:true});return}
  if(req.method==='GET'&&url.pathname==='/api/setup'){json(res,200,lark?await lark.inspect():{mode:'sqlite'});return}
  const importRoute=['/api/import/check','/api/import/prepare-fields'].includes(url.pathname);
  if(url.pathname!=='/api/state'&&!importRoute){json(res,404,{error:'页面不存在'});return}
  if(req.method==='GET'&&lark&&!importRoute){json(res,200,await lark.read());return}
  if(req.method==='GET'&&!importRoute){const row=db.prepare('SELECT revision,state FROM workspace WHERE id=1').get();json(res,200,{revision:row.revision,state:JSON.parse(row.state)});return}
  if(req.method!=='POST'){json(res,405,{error:'不支持该请求'});return}
  // Credentials are only safe with same-origin writes. Proxy deployments preserve the external Host.
  let origin;try{origin=new URL(req.headers.origin||'')}catch{json(res,403,{error:'请求来源不合法'});return}
  if(origin.host!==req.headers.host){json(res,403,{error:'禁止跨站修改'});return}
  if(!(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:'需要JSON请求'});return}
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){json(res,413,{error:'数据超过2MB上限'});return}body+=chunk;}
  if(url.pathname==='/api/import/prepare-fields'){json(res,200,lark?await lark.prepareImportFields():{added:[]});return}
  let payload;try{payload=JSON.parse(body);requireThat(lark?typeof payload.revision==='string'&&/^[a-f0-9]{64}$/.test(payload.revision):Number.isSafeInteger(payload.revision)&&payload.revision>=0,'版本号错误');validate(payload.state)}catch(e){json(res,400,{error:e.message});return}
  if(url.pathname==='/api/import/check'){if(lark)json(res,200,await lark.preflight(payload.state,payload.revision));else{const r=db.prepare('SELECT revision FROM workspace WHERE id=1').get();json(res,r.revision===payload.revision?200:409,r.revision===payload.revision?{ok:true}:{error:'资料已更新，请刷新重新预览'});}return}
  if(lark){json(res,200,await lark.save(payload.state,payload.revision));return}
  const row=db.prepare('UPDATE workspace SET state=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').get(JSON.stringify(payload.state),payload.revision);
  if(!row){json(res,409,{error:'同事已更新数据，已重新载入最新版本，请重新提交'});return}
  db.prepare('INSERT INTO audit (revision,changed_at) VALUES (?,?)').run(row.revision,new Date().toISOString());json(res,200,{revision:row.revision});
 }catch(e){console.error('Request failed:',e.message);if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'服务端错误，请稍后重试'});else res.end();}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口 '+port+' 已被占用，请停止原网站窗口后再启动，不要重复启动。':'网站启动失败：'+e.message);db.close();process.exit(1)});
server.listen(port,host,()=>console.log('Creator Hub listening on http://'+host+':'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
