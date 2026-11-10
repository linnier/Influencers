(function(root){'use strict';
const clean=(v,n=3000)=>String(v??'').replace(/\u00a0/g,' ').trim().slice(0,n);
function profile(href){let u;try{u=new URL(href)}catch{return null}if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const parts=u.pathname.split('/').filter(Boolean),host=u.hostname.toLowerCase();if(parts.length!==1)return null;let platform,handle;if(['www.instagram.com','instagram.com'].includes(host)){platform='Instagram';handle=parts[0].toLowerCase();if(['p','reel','reels','explore','stories','accounts','about'].includes(handle))return null;}else if(['www.tiktok.com','tiktok.com'].includes(host)&&parts[0].startsWith('@')){platform='TikTok';handle=parts[0].slice(1).toLowerCase();}else return null;if(!/^[\w.]{1,80}$/.test(handle))return null;return {platform,handle,url:platform==='Instagram'?'https://www.instagram.com/'+handle+'/':'https://www.tiktok.com/@'+handle};}
function shown(el){if(!el)return false;for(let node=el;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||node.getAttribute('aria-hidden')==='true')return false;const style=node.ownerDocument.defaultView.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;}return true;}
function visibleText(el){if(!shown(el))return '';const d=el.ownerDocument,walker=d.createTreeWalker(el,4);let node;const output=[];while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||parent.closest('script,style,noscript,template,input,textarea')||!shown(parent))continue;output.push(node.nodeValue);}return clean(output.join(' ').replace(/\s+/g,' '),4000);}
function emails(text){return [...new Set((text.match(/(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]{1,64}\s*@\s*[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24})(?![A-Za-z])/g)||[]).map(v=>v.replace(/\s+/g,'')))].slice(0,5);}
function count(display){const s=clean(display,80).replace(/[,\s]/g,'');return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;}
// Instagram can keep an old canonical URL after SPA navigation. Trust only
// the current URL plus a matching visible profile heading, never metadata alone.
function instagramCard(d,account){
 const matches=el=>shown(el)&&visibleText(el).replace(/^@/,'').toLowerCase()===account.handle;
 const conventional=[...d.querySelectorAll('main header,[role="main"] header')];
 for(const card of conventional)if(shown(card)&&[...card.querySelectorAll('h1,h2,h3,[role="heading"],a,button')].some(matches))return card;
 // New layouts may use divs instead of header. Stay inside the nearest
 // profile region containing the account heading and its own followers link.
 for(const heading of d.querySelectorAll('main h1,main h2,main h3,main [role="heading"],[role="main"] h1,[role="main"] h2,[role="main"] h3,[role="main"] [role="heading"]')){
  if(!matches(heading)||heading.closest('article,footer,[role="dialog"]'))continue;
  for(let region=heading.parentElement;region&&!region.matches('main,[role="main"],body,html');region=region.parentElement){
   if(region.querySelector('article,footer,[role="dialog"],a[href^="/p/"],a[href^="/reel/"]'))break;
   const ownFollowers=[...region.querySelectorAll('a[href]')].some(a=>{try{const u=new URL(a.href);return shown(a)&&u.origin===d.location.origin&&u.pathname.replace(/\/$/,'')==='/'+account.handle+'/followers'}catch{return false}});
   if(ownFollowers)return region;
  }
 }
 return null;
}
function read(d){const account=profile(d.location.href);if(!account)return {status:'error',reason:'请先打开完整的 Instagram 或 TikTok 达人主页，当前不是主页资料卡。'};let card,bio,name,follower;
if(account.platform==='TikTok'){
 const normalize=value=>clean(value).replace(/[\u200b-\u200f\ufeff]/g,'').replace(/^@/,'').trim().toLowerCase();
 const titles=[...d.querySelectorAll('[data-e2e="user-title"],[data-e2e="user-subtitle"],[data-e2e="user-unique-id"],[data-e2e="user-username"],main h1,main h2,main [role="heading"],[role="main"] h1,[role="main"] h2,[role="main"] [role="heading"]')].filter(el=>shown(el)&&!el.closest('article,aside,footer,[role="list"],[role="listitem"]'));
 const explicit=titles.filter(el=>el.matches('[data-e2e="user-title"],[data-e2e="user-subtitle"],[data-e2e="user-unique-id"],[data-e2e="user-username"]'));
 const title=(explicit.length?explicit:titles.slice(0,2)).find(el=>normalize(visibleText(el))===account.handle||[...el.querySelectorAll('span,[dir="auto"]')].some(child=>shown(child)&&normalize(visibleText(child))===account.handle));
 if(!title){const seen=titles.slice(0,3).map(el=>clean(visibleText(el),70)).join(' / ');return {status:'error',reason:'TikTok 账号核对失败：当前网址 @'+account.handle+'；'+(seen?'可见账号标题为“'+seen+'”，未匹配。':'未识别到可见账号标题（页面结构可能已变化）。')+'请检查工作标签页或反馈主页截图。'};}
 // Search from the matching title's ancestors, ignoring hidden stale SPA nodes.
 for(let region=title.parentElement;region&&region!==d.body;region=region.parentElement){
  const matches=[...region.querySelectorAll('[data-e2e="user-bio"],[data-e2e="user-desc"],[data-e2e="user-description"]')].filter(el=>shown(el)&&!el.closest('article,aside,footer,[role="list"],[role="listitem"]'));
  if(matches.length===1){bio=matches[0];card=bio;name=visibleText([...region.querySelectorAll('[data-e2e="user-subtitle"],[data-e2e="user-title"]')].find(el=>shown(el)&&el!==title&&normalize(visibleText(el))!==account.handle))||account.handle;follower=[...region.querySelectorAll('[data-e2e="followers-count"]')].find(shown);break;}
  if(region.matches('main,[role="main"]'))break;
 }
 if(!bio)return {status:'error',reason:'已核对 TikTok 账号 @'+account.handle+'，但未识别到可见简介区域。无法据此判断为无邮箱，请反馈主页截图。'};
}
else{card=instagramCard(d,account);if(!card)return {status:'error',reason:'未能确认当前账号的可见资料卡。请刷新达人主页后重试；仍失败请反馈页面截图。'};bio=card;const heading=card.querySelector('h1');name=visibleText(heading);if(!name||name.toLowerCase()===account.handle)name=account.handle;const link=[...card.querySelectorAll('a[href]')].find(el=>{try{return new URL(el.href).pathname.replace(/\/$/,'')==='/'+account.handle+'/followers'}catch{return false}});follower=link?.querySelector('[title]')||link;}
const text=visibleText(bio),mailto=[];for(const a of card.querySelectorAll('a[href]'))if(shown(a)&&a.getAttribute('href').toLowerCase().startsWith('mailto:')){try{mailto.push(decodeURIComponent(a.getAttribute('href').slice(7).split('?')[0]))}catch{}}const cardText=clean(text+(mailto.length?'\n资料卡公开邮箱链接：'+mailto.join(' '):''),6000),found=emails(cardText);if(!found.length)return {status:'skipped',reason:'资料卡没有显示公开邮箱，按规则跳过。不会追查关联网站。',url:account.url};const fansDisplay=shown(follower)?clean(follower.getAttribute('title')||visibleText(follower),80).replace(/(?:\bfollowers?\b|粉丝)/ig,'').trim():'';return {status:'collected',record:{schema:'itea.creator.profile-card.v1',...account,name:clean(name,60),email:found[0],bio:clean(text,3000),cardText,emailSource:'visible-profile-card',fans:count(fansDisplay),fansDisplay,capturedAt:new Date().toISOString()}};}
root.IteaProfileCard={read,profile,emails,count,shown,visibleText};
})(globalThis);
