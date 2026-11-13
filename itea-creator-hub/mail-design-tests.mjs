import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import {LarkMail} from './lark-mail.mjs';
import './public/mail-templates.js';
const D=globalThis.MailDesign,M=globalThis.MailTemplates;
const settings={benefitsZh:'10张饮品券\n有效期3个月',benefitsEn:'10 drink vouchers\nValid for 3 months',requirementsZh:'至少拍摄一款饮品\n初稿须审核',requirementsEn:'Feature at least one drink\nSubmit a draft for review',voucherInstructionsZh:'登录App领券\n无需预约',voucherInstructionsEn:'Check vouchers in the App\nNo booking required',inviteDeadline:'2026-11-12',deadline:'2026-11-30'};
const vars={...M.variables({project:'Synthetic Campaign',name:'Creator <img src=x onerror=alert(1)>',amount:0,vouchers:10,currency:'SGD',accounts:[{platform:'Instagram',handle:'demo_account',url:'https://example.com/demo'}],settings,applicationLink:'https://creator.test/creators/apply/secret?x=1&y=2',portalLink:'https://creator.test/creators/creator/report/signed-token'}),'领券账号':'synthetic_account','本次券数':3,'累计券数':3,'发券日期':'2026-11-09','待补事项':'• Instagram：缺1条发布链接\n• Instagram：待补阅读量','待补事项英文':'• Instagram: Missing 1 post link\n• Instagram: Missing views'};
assert.equal(M.upgrade(M.previousTemplates).confirmed,M.templates.confirmed);
assert.equal(M.upgrade({confirmed:'Custom {{专属入口}}'}).confirmed,'Custom {{专属入口}}');
assert.equal(M.paired('Instagram @demo','Instagram @demo'),'Instagram @demo');
assert.equal(M.paired('一\n二','One\nTwo'),'一\nOne\n\n二\nTwo');
assert.equal(M.paired('中文一\n\n中文二','English one\n\nEnglish two'),'中文一\nEnglish one\n\n中文二\nEnglish two');
const uneven=M.paired('一\n二\n三','One\nTwo');for(const x of ['一','二','三','One','Two'])assert(uneven.includes(x));
const artifacts=process.env.MAIL_DESIGN_ARTIFACT_DIR;if(artifacts)mkdirSync(artifacts,{recursive:true});
let fixture;
for(const [kind,key]of [['invite','inviteBody'],['confirmed','confirmed'],['issued','issued'],['reminder','reminderBody']]){
 const body=M.render(M.templates[key],vars),record={body,mailDesign:D.snapshot(kind,kind==='invite'?vars['报名链接']:vars['专属入口'],10)},html=D.html(record),preview=D.render(body,record.mailDesign,{preview:true});
 assert(!body.includes('{{'));assert.equal(record.mailDesign.version,1);assert(html.includes('cid:'+D.logo.cid));assert(!html.includes('data:image'));assert(preview.includes('data:image/png;base64,'));assert.equal(D.html({body}),undefined);assert(D.panel({body}).startsWith('<pre'));
 const dom=new JSDOM(html),doc=dom.window.document;assert.equal(doc.querySelectorAll('img').length,1);assert.equal(doc.querySelector('img').alt,'itea');assert.equal(doc.querySelector('img').parentElement.getAttribute('align'),'center');assert(!doc.querySelector('script,form,iframe'));assert.equal(doc.querySelectorAll('img[onerror]').length,0);assert(!doc.body.textContent.includes('Taste of Tropical Asia'));assert(doc.body.textContent.includes('Creator <img src=x onerror=alert(1)>'));assert.equal(doc.querySelectorAll('a[href^="https://creator.test/"]').length,1);assert(doc.querySelector('a[href^="https://creator.test/"]').href.includes('signed-token')||kind==='invite');
 const benefitHead=[...doc.querySelectorAll('h2')].find(h=>h.textContent==='合作权益');if(benefitHead){assert.equal(benefitHead.nextElementSibling.textContent,'Collaboration benefits');assert(benefitHead.closest('table').nextElementSibling.textContent.includes('10张饮品券'));}const iframe=new JSDOM(D.panel(record)).window.document.querySelector('iframe');assert(iframe);assert.equal(iframe.getAttribute('sandbox'),'allow-popups allow-popups-to-escape-sandbox');assert(iframe.srcdoc.includes('data:image/png;base64,'));
 if(kind==='invite'){const text=doc.body.textContent;assert(text.indexOf('有效期3个月')>text.indexOf('10 drink vouchers'));assert(text.indexOf('初稿须审核')>text.indexOf('Feature at least one drink'));}
 if(kind==='reminder')assert(doc.body.textContent.indexOf('Instagram: Missing 1 post link')<doc.body.textContent.indexOf('Instagram：待补阅读量'));
 const frozen=html;settings.deadline='2099-01-01';assert.equal(D.html(record),frozen);settings.deadline='2026-11-30';
 if(artifacts)writeFileSync(join(artifacts,kind+'.html'),preview);
 if(kind==='issued')fixture={body,html};dom.window.close();
}
assert.equal(D.snapshot('__proto__','javascript:alert(1)').kind,'reminder');assert.equal(D.snapshot('invite','https://user:pass@evil.test').actionURL,'');assert.equal(D.render('Legacy',{version:99}),null);assert.throws(()=>D.html({body:'Future',mailDesign:{version:99}}),/版式版本/);
const malicious=D.render('<script>alert(1)</script>\nhttps://example.com/" onmouseover="x',{...D.snapshot('invite','javascript:alert(1)')});const md=new JSDOM(malicious).window.document;assert(!md.querySelector('script,[onmouseover]'));assert(![...md.querySelectorAll('a')].some(a=>a.href.startsWith('javascript:')));
const requests=[],mail=new LarkMail({store:{rows:async()=>[]},appSecret:'synthetic',now:()=>1794182400000,fetchImpl:async(url,opt)=>{requests.push({url,body:JSON.parse(opt.body)});return {ok:true,json:async()=>({code:0,data:{draft:{id:'synthetic-draft'}}})};}});
await mail.draft({to:'creator@example.com',subject:'合成邮件 / Synthetic',body:fixture.body,html:fixture.html,id:'synthetic-email',token:'synthetic-token'});
const raw=Buffer.from(requests[0].body.raw,'base64url');assert(requests[0].url.includes('collab%40itea.sg/drafts'));assert(raw.includes(Buffer.from('multipart/related')));assert(raw.includes(Buffer.from('multipart/alternative')));
const dir=mkdtempSync(join(tmpdir(),'itea-mime-'));try{writeFileSync(join(dir,'mail.eml'),raw);writeFileSync(join(dir,'body.txt'),fixture.body);writeFileSync(join(dir,'html.txt'),fixture.html);writeFileSync(join(dir,'logo.png'),Buffer.from(D.logo.base64,'base64'));const py=spawnSync('python3',['-c',`from email import policy
from email.parser import BytesParser
from pathlib import Path
import sys
p=Path(sys.argv[1]);m=BytesParser(policy=policy.default).parsebytes((p/'mail.eml').read_bytes())
assert not m.defects
assert m['From']=='collab@itea.sg' and m['To']=='creator@example.com'
assert m.get_content_type()=='multipart/related'
parts=list(m.walk());plain=[p for p in parts if p.get_content_type()=='text/plain'];html=[p for p in parts if p.get_content_type()=='text/html'];logos=[p for p in parts if p.get_content_type()=='image/png']
assert len(plain)==len(html)==len(logos)==1
assert plain[0].get_content().strip()==(p/'body.txt').read_text().strip()
assert html[0].get_content().strip()==(p/'html.txt').read_text().strip()
assert logos[0].get_payload(decode=True)==(p/'logo.png').read_bytes()
assert logos[0]['Content-ID']=='<itea-brand-logo@itea.sg>'
assert logos[0].get_content_disposition()=='inline'
assert len(list(m.iter_attachments()))==1
print('PASS MIME: parsed UTF-8 plain/HTML alternatives and byte-exact inline CID logo')`,dir],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);console.log(py.stdout.trim());if(artifacts)writeFileSync(join(artifacts,'synthetic-mail.eml'),raw);}finally{rmSync(dir,{recursive:true,force:true});}
await mail.draft({to:'creator@example.com',subject:'Legacy',body:'Legacy body unchanged',id:'legacy',token:'synthetic-token'});const legacy=Buffer.from(requests[1].body.raw,'base64url').toString();assert(legacy.includes('Content-Type: text/plain; charset=UTF-8'));assert(!legacy.includes('multipart/'));assert.equal(requests.length,2);
// Preview buttons must open a top-level tab for pages with frame-ancestors 'none'.
const live='https://43.106.95.29/creators/creator/report/example.signed?x=1&y=2',liveRecord={body:'查看回填入口\n'+live,mailDesign:D.snapshot('reminder',live)},livePanel=new JSDOM(D.panel(liveRecord)).window.document,liveFrame=livePanel.querySelector('iframe'),liveDoc=new JSDOM(liveFrame.srcdoc).window.document,liveLink=livePanel.querySelector('[data-mail-live-link]');assert.equal(liveFrame.getAttribute('sandbox'),'allow-popups allow-popups-to-escape-sandbox');const previewAction=liveDoc.querySelector('a[href]');assert.equal(previewAction.href,live);assert.equal(previewAction.target,'_blank');assert(previewAction.rel.includes('noopener'));assert(previewAction.rel.includes('noreferrer'));assert.equal(liveDoc.querySelector('[aria-disabled="true"]'),null);assert.equal(liveLink.href,live);assert.equal(liveLink.target,'_blank');assert(liveLink.rel.includes('noreferrer'));assert(liveLink.rel.includes('noopener'));assert.equal(livePanel.querySelector('input[readonly]').value,live);assert(D.html(liveRecord).includes('href="https://43.106.95.29/creators/creator/report/example.signed?x=1&amp;y=2"'),'actual sent email retains working CTA');assert.equal(new JSDOM(D.panel({body:'bad',mailDesign:D.snapshot('reminder','javascript:alert(1)')})).window.document.querySelector('[data-mail-live-link]'),null);globalThis.location={origin:'https://43.106.95.29'};assert(D.panel({body:'old',mailDesign:D.snapshot('reminder','https://47.86.198.65/creators/creator/report/token')}).includes('地址与当前系统不同'));delete globalThis.location;
console.log('PASS live preview links: clickable sandboxed preview, exact real URL in separate tab with noopener/noreferrer, copyable URL and old-origin warning; actual email CTA unchanged.');
console.log('PASS branded mail: paired defaults and fields, migration/custom preservation, frozen versioned design, 4 safe HTML types, centered official logo with no footer logo/slogan, sandboxed previews, dangerous input escaping, scoped action links, native MIME image and legacy text-only delivery. Mocked draft requests only; no real mail.');
