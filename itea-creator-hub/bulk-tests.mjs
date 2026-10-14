import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {createHash,webcrypto} from 'node:crypto';
const context={console,URL,Uint8Array,crypto:webcrypto};vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('public/vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('public/post-links.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('public/bulk-core.js',import.meta.url),'utf8'),context);
const X=context.XLSX,B=context.BulkImport;
const empty=()=>({people:[],accounts:[],projects:[],collabs:[],posts:[]});let seq=0;const newId=p=>p+(++seq);
const fixture={SheetNames:['List','汇总'],Sheets:{List:X.utils.aoa_to_sheet([['小红书昵称','链接','价格','发布日期','发布链接','阅读（喊投流）','点赞','收藏','评论','分享','粉丝数','投流费用'],['Test','https://www.xiaohongshu.com/user/profile/123456789012345678901234',1200,'2026-06-08','https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef',0,10,'',2,3,'1.2万',0]]),汇总:X.utils.aoa_to_sheet([['预算申请'],[15000]])}};
const input=B.readWorkbook(fixture,X,'测试.xls');assert.equal(input.budget,15000);assert.equal(input.rows[0].fans,12000);assert.equal(input.rows[0].views,0);assert.equal(input.rows[0].saves,null);
const opts={projectName:'Test',owner:'Test',confirmed:'2026-06-01',today:'2026-10-13',budget:15000};let p=B.plan(input,empty(),opts,newId);assert.equal(p.errors.length,0);assert.equal(p.state.posts.length,1);assert.equal(p.state.posts[0].price,1200);assert.equal(p.state.projects[0].currency,'CNY');assert.equal(p.state.posts[0].saves,null);assert.equal(p.state.people.length,1);
const again=B.plan(input,p.state,{...opts,projectId:p.state.projects[0].id},newId);assert.equal(again.errors.length,0);assert.equal(again.actions.length,0);assert.match(again.results[0].status,/跳过/);
const unknown=B.plan(input,empty(),{...opts,confirmed:''},newId);assert.equal(unknown.errors.length,0);assert.equal(unknown.state.collabs[0].confirmed,'');assert.equal(unknown.state.collabs[0].confirmedUnknown,true);assert.equal(unknown.state.posts[0].date,'2026-06-08');
let bad=structuredClone(input);bad.rows[0].profile='https://xhslink.com/m/test';bad.rows[0].handle='';assert.ok(B.plan(bad,empty(),opts,newId).errors.some(s=>s.includes('主页短链接')));
bad=structuredClone(input);bad.rows.push({...bad.rows[0],excelRow:3});assert.ok(B.plan(bad,empty(),opts,newId).errors.some(s=>s.includes('内容ID重复')));
bad=structuredClone(input);bad.rows[0].platformId='';bad.rows[0].postUrl='https://xhslink.cn/o/a';bad.rows.push({...bad.rows[0],excelRow:3,postUrl:'https://xhslink.cn/o/b'});const missingIdErrors=B.plan(bad,empty(),opts,newId).errors;assert.equal(missingIdErrors.length,0);assert.ok(missingIdErrors.every(s=>!s.includes('内容ID重复')));
bad=structuredClone(input);bad.rows[0].date='2026-02-30';assert.ok(B.plan(bad,empty(),opts,newId).errors.some(s=>s.includes('发布日期')));
const projectsWorkbook=X.utils.book_new();X.utils.book_append_sheet(projectsWorkbook,X.utils.aoa_to_sheet([['项目名称','负责人','预算','币种'],['One','User',100,'人民币'],['Two','User','0','CNY']]));const projectsInput=B.readWorkbook(projectsWorkbook,X,'项目.xlsx');p=B.plan(projectsInput,empty(),{today:opts.today},newId);assert.equal(p.state.projects.length,2);assert.equal(p.state.projects[1].budget,0);

console.log('Passed: both workbook formats, amounts/zero/unknown metrics, exact account and post IDs, note short links accepted without IDs, ambiguous profile links blocked, confirmation/date checks, duplicate content, repeat import skips, and project-only import.');
