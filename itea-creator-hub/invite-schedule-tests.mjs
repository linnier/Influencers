import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';
import './public/invite-schedule.js';
const S=globalThis.InviteSchedule,limits={shootStart:'2099-06-01',shootEnd:'2099-06-10',publishStart:'2099-06-05',publishEnd:'2099-06-20'};
assert.deepEqual(S.ranges(limits),limits);
for(const bad of [{shootStart:'2099-01-01'},{shootStart:'2099-02-30',shootEnd:'2099-03-01'},{shootStart:'2099-06-10',shootEnd:'2099-06-01'},{...limits,publishStart:'2099-05-01',publishEnd:'2099-05-10'},{shootStart:123}])assert.throws(()=>S.ranges(bad));
for(const bad of [{},{shootDate:'2099-05-31',publishDate:'2099-06-06'},{shootDate:'2099-06-01',publishDate:'2099-06-21'},{shootDate:'2099-06-08',publishDate:'2099-06-07'}])assert.throws(()=>S.selection(bad,limits));
assert.deepEqual(S.selection({shootDate:'2099-06-10',publishDate:'2099-06-20'},limits),{shootDate:'2099-06-10',publishDate:'2099-06-20'});
assert.deepEqual(S.selection({}),{shootDate:'',publishDate:''});
const dir=mkdtempSync(join(tmpdir(),'itea-schedule-')),prefix='/creators';
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',TEAM_PASSWORD:'',DATA_BACKEND:'sqlite',DATA_DIR:dir,APP_BASE_PATH:prefix,PUBLIC_BASE_URL:'https://creator.test/creators',DISABLE_AUTOMATIC_REMINDERS:'true'},stdio:['ignore','pipe','pipe']});
let admin,app;
try{
 let stderr='';child.stderr.on('data',b=>stderr+=b);
 const base=await new Promise((ok,fail)=>{const t=setTimeout(()=>fail(Error(stderr||'startup timeout')),10000);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(t);ok(m[0]);}});child.once('exit',code=>{clearTimeout(t);fail(Error('server '+code+' '+stderr));});});
 const request=(path,opt={})=>fetch(base+path,{...opt,headers:{Origin:base,...opt.headers}}),post=(path,v)=>request(prefix+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});
 let r=await request(prefix+'/api/state'),initial=await r.json();initial.state.projects.push({id:'J1',name:'Schedule test',owner:'team',currency:'SGD',budget:null});initial.state.people.push({id:'P1',name:'Alice',owner:'team',tag:'',region:'SG',itea:'coupon-a',email:'alice@example.test',contact:'',notes:''});initial.state.accounts.push({id:'A1',person:'P1',platform:'Instagram',handle:'alice',fans:0,url:'https://www.instagram.com/alice/'});r=await post('/api/state',initial);assert.equal(r.status,200);
 const reward={amount:0,vouchers:0,deadline:'2099-06-01',...limits};
 r=await post('/api/workflow/open',{project:'J1',reward:{...reward,shootEnd:''}});assert.equal(r.status,400);
 let openCalls=0;const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 async function page(path){let html=await (await request(path)).text();for(const match of [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]){const src=match[1],code=src.includes('/vendor/')?'window.XLSX={};':await (await request(src)).text();html=html.replace(match[0],()=>'<script>'+(src.endsWith('/app-path.js')?'Object.defineProperty(document.currentScript,"src",{value:location.origin+"'+src+'"});':'')+code.replace(/<\/script/gi,'<\\/script')+'</script>');}return new JSDOM(html,{url:base+path,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.fetch=(path,opt={})=>{if(path===prefix+'/api/workflow/open')openCalls++;return request(path,opt);};w.scrollTo=()=>{};w.navigator.clipboard={writeText:async()=>{}};}});}
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,15));}throw Error(label+' '+errors.join(' | '));};
 admin=await page(prefix+'/');let d=admin.window.document,w=admin.window;
 await wait(()=>d.querySelector('#connection')?.textContent.includes('数据版本'),'admin data');
 d.querySelector('[data-tab="项目管理"]').click();await wait(()=>d.querySelector('[data-open-project="J1"]'),'project');d.querySelector('[data-open-project="J1"]').click();d.querySelector('[data-project-view="邀约与报名"]').click();await wait(()=>d.querySelector('#inviteShootStart'),'schedule inputs');
 const fill=(key,value)=>{const input=d.querySelector('#invite'+key[0].toUpperCase()+key.slice(1));input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
 fill('shootStart',limits.shootStart);d.querySelector('#openApplicationLink').click();assert.equal(openCalls,0);assert(d.querySelector('#inviteStatus').textContent.includes('完整'));
 for(const[k,v]of Object.entries(limits))fill(k,v);d.querySelector('#inviteDeadline').value=reward.deadline;
 // A rerender for filtering preserves the per-project range draft.
 d.querySelector('#inviteQuery').value='Alice';d.querySelector('#inviteQuery').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#inviteShootStart').value,limits.shootStart);d.querySelector('#inviteDeadline').value=reward.deadline;
 d.querySelector('#openApplicationLink').click();await wait(()=>d.querySelector('#inviteOverlay a'),'created link');assert.equal(openCalls,1);const link=d.querySelector('#inviteOverlay a').href;const token=new URL(link).pathname.split('/').pop(),apiPath='/api/apply/'+token;
 r=await request(prefix+apiPath);assert.deepEqual(S.ranges((await r.json()).reward),limits);
 app=await page(prefix+'/apply/'+token);await wait(()=>app.window.document.querySelector('#application')?.hidden===false,'public form');const f=app.window.document.querySelector('#application');assert(f.elements.shootDate.required);assert(f.elements.publishDate.required);assert.equal(f.elements.shootDate.min,limits.shootStart);assert.equal(f.elements.shootDate.max,limits.shootEnd);assert.equal(f.elements.publishDate.min,limits.publishStart);assert.equal(f.elements.publishDate.max,limits.publishEnd);
 f.elements.shootDate.value='2099-06-08';f.elements.shootDate.dispatchEvent(new app.window.Event('input'));assert.equal(f.elements.publishDate.min,'2099-06-08');f.elements.publishDate.value='2099-06-07';assert(!f.elements.publishDate.checkValidity());
 const payload={name:'Alice',email:'alice@example.test',itea:'coupon-a',contact:'',region:'SG',notes:'',consent:true,accounts:[{platform:'Instagram',handle:'alice',fans:0,url:'https://www.instagram.com/alice/'}]};
 for(const dates of [{},{shootDate:'2099-05-31',publishDate:'2099-06-05'},{shootDate:'2099-06-09',publishDate:'2099-06-08'}]){r=await post(apiPath,{...payload,...dates});assert.equal(r.status,400);}
 // Complete the actual public UI, ensuring one persisted application and exact chosen dates.
 for(const[k,v]of Object.entries(payload))if(f.elements.namedItem(k)&&k!=='consent')f.elements.namedItem(k).value=v;
 f.elements.consent.checked=true;const account=app.window.document.querySelector('[data-account]');account.querySelector('[data-field=handle]').value='alice';f.elements.shootDate.value='2099-06-09';f.elements.shootDate.dispatchEvent(new app.window.Event('input'));f.elements.publishDate.value='2099-06-10';
 f.dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>f.hidden,'submit');
 r=await request(prefix+'/api/workflow');let rows=(await r.json()).rows,application=rows.find(x=>x.kind==='application');assert.equal(application.shootDate,'2099-06-09');assert.equal(application.publishDate,'2099-06-10');assert.deepEqual(S.ranges(application.reward),limits);assert.equal(rows.filter(x=>x.kind==='application').length,1);
 r=await post(apiPath,{...payload,shootDate:'2099-06-09',publishDate:'2099-06-10'});assert.equal(r.status,200);
 d.querySelector('#inviteOverlay [data-close]').click();d.querySelector('[data-invite-tab="报名审核"]').click();await wait(()=>d.querySelector('[data-review]'),'review list');assert(d.body.textContent.includes('2099-06-09'));d.querySelector('[data-review]').click();assert(d.querySelector('#inviteOverlay').textContent.includes('2099-06-10'));
 r=await post('/api/workflow/review',{id:application.id,person:'P1',itea:'coupon-a',contact:'',amount:0,vouchers:0,checked:true});assert.equal(r.status,200);
 r=await request(prefix+'/api/workflow/export?project=J1');const csv=await r.text();assert(csv.includes('计划拍摄日期'));assert(csv.includes('2099-06-09'));assert(csv.includes('2099-06-10'));
 r=await request(prefix+'/api/state');const after=(await r.json()).state;assert.equal(after.posts.length,0,'planned date is not a published Post');assert.equal(after.collabs[0].due,'','no replacement of follow-up date');
 r=await post('/api/workflow/open',{project:'J1',reward:{amount:0,vouchers:0,deadline:'2099-06-01'}});const legacyLink=(await r.json()).link,legacyToken=new URL(legacyLink).pathname.split('/').pop();r=await post('/api/apply/'+legacyToken,{...payload,email:'another@example.test'});assert.equal(r.status,200,'unrestricted links accept old clients without dates');
 // The same limits are included on personal invitation snapshots without sending mail.
 r=await post('/api/workflow/plan',{project:'J1',people:['P1'],reward,title:'Test',body:'{{报名链接}}'});assert.equal(r.status,200);const inv=(await r.json()).invites[0];assert.deepEqual(S.ranges(inv.reward),limits);assert.equal(inv.status,'待发送');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS schedule root rules + mounted HTTP/UI: admin ranges, invalid range before dispatch, filter draft preservation, public min/max/required and date order, backend rejection/no writes, exact dates saved once, review/CSV, personal/open link snapshots, old clients and no fake actual publication or mail.');
}finally{await new Promise(r=>setTimeout(r,100));app?.window.close();admin?.window.close();if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
