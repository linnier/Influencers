import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const base=new URL('../tools/creator-profile-helper/',import.meta.url);
const source=name=>readFileSync(new URL(name,base),'utf8');
const dom=new JSDOM('',{url:'https://www.tiktok.com/search/user?q=food',runScripts:'dangerously'});
for(const f of ['follower-count.js','profile-card.js','scan-page.js','batch-core.js'])dom.window.eval(source(f));
const api=dom.window.IteaBatch;
assert.equal(api.searchUrl('TikTok','Singapore food'),'https://www.tiktok.com/search?q=Singapore%20food');
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
 t=task({config:{minFans:10000},read:async u=>card(u.split('@')[1],u.endsWith('alice')?null:u.endsWith('bob')?500:12000)});await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.rows.length,3);assert.equal(t.state.outcomes.filter(x=>x.status==='filtered').length,1);
 t=task({scan:()=>({blocked:true,reason:'登录'})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.candidates.length,0);assert.equal(t.calls.filter(x=>x.startsWith('https:')).length,0);
 t=task({scan:()=>({urls:[]})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.match(t.state.reason,/没有识别/);
 t=task({read:async()=>({status:'error',reason:'读取失败'})});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.cursor,0);assert.equal(t.state.outcomes.length,0,'read error must never become no email');await t.runner.skip();assert.equal(t.state.cursor,1);assert.equal(t.state.outcomes[0].status,'failed');
 t=task({read:async()=>card('unrelated')});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.rows.length,0);
 t=task({read:async()=>({status:'skipped',url:url('unrelated')})});await t.runner.run();assert.equal(t.state.cursor,0);assert.equal(t.state.outcomes.length,0);
 t=task();t.io.delay=async()=>t.runner.pause('手动暂停');await t.runner.run();assert.equal(t.state.cursor,1);assert.equal(t.calls.filter(x=>x.startsWith('https:')).length,1);
 t=task({config:{mode:'links',urls:[url('alice')]},read:async()=>card('alice')});await t.runner.run();assert(!t.calls.includes('search'));assert.equal(t.state.phase,'done');
 function scan(html,href='https://www.tiktok.com/search/user?q=food',platform='TikTok'){
  const d=new JSDOM(html,{url:href,runScripts:'dangerously'});try{d.window.eval(source('follower-count.js'));d.window.eval(source('profile-card.js'));d.window.eval(source('scan-page.js'));return d.window.IteaScan.scan(d.window.document,platform)}finally{d.window.close()}
 }
 let r=scan('<nav><a href="/@own">Me</a></nav><main><a href="/@alice">Alice</a><a href="/@alice/video/123">Video</a><a href="https://evil.test/@other">Other</a><a hidden href="/@hidden">Hidden</a><a href="/@alice">duplicate</a></main>');assert.equal(r.urls.length,1);assert.equal(r.urls[0],url('alice'));
 assert.equal(scan('<main><a href="/@alice">Alice</a></main><div role="dialog">Please log in to continue</div>').blocked,true);
 assert.equal(scan('<main><a href="/@alice">Alice</a><div id="captcha-box">Verify</div></main>').blocked,true);
 assert.equal(scan('<main>Try again later</main>').blocked,true);
 assert.equal(scan('<main>Login</main>','https://www.tiktok.com/login').blocked,true);
 assert.equal(scan('<main><a href="/@alice">Alice</a></main>','https://www.tiktok.com/@alice').error,true);
 r=scan('<main><a href="/alice/">Alice</a><a href="/p/abc/">Post</a><a href="/explore/">Explore</a><footer><a href="/other/">Other</a></footer></main>','https://www.instagram.com/explore/search/keyword/?q=food','Instagram');assert.equal(r.urls.length,1);assert.equal(r.urls[0],'https://www.instagram.com/alice/');
 // Instagram search post grids must become a separate, deduplicated author queue.
 const grid='<main><a href="/p/AAA/?hl=en"><img alt="food"></a><a href="/p/AAA/">duplicate</a><a href="/reel/BBB/">video</a><a hidden href="/p/HIDDEN/">hidden</a><a href="https://evil.test/p/BAD/">external</a></main>';
 const gridResult=scan(grid,'https://www.instagram.com/explore/search/keyword/?q=%23foodsg','Instagram');assert.equal(gridResult.urls.length,0);assert.equal(gridResult.posts.length,2);assert.equal(gridResult.posts[0],'https://www.instagram.com/p/AAA/');
 function author(html,href='https://www.instagram.com/p/AAA/',expected='https://www.instagram.com/p/AAA/'){
  const d=new JSDOM(html,{url:href,runScripts:'dangerously'});try{for(const node of d.window.document.querySelectorAll('[data-box]')){const [left,top,width,height]=node.getAttribute('data-box').split(',').map(Number);node.getBoundingClientRect=()=>({left,top,width,height,right:left+width,bottom:top+height})}d.window.eval(source('follower-count.js'));d.window.eval(source('profile-card.js'));d.window.eval(source('scan-page.js'));return d.window.IteaScan.author(d.window.document,expected)}finally{d.window.close()}
 }
 const postHeader='<main><article><header><a href="/alice/"><img alt="avatar"></a><h2><a href="/alice/">alice</a></h2></header><ul><li><header><a href="/commenter/">commenter</a></header></li></ul></article></main>';
 assert.equal(author(postHeader).url,'https://www.instagram.com/alice/');
 assert.equal(author(postHeader.replace('<header><a href="/alice/"><img alt="avatar"></a><h2><a href="/alice/">alice</a></h2></header>','')).status,'error','comment-only header is not the author');
 assert.equal(author('<main><article><div><a href="/alice/"><img alt="avatar"></a><h2><a href="/alice/">alice</a></h2></div><ul><li><h2><a href="/commenter/">commenter</a></h2></li></ul></article></main>').url,'https://www.instagram.com/alice/');
 assert.equal(author('<main><article><h2><a href="/mentioned/">mentioned</a></h2></article></main>').status,'error','unverified mention is not author');
 assert.equal(author(postHeader,'https://www.instagram.com/p/OTHER/').status,'error');
 assert.equal(author(postHeader+'<div role="dialog">Log in</div>').status,'blocked');
 const split='<main><div><video data-box="80,110,300,540"></video><div><div data-box="380,110,300,56"><a href="/alice/"><img data-box="390,120,32,32"></a><a href="/alice/">alice</a><button aria-label="More options">⋯</button></div><div data-box="380,180,300,56"><a href="/commenter/"><img data-box="390,190,32,32"></a><a href="/commenter/">commenter</a><button aria-label="More options">⋯</button></div><p><a href="/venue/">@venue</a></p></div></div></main>';
 assert.equal(author(split).url,'https://www.instagram.com/alice/','div-only side panel author');
 assert.equal(author(split.replace('<button aria-label="More options">⋯</button>','')).status,'error','comment avatar/name/menu below top are not authors');
 assert.equal(author(split.replace('380,110,300,56','80,50,300,56')).url,'https://www.instagram.com/alice/','mobile author bar above media');
 assert.equal(author(split.replace('380,110,300,56','380,260,300,56')).status,'error','off-top candidate is not author');
 assert.equal(author(split.replace('<video data-box="80,110,300,540"></video>','')).status,'error','no primary media must fail');
 assert.equal(author(split.replace('<main>','<body>').replace('</main>','</body>')).url,'https://www.instagram.com/alice/','bounded media region when main is absent');
 assert.equal(author(split.replace('</main>','<article><header><a href="/recommended/">recommended</a></header></article></main>')).url,'https://www.instagram.com/alice/','recommended article must not override primary div-only post');
 const layoutError=author('<main><video data-box="80,110,300,540"></video><a href="/venue/">venue</a></main>');assert.equal(layoutError.status,'error');assert.equal(layoutError.diagnostic.schema,'itea.post-layout.v1');assert(!JSON.stringify(layoutError.diagnostic).includes('cookie'));
 t=task({config:{platform:'Instagram',limit:3},scan:()=>({urls:[],posts:['https://www.instagram.com/p/AAA/','https://www.instagram.com/p/AAA/','https://www.instagram.com/reel/BBB/']})});
 t.io.author=async(_,entry)=>({status:'found',url:'https://www.instagram.com/alice/',postUrl:entry});t.io.read=async()=>({status:'collected',record:{url:'https://www.instagram.com/alice/',email:'alice@creator.test',fans:1200}});await t.runner.run();assert.equal(t.state.phase,'shortfall');assert.equal(t.state.posts.length,2);assert.equal(t.state.candidates.length,1);assert.equal(t.state.rows.length,1);assert.equal(t.state.outcomes.filter(x=>x.status==='author').length,2);
 t=task({config:{platform:'Instagram'},scan:()=>({posts:['https://www.instagram.com/p/AAA/']})});t.io.author=async()=>({status:'blocked',reason:'验证码',diagnostic:{schema:'test.layout'}});await t.runner.run();assert.equal(t.state.phase,'paused');assert.equal(t.state.stage,'authors');assert.equal(t.state.diagnostic.schema,'test.layout');assert.equal(t.state.postCursor,0);assert.equal(t.state.outcomes.length,0);await t.runner.skip();assert.equal(t.state.postCursor,1);assert.equal(t.state.outcomes[0].status,'failed');
 let savedRecords=[];t=task({config:{minFans:1000,maxFans:10000},read:async u=>({...card(u.split('@')[1]),record:{...card(u.split('@')[1]).record,fansDisplay:u.endsWith('alice')?'4.1K':u.endsWith('bob')?'15K':''}})});t.io.onRecord=async r=>savedRecords.push(r);await t.runner.run();assert.equal(t.state.rows.length,3,'outside and unknown leads retained');assert.equal(savedRecords.length,3,'all email leads reach auto-save hook');assert.equal(t.state.rows[0].rangeStatus,'match');assert.equal(t.state.rows[1].rangeStatus,'outside');assert.equal(t.state.rows[2].rangeStatus,'unknown');
 assert.equal(dom.window.IteaFollowers.parse('4.1万').value,41000);assert.equal(dom.window.IteaFollowers.parse('1.2M').value,1200000);assert.equal(dom.window.IteaFollowers.parse('1,234').value,1234);assert.equal(dom.window.IteaFollowers.parse('1,2K'),null);assert.equal(dom.window.IteaFollowers.parse('unknown'),null);
 t=task({config:{mode:'links',urls:[url('alice')]},read:async()=>card('alice',4170)});t.state.rows=[{...card('alice').record,fans:null}];await t.runner.run();assert.equal(t.state.rows.length,1);assert.equal(t.state.rows[0].fans,4170,'repair replaces original result rather than keeping null or duplicating');
 // Reported failure: first DOM image is a recommendation at y789, while
 // the real author bar is at y72 with both avatar and options present.
 const actualBar='<div data-box="1483.42,72.118,303.02,34.01"><a href="/actualcreator/"><img data-box="1486,72,32,32"></a><a data-box="1527.413,72.118,94.44,18" href="/actualcreator/">actualcreator</a><button aria-label="More options">⋯</button></div>';
 const recommendation='<article><div data-box="941.944,720,310.677,56"><a href="/recommended/"><img data-box="950,728,32,32"></a><a data-box="990,735,100,18" href="/recommended/">recommended</a><button aria-label="More options">⋯</button></div><img data-box="941.944,789.457,310.677,552.309"></article>';
 const reordered='<main>'+recommendation+'<div><video data-box="941.944,56,541.476,650"></video>'+actualBar+'</div></main>';
 assert.equal(author(reordered).url,'https://www.instagram.com/actualcreator/','recommendation first in DOM must not select its media/author');
 const unexposed='<main>'+recommendation+actualBar+'</main>';
 assert.equal(author(unexposed).url,'https://www.instagram.com/actualcreator/','leading verified controls remain usable if the player is canvas/CSS and only recommendations expose images');
 assert.equal(author(reordered.replace(actualBar,'')).status,'error','do not fall through to recommendation when current media has no author');
 assert.equal(author(reordered.replace(actualBar,actualBar.replace('<button aria-label="More options">⋯</button>',''))).status,'error','unverified top name must not fall through to recommended author');
 const lateComment='<main><video data-box="941.944,56,541.476,650"></video><ul><li>'+actualBar+'</li></ul></main>';
 assert.equal(author(lateComment).status,'error','comment-list owner-looking controls must be excluded');
 // Large discovery must process beyond the original first 30 links.
 const manyUrls=Array.from({length:300},(_,i)=>url('sample'+i));
 t=task({config:{limit:300},scan:()=>({urls:manyUrls}),read:async u=>card(u.split('@')[1],4170)});t.io.save=async()=>{};await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.rows.length,300);assert.equal(t.state.cursor,300);
 assert.equal(api.links([...manyUrls,url('overflow')].join('\n')).valid.length,300);assert.equal(api.links([...manyUrls,url('overflow')].join('\n')).truncated,true);
 const manyHTML='<main>'+Array.from({length:350},(_,i)=>'<a href="/@user'+i+'">User '+i+'</a>').join('')+'</main>';assert.equal(scan(manyHTML).urls.length,300);
 {const d=new JSDOM(manyHTML,{url:'https://www.tiktok.com/search/user?q=food',runScripts:'dangerously'});try{for(const f of ['follower-count.js','profile-card.js','scan-page.js'])d.window.eval(source(f));const later=d.window.IteaScan.scan(d.window.document,'TikTok',{urls:Array.from({length:300},(_,i)=>url('user'+i))});assert.equal(later.urls.length,50);assert.equal(later.urls[0],url('user300'));}finally{d.window.close()}}
 t=task({config:{knownUrls:[url('alice')],skipKnown:true,limit:2},scan:()=>({urls:[url('alice'),url('bob'),url('cara')]}),read:async u=>card(u.split('@')[1],1234)});await t.runner.run();assert.equal(t.state.rows.length,2);assert(!t.calls.includes(url('alice')));assert.equal(t.state.cachedUrls.length,1);
 t=task({config:{mode:'links',urls:[url('alice')],knownUrls:[url('alice')],repairFans:true},read:async()=>card('alice',4170)});await t.runner.run();assert.equal(t.state.rows.length,1,'repair must bypass read cache');
 t=task({config:{platform:'Instagram',limit:2},scan:()=>({posts:['https://www.instagram.com/p/AAA/','https://www.instagram.com/p/BBB/']})});const events=[];t.io.author=async(_,entry)=>{events.push('author:'+entry);return {status:'found',url:'https://www.instagram.com/'+(entry.includes('AAA')?'alice':'bob')+'/',postUrl:entry}};t.io.read=async()=>{const n=t.state.candidates[t.state.cursor].split('/').filter(Boolean).pop();events.push('read:'+n);return {status:'collected',record:{url:'https://www.instagram.com/'+n+'/',email:n+'@creator.test',fans:1234}}};t.io.onRecord=async r=>events.push('saved:'+r.email);await t.runner.run();assert(events.indexOf('saved:alice@creator.test')<events.indexOf('author:https://www.instagram.com/p/BBB/'),'first author saved before opening second post');assert.equal(t.state.rows.length,2,'last profile still read when target limit reached');
 t=task({config:{platform:'Instagram',limit:2},scan:()=>({posts:['https://www.instagram.com/p/AAA/','https://www.instagram.com/p/BBB/']})});t.io.author=async(_,entry)=>({status:'found',url:'https://www.instagram.com/alice/',postUrl:entry});t.io.read=async()=>({status:'blocked',reason:'验证码'});await t.runner.run();assert.equal(t.state.activeItem,'profile');assert.equal(t.state.postCursor,1);await t.runner.skip();assert.equal(t.state.cursor,1);assert.equal(t.state.postCursor,1,'skip blocked profile must not skip the next unresolved post');
 assert.equal(api.searchUrl('TikTok','cafe','accounts'),'https://www.tiktok.com/search/user?q=cafe');
 const videos='<main><a href="/@alice/video/123456">Food review</a><a href="/@alice/video/234567">Duplicate author</a><a href="/@bob/photo/345678">Cafe photos</a><a href="/@unrelated">Mention or account card</a><a href="https://evil.test/@stolen/video/123">External</a><a hidden href="/@hidden/video/999">Hidden</a><a href="/@bad/video/not-a-video-id">Bad path</a></main>';
 const content=scan(videos,'https://www.tiktok.com/search?q=Singapore%20food');assert.equal(content.urls.length,2);assert.equal(content.urls[0],url('alice'));assert.equal(content.urls[1],url('bob'));assert.equal(content.posts.length,0,'TikTok authors derived directly from video URL without post-navigation stage');
 assert.equal(scan('<main><a href="/@creator">creator</a></main>','https://www.tiktok.com/search/user?q=creator').urls.length,1,'explicit account-name mode retained');
 t=task({config:{platform:'TikTok',keyword:'Singapore food',searchType:'content',limit:2},scan:()=>content,read:async u=>card(u.split('@')[1],4170)});let searchOpened='';t.io.searchTab=async(_,href)=>{searchOpened=href;return 1};await t.runner.run();assert.equal(searchOpened,'https://www.tiktok.com/search?q=Singapore%20food');assert.equal(t.state.rows.length,2);assert.equal(t.calls.filter(u=>u.includes('/video/')).length,0);
 // A 300-homepage goal must continue after a post batch with duplicate authors.
 t=task({config:{platform:'Instagram',limit:300},scan:n=>({posts:n<30?Array.from({length:30},(_,i)=>'https://www.instagram.com/p/P'+(n*30+i)+'/'):[]}),read:async u=>({status:'skipped',url:u,reason:'无公开邮箱'})});t.io.save=async()=>{};
 t.io.author=async(_,postUrl)=>({status:'found',postUrl,url:'https://www.instagram.com/creator'+Math.floor(Number(postUrl.match(/P(\d+)/)[1])/3)+'/'});
 await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.candidates.length,300);assert.equal(t.state.cursor,300);assert.equal(t.state.rows.length,0,'no-email profiles count toward homepage goal');assert.equal(new Set(t.state.candidates).size,300);assert.equal(t.calls.filter(x=>x==='search').length>1,true,'return to source after each author batch');
 // Source shortage is resumable; a later-loaded page supplements the same goal.
 t=task({config:{limit:3},scan:()=>({urls:[url('alice')],end:true}),read:async u=>({status:'skipped',url:u,reason:'无公开邮箱'})});await t.runner.run();assert.equal(t.state.phase,'shortfall');assert.match(t.state.reason,/1 \/ 3/);assert.equal(t.state.candidates.length,1);
 t.io.scan=async()=>({urls:[url('alice'),url('bob'),url('cara')]});await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.candidates.length,3);assert.equal(t.calls.filter(x=>x===url('alice')).length,1,'continue never re-reads completed homepage');
 // Independent keywords supplement a single deduplicated inventory.
 t=task({config:{limit:2,keyword:'tea;coffee'},scan:n=>({urls:[url(n===0?'alice':'bob')],end:true}),read:async u=>card(u.split('@')[1])});const searches=[];t.io.searchTab=async(_,href)=>{searches.push(href);return 1};await t.runner.run();assert.equal(t.state.phase,'done');assert.equal(t.state.candidates.length,2);assert.equal(searches.length,2);assert.match(searches[1],/coffee/);
 const manifest=JSON.parse(source('manifest.json'));assert.equal(manifest.version,'1.5.0');assert.deepEqual(manifest.permissions,['activeTab','scripting','clipboardWrite','storage']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.background,undefined);assert.deepEqual(manifest.optional_host_permissions,['https://www.instagram.com/*','https://www.tiktok.com/*','https://47.86.198.65/*']);
 console.log('PASS batch helper: keyword search queue, dedup, bounded scans, pause/resume, captcha/login, errors distinct from no-email, optional links, exact follower filters, URL identity, scoped DOM and optional platform permissions.');
}finally{dom.window.close()}
