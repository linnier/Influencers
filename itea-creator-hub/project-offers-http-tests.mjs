import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'itea-offers-http-')),password='bootstrap-test-password-long';let child,base;
async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_BACKEND:'sqlite',DATA_DIR:dir,TEAM_PASSWORD:password,APP_BASE_PATH:'/creators',PUBLIC_BASE_URL:'https://creator.test/creators'},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);base=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(stderr||'Startup timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127.0.0.1:\d+/);if(m){clearTimeout(t);resolve(m[0]);}});child.once('exit',c=>{clearTimeout(t);reject(Error('Server '+c+' '+stderr));});});}
async function stop(){if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
async function call(path,value,cookie){const headers={Origin:base,...(cookie?{Cookie:cookie}:{Authorization:'Basic '+Buffer.from('team:'+password).toString('base64')})};if(value!==undefined)headers['Content-Type']='application/json';const r=await fetch(base+'/creators'+path,{method:value===undefined?'GET':'POST',headers,body:value===undefined?undefined:JSON.stringify(value),redirect:'manual'});return {status:r.status,data:await r.json(),headers:r.headers};}
async function ok(...args){const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function login(name){const r=await call('/auth/login',{username:name,password:'individual-password-123'});assert.equal(r.status,200);return r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
try{
 await start();await ok('/api/state',{revision:0,state:{people:[{id:'PERSON',name:'Creator',owner:'Alpha',tag:'美食',region:'SG',email:'creator@example.com',contact:'',itea:'member',notes:''}],accounts:[{id:'ACCOUNT',person:'PERSON',platform:'Instagram',handle:'creator',url:'',fans:1000}],projects:[{id:'PA',name:'Alpha Project',owner:'Alpha',budget:1000,currency:'SGD'},{id:'PB',name:'Beta Project',owner:'Beta',budget:1000,currency:'SGD'}],collabs:[],posts:[]}});
 await ok('/api/admin/users/create',{username:'alpha',role:'owner',owner:'Alpha',password:'individual-password-123'});await ok('/api/admin/users/create',{username:'reader',role:'viewer',owner:'',password:'individual-password-123'});
 const owner=await login('alpha'),viewer=await login('reader'),offer={type:'paid',feeMode:'quote',amount:null,estimate:150,vouchers:4,deadline:day(10),publishDeadline:day(20),note:'PRIVATE INTERNAL NOTE'};
 const scheme=(await ok('/api/project-offers/scheme',{project:'PA',id:'scheme-http-test',name:'Quoted creators',offer,expectedVersion:0},owner)).scheme;
 assert.equal((await call('/api/project-offers/scheme',{project:'PB',id:'scheme-http-test',name:'Forbidden',offer,expectedVersion:0},owner)).status,403);
 assert.equal((await call('/api/project-offers/add',{project:'PA',people:['PERSON'],versions:{}},viewer)).status,403);
 await ok('/api/project-offers/add',{project:'PA',people:['PERSON'],versions:{}},owner);
 let d=await ok('/api/project-offers?project=PA',undefined,owner),version=d.selections[0].version;
 await ok('/api/project-offers/apply',{project:'PA',people:['PERSON'],versions:{PERSON:version},scheme:scheme.id,schemeVersion:scheme.version,replacePersonal:false,confirm:true},owner);
 d=await ok('/api/project-offers?project=PA',undefined,viewer);assert(d.readOnly);assert.equal(d.schemes.length,0);assert(!JSON.stringify(d).includes('PRIVATE'));
 for(const path of ['/cooperation-offers.js','/project-offers-ui.js']){const r=await fetch(base+'/creators'+path,{headers:{Cookie:owner}});assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/javascript/);assert((await r.text()).length>100);}
 const before=await ok('/api/project-offers?project=PA',undefined,owner);await stop();await start();const after=await ok('/api/project-offers?project=PA',undefined,owner);assert.deepEqual(after,before,'Persistent offers survive restart');
 const plan=await ok('/api/workflow/plan',{project:'PA',people:['PERSON'],selectionVersions:{PERSON:after.selections[0].version},reward:{amount:0,vouchers:0,deadline:day(1)},title:'Invitation',body:'{{合作权益}}\n{{报名链接}}'},owner);assert.equal(plan.invites[0].reward.amount,null);assert(plan.invites[0].link.startsWith('https://creator.test/creators/apply/'));
 const state=await ok('/api/state',undefined,owner);assert.equal(state.state.collabs.length,0);assert.equal(state.state.posts.length,0);
 console.log('PASS mounted production HTTP: owner-only mutations and cross-project denial, viewer read/write limits, new script assets, SQLite restart persistence, individual quote planning, mounted public links, no mail/collaboration/Post side effects.');
}finally{await stop();rmSync(dir,{recursive:true,force:true});}
