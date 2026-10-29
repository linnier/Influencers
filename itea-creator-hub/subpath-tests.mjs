import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';
import {basePath,mountedHTML} from './app-mount.mjs';
assert.equal(basePath('/creators/'),'/creators');
for(const invalid of ['creators','//creators','/../app','/x?y','/x%2fy'])assert.throws(()=>basePath(invalid));
assert.equal(mountedHTML('plain','/creators'),'plain');
const dir=mkdtempSync(join(tmpdir(),'itea-subpath-')),password='SYNTHETIC_MOUNT_PASSWORD',prefix='/creators';
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_BACKEND:'sqlite',DATA_DIR:dir,TEAM_PASSWORD:password,APP_BASE_PATH:prefix,PUBLIC_BASE_URL:'https://creator.test/creators',DISABLE_AUTOMATIC_REMINDERS:'true',LARK_APP_ID:'synthetic-app',LARK_APP_SECRET:'synthetic-secret'},stdio:['ignore','pipe','pipe']});
let dom,publicDOM;
try{
 let err='';child.stderr.on('data',b=>err+=b);
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(err||'startup timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server '+code+' '+err));});});
 const request=(path,options={})=>fetch(base+path,{...options,redirect:'manual',headers:{Origin:base,...options.headers}});
 assert.equal((await request('/api/state')).status,404);
 assert.equal((await request('/creators-other/api/state')).status,404);
 let r=await request(prefix+'?a=1');assert.equal(r.status,308);assert.equal(r.headers.get('location'),prefix+'/?a=1');
 r=await request(prefix+'/');assert.equal(r.headers.get('location'),prefix+'/login');
 const loginHTML=await (await request(prefix+'/login')).text();assert(loginHTML.includes('src="/creators/app-path.js"'));assert(loginHTML.includes('action="/creators/auth/login"'));assert(!loginHTML.includes('src="/login.js"'));
 r=await request(prefix+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'team',password})});assert.equal(r.status,200);
 const set=r.headers.getSetCookie();assert(set.every(c=>c.includes('Path=/creators/')&&c.includes('; Secure')));assert(set.some(c=>c.startsWith('itea_mount_')));
 const cookie=set.map(c=>c.split(';')[0]).join('; '),authed=(path,opt={})=>request(prefix+path,{...opt,headers:{Cookie:cookie,...opt.headers}});
 assert.equal((await authed('/api/me')).status,200);
 assert.equal((await request(prefix+'/api/me',{headers:{Cookie:cookie.replace(/itea_mount_[a-f0-9]+_session/g,'itea_session')}})).status,401,'unscoped cookie cannot authenticate');
 assert.equal((await authed('/vendor/xlsx.full.min.js')).status,200);
 let html=await (await authed('/')).text();assert(html.includes('src="/creators/project-workflow.js"'));assert(html.includes('action="/creators/auth/logout"'));
 const helper=readFileSync(new URL('./public/app-path.js',import.meta.url),'utf8');
 // Use each actual served script. The helper must see its mounted script URL.
 async function inlineScripts(source){const matches=[...source.matchAll(/<script src="([^"]+)"><\/script>/g)];for(const match of matches){const path=match[1],code=path.endsWith('/app-path.js')?helper:await (await request(path,{headers:{Cookie:cookie}})).text();const body=path.includes('/vendor/')?'window.XLSX={};':code;source=source.replace(match[0],()=>'<script data-test-path="'+path+'">'+(path.endsWith('/app-path.js')?'Object.defineProperty(document.currentScript,"src",{value:location.origin+"'+path+'"});':'')+body.replace(/<\/script/gi,'<\\/script')+'</script>');}return source;}
 const errors=[],seen=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const beforeParse=w=>{w.fetch=async(path,opt={})=>{seen.push(path);return request(path,{...opt,headers:{Cookie:cookie,...opt.headers}});};w.AbortController=globalThis.AbortController;w.AbortSignal=globalThis.AbortSignal;w.scrollTo=()=>{};w.navigator.clipboard={writeText:async()=>{}};};
 dom=new JSDOM(await inlineScripts(html),{url:base+prefix+'/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse});
 const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error(label+' '+errors.join(' | '));};
 await wait(()=>dom.window.document.querySelector('#connection')?.textContent.includes('数据版本'),'dashboard');assert(seen.includes(prefix+'/api/state'));assert(seen.every(p=>p.startsWith(prefix+'/')));
 assert.equal(dom.window.AppPath.url('https://outside.test/api'),'https://outside.test/api');assert.equal(dom.window.AppPath.url('//outside.test/api'),'//outside.test/api');assert.equal(dom.window.AppPath.url(prefix+'/api/state'),prefix+'/api/state');
 r=await authed('/api/lifecycle/form',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Test form',intro:'Test',enabled:true})});assert.equal(r.status,200);const form=(await r.json()).form;assert(form.link.startsWith('https://creator.test/creators/creator/entry/'));
 const formPath=new URL(form.link).pathname;publicDOM=new JSDOM(await inlineScripts(await (await request(formPath)).text()),{url:base+formPath,runScripts:'dangerously',virtualConsole:vc,beforeParse});
 await wait(()=>publicDOM.window.document.querySelector('#entry'),'entry');assert(seen.includes(prefix+'/api'+formPath.slice(prefix.length)));
 const payload={name:'Synthetic',email:'synthetic@example.test',itea:'test-coupon',contact:'',region:'SG',consent:true,accounts:[{platform:'Instagram',url:'https://www.instagram.com/synthetic/',fans:0}]};
 const apiPath=prefix+'/api'+formPath.slice(prefix.length);
 r=await request(apiPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,200);
 r=await authed('/api/lifecycle');assert.equal((await r.json()).intakes.length,1);
 r=await request(apiPath,{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({...payload,email:'bad@example.test'})});assert.equal(r.status,400);
 // Public campaign API and OAuth callback retain the configured base path.
 r=await authed('/api/state');const state=await r.json();state.state.projects.push({id:'J1',name:'Test project',owner:'team',currency:'SGD',budget:null});r=await authed('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});assert.equal(r.status,200);
 r=await authed('/api/workflow/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:'J1',reward:{amount:0,vouchers:0,deadline:'2099-01-01'}})});assert.equal(r.status,200);const link=(await r.json()).link;assert(link.startsWith('https://creator.test/creators/apply/'));assert.equal((await request(prefix+'/api/apply/'+new URL(link).pathname.split('/').pop())).status,200);
 r=await authed('/api/mail/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);const oauth=new URL((await r.json()).url);assert.equal(oauth.searchParams.get('redirect_uri'),'https://creator.test/creators/auth/lark-mail/callback');assert(r.headers.getSetCookie().some(c=>c.includes('_mail_state=')&&c.includes('Path=/creators/auth/lark-mail;')));
 const apiHTML=await (await request(new URL(link).pathname)).text();assert(apiHTML.includes('src="/creators/apply.js"'));
 assert.equal(errors.length,0,errors.join('\n'));
 r=await authed('/auth/logout',{method:'POST'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),prefix+'/login');assert(r.headers.getSetCookie().every(c=>c.includes('Path=/creators/')));
 console.log('PASS mounted HTTP/UI: login, cookie namespace and Secure/path, redirect, dashboard APIs/assets, public entry read/submit, campaign URL, cross-origin rejection, logout; root/other app paths excluded.');
}finally{publicDOM?.window.close();dom?.window.close();if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
