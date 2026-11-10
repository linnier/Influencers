(function(root){'use strict';
const {shown,visibleText}=root.IteaProfileCard;
function gate(d){
 const path=d.location.pathname;
 if(/\/(?:accounts\/login|login|challenge|checkpoint|auth)(?:\/|$)/i.test(path))return '平台要求登录或验证，请在工作标签页完成后继续。';
 const signals=[...d.querySelectorAll('iframe[src*="captcha"],[id*="captcha"],[class*="captcha"],[data-e2e*="captcha"],[role="dialog"]')].filter(shown);
 for(const node of signals){const text=visibleText(node);if(node.matches('iframe,[id*="captcha"],[class*="captcha"],[data-e2e*="captcha"]')||/verify|verification|log in|sign in|验证码|安全验证|登录|登入|unusual activity|too many requests|try again later/i.test(text))return '平台出现登录、验证码或访问限制，任务已暂停。';}
 const main=d.querySelector('main,[role="main"]');const text=visibleText(main||d.body).slice(0,1500);
 if(/verify (?:to continue|you are human)|security check|too many requests|temporarily blocked|try again later|unusual activity|访问过于频繁|操作频繁|稍后再试|安全验证|请完成验证/i.test(text))return '平台出现验证或访问限制，任务已暂停。';
 return '';
}
function scan(d,platform){const reason=gate(d);if(reason)return {blocked:true,reason};const u=new URL(d.location.href);const correct=platform==='TikTok'?u.hostname==='www.tiktok.com'&&u.pathname.startsWith('/search'):u.hostname==='www.instagram.com'&&u.pathname.startsWith('/explore/search');if(!correct)return {error:true,reason:'当前工作页不是预期的搜索页面，请检查是否被重定向。'};
 const main=d.querySelector('main,[role="main"]');if(!shown(main))return {error:true,reason:'未找到搜索结果区域，请等待页面加载，或检查平台是否要求登录。'};
 const urls=[];for(const a of main.querySelectorAll('a[href]')){if(!shown(a)||a.closest('nav,footer,aside'))continue;const p=root.IteaProfileCard.profile(a.href);if(p&&p.platform===platform&&!urls.includes(p.url))urls.push(p.url);if(urls.length>=30)break;}
 return {urls};
}
root.IteaScan={gate,scan};
})(globalThis);
