import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'itea-access-')),password='unit-test-bootstrap-password';let child,base;
async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_BACKEND:'sqlite',DATA_DIR:dir,TEAM_PASSWORD:password,PUBLIC_BASE_URL:'https://creator.test'},stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',b=>err+=b);base=await new Promise((ok,fail)=>{const t=setTimeout(()=>fail(Error(err||'startup timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127.0.0.1:\d+/);if(m){clearTimeout(t);ok(m[0]);}});child.on('exit',c=>{clearTimeout(t);fail(Error('exit '+c+' '+err))});});}
async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
async function call(path,value,cookie){const headers={Origin:base};if(cookie)headers.Cookie=cookie;else headers.Authorization='Basic '+Buffer.from('team:'+password).toString('base64');if(value!==undefined)headers['Content-Type']='application/json';const r=await fetch(base+path,{method:value===undefined?'GET':'POST',headers,body:value===undefined?undefined:JSON.stringify(value),redirect:'manual'});return {status:r.status,data:await r.json(),headers:r.headers};}
async function ok(...args){const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function login(username,pass='individual-password-123'){const r=await call('/auth/login',{username,password:pass});assert.equal(r.status,200,JSON.stringify(r.data));return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
const person=(id,owner)=>({id,name:id,owner,tag:'',region:'SG',email:id+'-secret@example.com',contact:'WeChat-secret-'+id,itea:'phone-secret-'+id,notes:'private-contact-'+id}),account=(id,person)=>({id,person,platform:'Instagram',handle:id,url:'https://www.instagram.com/'+id+'/',fans:100}),project=(id,owner)=>({id,name:id,owner,budget:100,currency:'SGD'}),collab=(id,project,person,account,owner)=>({id,project,person,account,owner,stage:'已完成',confirmed:'2026-01-01',due:'',target:1}),post=(id,collab)=>({id,collab,platformId:id,title:id,url:'https://www.instagram.com/p/'+id+'/',date:'2026-01-01',updated:'2026-01-01',views:100,likes:1,comments:0,saves:0,shares:0,price:50,currency:'SGD',sourceData:'imported-contact-secret',sourceFile:'secret@example.com.xls'});

try{
 await start();await ok('/api/state',{revision:0,state:{people:[person('pA','Alpha')],accounts:[account('aA','pA')],projects:[project('PA','Alpha'),project('PB','Gamma')],collabs:[collab('cA','PA','pA','aA','Alpha')],posts:[post('postA','cA')]}});
 const users={};for(const [name,role,owner] of [['alpha','owner','Alpha'],['beta','owner','Beta'],['gamma','owner','Gamma'],['reader','viewer','']])users[name]=(await ok('/api/admin/users/create',{username:name,role,owner,password:'individual-password-123'})).user;
 const ac=await login('alpha'),bc=await login('beta'),gc=await login('gamma'),vc=await login('reader');
 const assign=(owners,expectedOwners)=>ok('/api/admin/assign-project',{project:'PA',owners,expectedOwners});
 assert.equal((await call('/api/admin/assign-project',{project:'PA',owners:['Alpha','Beta'],expectedOwners:['Alpha']},bc)).status,403);
 for(const owners of [[],['Alpha','Alpha'],['Alpha','Unknown']])assert.equal((await call('/api/admin/assign-project',{project:'PA',owners,expectedOwners:['Alpha']})).status,403);
 await assign(['Alpha','Beta'],['Alpha']);let d=await ok('/api/state',undefined,bc);assert.equal(d.state.projects[0].owner,'Alpha');assert.deepEqual(d.state.projects[0].coOwners,['Beta']);
 assert.deepEqual((await ok('/api/state',undefined,vc)).state.projects[0].coOwners,['Beta']);
 const update=async(cookie,entity,record)=>{const current=await ok('/api/state',undefined,cookie);return call('/api/state',{revision:current.revision,changes:[{entity,op:'update',record}]},cookie);};
 for(const cookie of [ac,bc]){d=await ok('/api/state',undefined,cookie);assert.equal((await update(cookie,'projects',{...d.state.projects[0],budget:250})).status,200);assert.equal((await update(cookie,'posts',{...d.state.posts[0],views:300})).status,200);assert.equal((await update(cookie,'collabs',{...d.state.collabs[0],due:'2099-01-01'})).status,200);}
 d=await ok('/api/state',undefined,bc);
 assert.equal((await update(bc,'people',{...d.state.people[0],notes:'cannot edit Alpha creator'})).status,403);
 assert.equal((await update(bc,'accounts',{...d.state.accounts[0],fans:999})).status,403);
 assert.equal((await update(gc,'posts',{...d.state.posts[0],views:999})).status,403);
 assert.equal((await update(vc,'posts',{...d.state.posts[0],views:999})).status,403);
 assert.equal((await update(bc,'projects',{...d.state.projects[0],coOwners:['Beta','Gamma']})).status,403);
 assert.equal((await update(bc,'projects',{...d.state.projects[0],owner:'Beta'})).status,403);
 assert.equal((await update(bc,'projects',{...d.state.projects[1],coOwners:['Beta'],budget:999})).status,403);
 // Ordinary clients may omit the derived membership field; it never changes the saved team.
 const without=structuredClone(d.state);delete without.projects[0].coOwners;without.posts[0].likes=7;await ok('/api/state',{revision:d.revision,state:without},bc);assert.deepEqual((await ok('/api/state')).state.projects[0].coOwners,['Beta']);
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),plan={project:'PA',people:['pA'],reward:{amount:0,vouchers:1,deadline:day},title:'Invite',body:'{{报名链接}}'};
 const invitation=(await ok('/api/workflow/plan',plan,bc)).invites[0];await ok('/api/workflow/cancel',{id:invitation.id,digest:invitation.digest,confirm:true},bc);
 await ok('/api/project-offers/scheme',{project:'PA',id:'co-owner-scheme',name:'Shared scheme',offer:{type:'mutual',amount:0,vouchers:1,deadline:day},expectedVersion:0},bc);
 await stop();await start();assert.deepEqual((await ok('/api/state',undefined,bc)).state.projects[0].coOwners,['Beta']);
 assert.equal((await call('/api/admin/assign-project',{project:'PA',owners:['Gamma'],expectedOwners:['Alpha']})).status,403);
 await assign(['Alpha'],['Alpha','Beta']);assert.equal((await call('/api/workflow/plan',plan,bc)).status,403);d=await ok('/api/state',undefined,bc);assert.equal((await update(bc,'posts',{...d.state.posts[0],views:900})).status,403);
 await assign(['Alpha','Beta'],['Alpha']);assert.equal((await call('/api/admin/users/update',{id:users.beta.id,role:'viewer',owner:''})).status,403);
 await ok('/api/admin/users/disable',{id:users.beta.id,targetOwner:'Gamma'});assert.equal((await call('/api/state',undefined,bc)).status,401);assert.deepEqual((await ok('/api/state')).state.projects[0].coOwners,['Gamma']);await ok('/api/workflow/plan',plan,gc);
 await ok('/api/admin/handover',{from:'Alpha',to:'Gamma'});d=await ok('/api/state',undefined,gc);assert.equal(d.state.projects[0].owner,'Gamma');assert.equal(d.state.projects[0].coOwners,undefined);assert.equal(d.state.people[0].owner,'Gamma');assert.equal((await call('/api/state',undefined,ac)).status,401);
 console.log('PASS project co-owners: admin assignment, primary/secondary writes and invitations, creator ownership isolation, viewer/foreign-owner denial, forged membership rejection, legacy full saves, restart persistence, removal, secondary-owner disable/handover and primary-owner handover.');
}finally{await stop();rmSync(dir,{recursive:true,force:true});}
