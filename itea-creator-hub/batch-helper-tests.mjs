import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const base=new URL('../tools/creator-profile-helper/',import.meta.url);
const source=name=>readFileSync(new URL(name,base),'utf8');
const dom=new JSDOM('',{url:'https://www.tiktok.com/search/user?q=food',runScripts:'dangerously'});
for(const f of ['profile-card.js','batch-core.js'])dom.window.eval(source(f));
const api=dom.window.IteaBatch;
assert.equal(api.searchUrl('TikTok','Singapore food'),'https://www.tiktok.com/search/user?q=Singapore%20food');
assert.equal(api.searchUrl('Instagram','tea & cake'),'https://www.instagram.com/explore/search/keyword/?q=tea%20%26%20cake');
assert.throws(()=>api.searchUrl('Other','food'));assert.throws(()=>api.searchUrl('TikTok',''));
const parsed=api.links('https://instagram.com/alice/ https://www.instagram.com/alice/ https://tiktok.com/@bob https://instagram.com/p/post/');assert.equal(parsed.valid.length,2);assert.equal(parsed.invalid.length,1);
const url=n=>'https://www.tiktok.com/@'+n;
const card=(n,fans=null)=>({status:'collected',record:{url:url(n),email:n+'@creator.test',fans,fansDisplay:fans==null?'4.1万':String(fans)}});
function task(options={}){
 const state=api.newState({mode:'search',platform:'TikTok',keyword:'food',limit:3,minFans:null,maxFans:null,...options.config});
 const calls=[],snapshots=[];let scanRound=0;
 const io={save:async s=>snapshots.push(JSON.parse(JSON.stringify(s))),searchTab:async()=>{calls.push('search');return 1},scan:async()=>{calls.push('scan');return options.scan?options.scan(scanRound++):{urls:[url('alice'),url('alice'),url('bob'),url('cara')]}},scroll:async()=>{calls.push('scroll')},profileTab:async(_,u)=>{calls.push(u);return u},read:async u=>options.read?options.read(u):u===url('alice')?card('alice'):u===url('bob')?{status:'skipped',url:u,reason:'无公开邮箱'}:{status:'blocked',reason:'验证码'},delay:async()=>calls.push('delay')};
 return {state,calls,snapshots,io,runner:new api.Runner(state,io)};
}
try{
 let t=task();await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.cursor,2);assert.equal(t.state.rows.length,1);assert.equal(t.state.outcomes.filter(x=>x.status==='skipped').length,1);assert.equal(t.state.reason,'验证码');assert.equal(t.state.candidates.length,3);assert(!t.calls.includes('scroll'));
 t.io.read=async()=>card('cara');await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.rows.length,2);assert.equal(t.calls.filter(x=>x===url('alice')).length,1,'resume must not revisit completed profiles');
 t=task({config:{minFans:10000},read:async u=>card(u.split('@')[1],u.endsWith('alice')?null:u.endsWith('bob')?500:12000)});await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.rows.length,1);assert.equal(t.state.outcomes.filter(x=>x.status==='filtered').length,2);
 t=task({scan:()=>({blocked:true,reason:'登录'})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.candidates.length,0);assert.equal(t.calls.filter(x=>x.startsWith('https:')).length,0);
 t=task({scan:()=>({urls:[]})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.match(t.state.reason,/没有识别/);
 t=task({read:async()=>({status:'error',reason:'读取失败'})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.cursor,0);assert.equal(t.state.outcomes.length,0,'read error must never become no email');await t.runner.skip();assert.equal(t.state.cursor,1);assert.equal(t.state.outcomes[0].status,'failed');
 t=task({read:async()=>card('unrelated')});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.rows.length,0);
 t=task({read:async()=>({status:'skipped',url:url('unrelated')})});await t.runner.run();assert.equal(t.state.cursor,0);assert.equal(t.state.outcomes.length,0);
 t=task();t.io.delay=async()=>t.runner.pause('手动暂停');await t.runner.run();assert.equal(t.state.cursor,1);assert.equal(t.calls.filter(x=>x.startsWith('https:')).length,1);
 t=task({config:{mode:'links',urls:[url('alice')]},read:async()=>card('alice')});await t.runner.run();assert(!t.calls.includes('search'));assert.equal(t.state.phase,'done');
 function scan(html,href='https://www.tiktok.com/search/user?q=food',platform='TikTok'){
  const d=new JSDOM(html,{url:href,runScripts:'dangerously'});try{d.window.eval(source('profile-card.js'));d.window.eval(source('scan-page.js'));return d.window.IteaScan.scan(d.window.document,platform)}finally{d.window.close()}
 }
 let r=scan('<nav><a href="/@own">Me</a></nav><main><a href="/@alice">Alice</a><a href="/@alice/video/123">Video</a><a href="https://evil.test/@other">Other</a><a hidden href="/@hidden">Hidden</a><a href="/@alice">duplicate</a></main>');assert.equal(r.urls.length,1);assert.equal(r.urls[0],url('alice'));
 assert.equal(scan('<main><a href="/@alice">Alice</a></main><div role="dialog">Please log in to continue</div>').blocked,true);
 assert.equal(scan('<main><a href="/@alice">Alice</a><div id="captcha-box">Verify</div></main>').blocked,true);
 assert.equal(scan('<main>Try again later</main>').blocked,true);
 assert.equal(scan('<main>Login</main>','https://www.tiktok.com/login').blocked,true);
 assert.equal(scan('<main><a href="/@alice">Alice</a></main>','https://www.tiktok.com/@alice').error,true);
 r=scan('<main><a href="/alice/">Alice</a><a href="/p/abc/">Post</a><a href="/explore/">Explore</a><footer><a href="/other/">Other</a></footer></main>','https://www.instagram.com/explore/search/keyword/?q=food','Instagram');assert.equal(r.urls.length,1);assert.equal(r.urls[0],'https://www.instagram.com/alice/');
 const manifest=JSON.parse(source('manifest.json'));assert.equal(manifest.version,'1.1.0');assert.deepEqual(manifest.permissions,['activeTab','scripting','clipboardWrite','storage']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.background,undefined);assert.deepEqual(manifest.optional_host_permissions,['https://www.instagram.com/*','https://www.tiktok.com/*']);
 console.log('PASS batch helper: keyword search queue, dedup, bounded scans, pause/resume, captcha/login, errors distinct from no-email, optional links, exact follower filters, URL identity, scoped DOM and optional platform permissions.');
}finally{dom.window.close()}
