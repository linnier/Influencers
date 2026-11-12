import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createMailImages,MAX_IMAGE_BYTES} from './mail-images.mjs';
import {LarkMail} from './lark-mail.mjs';
const dir=mkdtempSync(join(tmpdir(),'itea-mail-images-'));
try{
 const images=createMailImages({dataDir:dir}),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfS0AAAAASUVORK5CYII=',v={name:'新品 <img onerror=x>.png',mime:'image/png',base64:png},image=images.upload('P',v);
 assert.equal(image.width,1);assert.equal(image.height,1);assert.equal(image.base64,undefined);
 assert.throws(()=>images.upload('P',{...v,mime:'image/svg+xml'}),/JPG/);
 assert.throws(()=>images.upload('P',{...v,base64:Buffer.from('<svg onload=x>').toString('base64')}),/格式/);
 assert.throws(()=>images.upload('P',{...v,base64:Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64')}),/500KB/);
 assert.throws(()=>images.get('../data'),/编号/);
 assert.throws(()=>images.selection('OTHER',[{...image,types:['invite']}]),/不属于/);
 assert.throws(()=>images.selection('P',[{...image,types:[]}]),/类型/);
 assert.throws(()=>images.selection('P',[{...image,types:['invite'],caption:'x'.repeat(161)}]),/160/);
 assert.throws(()=>images.selection('P',Array(5).fill({...image,types:['invite']})),/4张/);
 const chosen=images.selection('P',[{...image,types:['invite','confirmed'],caption:'饮品 <新品> / New drink'}]),D=globalThis.MailDesign,design=D.snapshot('invite','https://creator.test/apply',10,chosen),record={body:'合作说明\n\nhttps://creator.test/apply',mailDesign:design};
 chosen[0].caption='Changed';assert.equal(design.images[0].caption,'饮品 <新品> / New drink');
 assert.equal(D.snapshot('issued','',10,chosen).images.length,0);
 const html=D.html(record);assert(html.includes('cid:itea-photo-'+image.id+'@itea.sg'));assert(html.indexOf('cid:itea-photo-')<html.indexOf('填写合作报名表'));assert(!html.includes('<新品>'));assert(!html.includes('<img onerror'));
 const reloaded=createMailImages({dataDir:dir});assert.equal(reloaded.get(image.id).base64,png,'survives restart');
 const requests=[],mail=new LarkMail({images:reloaded,store:{rows:async()=>[]},appSecret:'synthetic',fetchImpl:async(url,opt)=>{requests.push(JSON.parse(opt.body));return {ok:true,json:async()=>({code:0,data:{draft:{id:'draft-test'}}})}}});
 await mail.draft({to:'creator@example.test',subject:'饮品照片 / New drinks',body:record.body,html,design,project:'P',id:'fixture',token:'synthetic'});
 const raw=Buffer.from(requests[0].raw,'base64url'),file=join(dir,'mail.eml');writeFileSync(file,raw);
 const parsed=spawnSync('python3',['-c',`import email,sys,base64
from email import policy
m=email.message_from_binary_file(open(sys.argv[1],'rb'),policy=policy.default)
assert m.get_content_type()=='multipart/related'
html=next(p for p in m.walk() if p.get_content_type()=='text/html').get_content()
photos=[p for p in m.walk() if str(p['Content-ID']).startswith('<itea-photo-')]
assert len(photos)==1
p=photos[0]
assert p.get_content_disposition()=='inline'
assert p.get_payload(decode=True)==base64.b64decode(sys.argv[2])
assert 'cid:'+str(p['Content-ID'])[1:-1] in html
print('PASS Python MIME: exact photo bytes, inline CID and plain/HTML alternatives')`,file,png],{encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);console.log(parsed.stdout.trim());
 await assert.rejects(mail.draft({to:'creator@example.test',subject:'Wrong project',body:record.body,html,design,project:'OTHER',id:'blocked',token:'synthetic'}),/不属于/);assert.equal(requests.length,1,'invalid image must fail before contacting mail provider');
 console.log('PASS mail photos: raster validation/limits, project scoping, immutable stored photos and per-type snapshots, restart persistence, safe HTML, inline MIME; mocked drafts only, no real messages.');
}finally{rmSync(dir,{recursive:true,force:true});}
