(function(root){'use strict';
const {shown,visibleText}=root.IteaProfileCard;
function post(href){let u;try{u=new URL(href)}catch{return null}if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.instagram.com','instagram.com'].includes(u.hostname))return null;const m=u.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]{1,80})\/?$/);return m?'https://www.instagram.com/'+(m[1]==='p'?'p':'reel')+'/'+m[2]+'/':null;}
function tiktokAuthor(href){let u;try{u=new URL(href)}catch{return null}if(u.protocol!=='https:'||u.username||u.password||u.port||!['www.tiktok.com','tiktok.com'].includes(u.hostname))return null;const match=u.pathname.match(/^\/@([\w.]{1,80})\/(?:video|photo)\/\d{1,30}\/?$/);return match?root.IteaProfileCard.profile('https://www.tiktok.com/@'+match[1]):null;}
function gate(d){
 const path=d.location.pathname;
 if(/\/(?:accounts\/login|login|challenge|checkpoint|auth)(?:\/|$)/i.test(path))return '平台要求登录或验证，请在工作标签页完成后继续。';
 const signals=[...d.querySelectorAll('iframe[src*="captcha"],[id*="captcha"],[class*="captcha"],[data-e2e*="captcha"],[role="dialog"]')].filter(shown);
 for(const node of signals){const text=visibleText(node);if(node.matches('iframe,[id*="captcha"],[class*="captcha"],[data-e2e*="captcha"]')||/verify|verification|log in|sign in|验证码|安全验证|登录|登入|unusual activity|too many requests|try again later/i.test(text))return '平台出现登录、验证码或访问限制，任务已暂停。';}
 const main=d.querySelector('main,[role="main"]');const text=visibleText(main||d.body).slice(0,1500);
 if(/verify (?:to continue|you are human)|security check|too many requests|temporarily blocked|try again later|unusual activity|访问过于频繁|操作频繁|稍后再试|安全验证|请完成验证/i.test(text))return '平台出现验证或访问限制，任务已暂停。';
 return '';
}
function scan(d,platform,seen={}){const seenUrls=new Set(seen.urls||[]),seenPosts=new Set(seen.posts||[]);const reason=gate(d);if(reason)return {blocked:true,reason};const u=new URL(d.location.href);const correct=platform==='TikTok'?u.hostname==='www.tiktok.com'&&u.pathname.startsWith('/search'):u.hostname==='www.instagram.com'&&u.pathname.startsWith('/explore/search');if(!correct)return {error:true,reason:'当前工作页不是预期的搜索页面，请检查是否被重定向。'};
 const main=d.querySelector('main,[role="main"]');if(!shown(main))return {error:true,reason:'未找到搜索结果区域，请等待页面加载，或检查平台是否要求登录。'};
 const accountsSearch=platform==='TikTok'&&/^\/search\/user\/?$/.test(u.pathname);
 const urls=[],posts=[];for(const a of main.querySelectorAll('a[href]')){if(!shown(a)||a.closest('nav,footer,aside'))continue;const p=platform==='TikTok'&&!accountsSearch?tiktokAuthor(a.href):root.IteaProfileCard.profile(a.href),entry=platform==='Instagram'?post(a.href):null;if(p&&p.platform===platform&&!seenUrls.has(p.url)&&!urls.includes(p.url)&&urls.length<300)urls.push(p.url);if(entry&&!seenPosts.has(entry)&&!posts.includes(entry)&&posts.length<900)posts.push(entry);if(urls.length>=300&&posts.length>=900)break;}
 return {urls,posts,ready:true};
}
function author(d,expected){
 const reason=gate(d);if(reason)return {status:'blocked',reason};
 const current=post(d.location.href);if(!current||current!==post(expected))return {status:'error',reason:'工作页不是当前任务的帖子，已暂停，避免认错作者。'};
 const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const isMedia=el=>shown(el)&&!el.closest('nav,aside,footer')&&rect(el).width>=180&&rect(el).height>=180;
 const scopes=[...[...d.querySelectorAll('[role="dialog"]')].filter(shown),...[...d.querySelectorAll('main,[role="main"]')].filter(shown)];
 const scope=scopes.find(el=>[...el.querySelectorAll('video,img')].some(isMedia))||d.body;
 // DOM order can put recommendation images before the visible post video.
 const media=[...scope.querySelectorAll('video,img')].filter(isMedia).sort((a,b)=>rect(a).top-rect(b).top||rect(a).left-rect(b).left).slice(0,30),primary=media[0];
 const named=a=>{const p=root.IteaProfileCard.profile(a.href);return shown(a)&&p?.platform==='Instagram'&&visibleText(a).replace(/^@/,'').toLowerCase()===p.handle?p:null;};
 const excluded='ul,ol,[role="list"],[role="listitem"],[data-testid*="comment"],[data-e2e*="comment"]';
 const scrolling=el=>{for(let p=el.parentElement;p&&p!==scope;p=p.parentElement){if(p.clientHeight>0&&p.scrollHeight>p.clientHeight+8&&/auto|scroll/.test(d.defaultView.getComputedStyle(p).overflowY))return true;}return false;};
 const names=[];for(const anchor of scope.querySelectorAll('a[href]')){if(anchor.closest('nav,aside,footer,'+excluded)||scrolling(anchor))continue;const owner=named(anchor);if(!owner)continue;let box=rect(anchor);if(box.height<=0){for(let p=anchor.parentElement;p&&p!==scope;p=p.parentElement){box=rect(p);if(box.height>0)break;}}names.push({anchor,owner,box});}
 const leading=names.slice().sort((a,b)=>a.box.top-b.box.top||a.box.left-b.box.left)[0];
 // Restrict author discovery to the visible post, never recommendations or comments.
 const article=[...d.querySelectorAll('main article,[role="main"] article,[role="dialog"] article,main [role="article"],[role="main"] [role="article"]')].find(el=>shown(el)&&(!primary||el.contains(primary))&&(!leading||el.contains(leading.anchor)));
 const headers=article?[...article.querySelectorAll('header')].filter(el=>shown(el)&&!el.closest(excluded)):[];
 for(const header of headers){const owners=[...header.querySelectorAll('a[href]')].filter(a=>!a.closest(excluded)).map(named).filter(Boolean);if(owners.length)return {status:'found',url:owners[0].url,postUrl:current};}
 // Some layouts replace header with divs. Require both the named owner link
 // and the same account's avatar link in a small region outside comment lists.
 for(const heading of article?.querySelectorAll('h1,h2,[role="heading"]')||[]){
  if(!shown(heading)||heading.closest(excluded))continue;
  const owner=[...heading.querySelectorAll('a[href]')].map(named).find(Boolean);if(!owner)continue;
  for(let region=heading.parentElement;region&&region!==article;region=region.parentElement){
   if(region.querySelector(excluded))break;
   const avatar=[...region.querySelectorAll('a[href]')].some(a=>shown(a)&&a.querySelector('img')&&root.IteaProfileCard.profile(a.href)?.url===owner.url);
   if(avatar)return {status:'found',url:owner.url,postUrl:current};
  }
 }
 // New Instagram layouts use ordinary divs for the media and right-hand panel.
 // Tie the author bar to the primary media by geometry, plus avatar, account
 // link and options control; neither caption mentions nor comment names suffice.
 const bars=[],pairs=[],complete=[];
 const options=el=>[...el.querySelectorAll('button,[role="button"],svg[aria-label]')].some(n=>shown(n)&&(/more|options|更多|选项/i.test(n.getAttribute('aria-label')||n.getAttribute('title')||'')||/^(?:⋯|…|\.\.\.)$/.test(visibleText(n))));
 if(primary){
  for(const {anchor:a,owner} of names){
   for(let region=a.parentElement,depth=0;region&&region!==scope&&depth<12;region=region.parentElement,depth++){
    const r=rect(region);if(!shown(region)||r.width<=0||r.height<=0||r.height>110||r.width>1000)continue;
    if(region.querySelector(excluded+',textarea,input,video')||media.some(el=>region.contains(el)))break;
    const smallAvatar=[...region.querySelectorAll('img')].some(img=>{const b=rect(img);return shown(img)&&b.width>0&&b.width<=85&&b.height>0&&b.height<=85;});
    const hasMenu=options(region),eligible=media.filter(el=>rect(el).top<=rect(primary).top+120);let aligned=false;
    for(const el of eligible){const m=rect(el),right=r.left>=m.right-36&&r.left<=m.right+96&&Math.abs(r.top-m.top)<=36,overlap=Math.min(r.right,m.right)-Math.max(r.left,m.left),above=r.bottom<=m.top+12&&m.top-r.bottom<=48&&overlap>=Math.min(r.width,m.width)*.5;
     if(right||above){aligned=true;if(smallAvatar&&hasMenu)pairs.push({owner,bar:r,media:m});}
    }
    if(smallAvatar&&hasMenu)complete.push({owner,bar:r});
    if(bars.length<24&&!bars.some(b=>b.handle===owner.handle&&b.rect.top===r.top&&b.rect.left===r.left&&b.rect.width===r.width&&b.rect.height===r.height&&b.avatar===smallAvatar&&b.menu===hasMenu))bars.push({handle:owner.handle,rect:r,avatar:smallAvatar,menu:hasMenu,aligned});
   }
  }
 }
 pairs.sort((a,b)=>a.bar.top-b.bar.top||Math.abs(a.bar.left-a.media.right)-Math.abs(b.bar.left-b.media.right));
 // Some post players render via canvas/CSS; the first readable images then
 // belong to recommendations far below. Accept only the leading, complete
 // account+avatar+options bar outside a scrollable caption/comment pane.
 const topBar=complete.filter(b=>leading&&b.owner.url===leading.owner.url&&b.bar.top<=leading.box.top+10&&leading.box.top<=b.bar.bottom+10&&b.bar.top<=rect(scope).top+120&&media.every(el=>rect(el).top>b.bar.bottom+160)).sort((a,b)=>a.bar.top-b.bar.top)[0];
 if(topBar)return {status:'found',url:topBar.owner.url,postUrl:current};
 if(pairs.length)return {status:'found',url:pairs[0].owner.url,postUrl:current};
 return {status:'error',reason:'未能确认帖子的顶部作者栏。请复制页面诊断反馈；不会从文案、评论或推荐列表猜测作者。',diagnostic:{schema:'itea.post-layout.v1',postUrl:current,articleFound:!!article,mainFound:scopes.length>0,primaryMedia:primary?rect(primary):null,mediaCount:media.length,mediaRects:media.map(rect),candidateBars:bars}};
}
root.IteaScan={gate,scan,post,author,tiktokAuthor};
})(globalThis);
