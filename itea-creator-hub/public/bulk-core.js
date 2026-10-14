(function(root){
'use strict';
const metrics=['views','likes','comments','saves','shares','exposure','price','paidCost','paidExposure','paidViews','paidInteractions','follows'];
const clean=v=>String(v??'').trim();
function currency(v){const s=clean(v).toUpperCase();return ['CNY','RMB','人民币','￥','¥'].includes(s)?'CNY':['SGD','新币','新加坡元','S$'].includes(s)?'SGD':'';}
function number(v,integer=false){if(v==null||['','—','-','/','N/A','n/a','未知','未获取','打不开','暂无'].includes(clean(v)))return null;if(typeof v==='number'){if(!Number.isFinite(v)||v<0||(integer&&!Number.isSafeInteger(v)))throw Error('数字必须为非负'+(integer?'整数':'数'));return v;}let s=clean(v).replace(/,/g,'');let factor=1;if(/[wW万]$/.test(s)){factor=10000;s=s.slice(0,-1);}else if(/[kK]$/.test(s)){factor=1000;s=s.slice(0,-1);}else if(/[mM]$/.test(s)){factor=1e6;s=s.slice(0,-1);}else if(/亿$/.test(s)){factor=1e8;s=s.slice(0,-1);}if(!/^\d+(\.\d+)?$/.test(s))throw Error('无法识别数字：'+clean(v).slice(0,25));const n=Number(s)*factor;if(!Number.isFinite(n)||(integer&&!Number.isSafeInteger(n)))throw Error('数字格式不正确');return n;}
function link(v){const match=clean(v).match(/https?:\/\/[^\s<>]+/);if(!match)return '';try{const u=new URL(match[0]);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function xhsId(v,kind){const u=link(v);if(!u)return '';const p=new URL(u);if(!['xiaohongshu.com','www.xiaohongshu.com'].includes(p.hostname))return '';const re=kind==='account'?/^\/user\/profile\/([a-f0-9]{24})(?:\/|$)/i:/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i;return p.pathname.match(re)?.[1].toLowerCase()||'';}
function date(v,X,date1904){if(v==null||clean(v)==='')return '';if(typeof v==='number'){const d=X.SSF.parse_date_code(v,{date1904});if(!d)return '';return [d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');}const s=clean(v).replace(/[年月/]/g,'-').replace(/日/g,'').split(/[ T]/)[0];const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);return m?[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-'):s;}
function goodDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
function normalizeWorkbook(w){const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,e=>{const map={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(map[e])return map[e];const hex=/^&#x/i.test(e),n=parseInt(e.slice(hex?3:2,-1),hex?16:10);return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):'\ufffd';}).replace(/_x([0-9a-f]{4})_/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));for(const name of w.SheetNames)for(const [key,cell]of Object.entries(w.Sheets[name])){if(key.startsWith('!')||!cell||typeof cell.r!=='string')continue;const matches=[...cell.r.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];if(matches.length){cell.v=matches.map(m=>decode(m[1])).join('');cell.t='s';delete cell.w;delete cell.h;}}return w;}
function readWorkbook(w,X,fileName){
 normalizeWorkbook(w);
 if(root.MultiImport?.recognizes(w,X))return root.MultiImport.readWorkbook(w,X,fileName);
 const sheets=w.SheetNames.map(name=>({name,grid:X.utils.sheet_to_json(w.Sheets[name],{header:1,raw:true,defval:'',blankrows:true})}));
 const found=sheets.flatMap(s=>s.grid.slice(0,15).map((row,i)=>({s,i,h:row.map(clean)}))).find(x=>x.h.includes('小红书昵称')&&x.h.includes('发布链接'));
 const projects=sheets.flatMap(s=>s.grid.slice(0,15).map((row,i)=>({s,i,h:row.map(clean)}))).find(x=>x.h.includes('项目名称')&&x.h.includes('负责人'));
 const f=found||projects;if(!f)throw Error('未找到包含“小红书昵称、发布链接”或“项目名称、负责人”的表头');
 if(f.h.filter(Boolean).length!==new Set(f.h.filter(Boolean)).size)throw Error('表头存在重复列名，请先调整');
 if(f.s&&w.Sheets[f.s.name]['!fullref']){const full=X.utils.decode_range(w.Sheets[f.s.name]['!fullref']),part=X.utils.decode_range(w.Sheets[f.s.name]['!ref']);if(full.e.r>part.e.r)throw Error('工作表超过预览上限，请拆分文件后导入');}
 const rows=[];for(let i=f.i+1;i<f.s.grid.length;i++){const cells=f.s.grid[i];const get=k=>cells[f.h.indexOf(k)]??'';if(!clean(get(found?'小红书昵称':'项目名称')))continue;const raw=Object.fromEntries(f.h.filter(Boolean).map(k=>[k,get(k)]));const r={excelRow:i+1,raw,include:true,errors:[]};
  if(found){Object.assign(r,{name:clean(get('小红书昵称')),profile:link(get('链接')),postUrl:link(get('发布链接')),date:date(get('发布日期'),X,w.Workbook?.WBProps?.date1904),type:clean(get('类型')),form:clean(get('合作形式')),related:clean(get('同步平台笔记')),title:clean(get('内容标题'))});r.handle=xhsId(r.profile,'account');r.platformId=xhsId(r.postUrl,'post');const fieldMap={fans:'粉丝数',totalFavorites:'总赞藏',price:'价格',exposure:'曝光（含投流）',views:f.h.includes('阅读（喊投流）')?'阅读（喊投流）':'阅读（含投流）',likes:'点赞',saves:'收藏',comments:'评论',shares:'分享',follows:'关注',paidCost:'投流费用',paidExposure:'投流曝光',paidViews:'投流阅读',paidInteractions:'投流互动',voucherCount:'发券张数'};for(const [k,h]of Object.entries(fieldMap)){try{r[k]=number(get(h),!['price','paidCost'].includes(k));}catch(e){r.errors.push(h+'：'+e.message);}}
  }else{Object.assign(r,{projectName:clean(get('项目名称')),owner:clean(get('负责人'))});try{r.budget=number(get('预算'));}catch(e){r.errors.push('预算：'+e.message);}r.currency=currency(get('币种')||'CNY');if(!r.currency)r.errors.push('币种须为 CNY 或 SGD');}
  rows.push(r);
 }
 if(!rows.length)throw Error('没有找到数据行');if(rows.length>500)throw Error('一次最多预览500行，请拆分文件');
 let budget=null;const summary=sheets.find(s=>s.name==='汇总');if(summary){for(let i=0;i<summary.grid.length-1;i++){const c=summary.grid[i].map(clean).indexOf('预算申请');if(c>=0){try{budget=number(summary.grid[i+1][c]);}catch{}break;}}}
 return {kind:found?'posts':'projects',sheet:f.s.name,fileName,projectName:fileName.replace(/\.(xlsx|xls)$/i,'').replace(/清单$/,''),budget,rows};
}
function plan(input,state,opts,newId){
 if(input.kind==='multi')return root.MultiImport.plan(input,state,opts,newId);
 const s=JSON.parse(JSON.stringify(state));const errors=[],results=[],actions=[];const today=opts.today;const add=(key,obj)=>{s[key].push(obj);actions.push({key,obj});return obj;};
 if(!input.rows.some(r=>r.include)){return {state:s,errors:['请至少选择一行'],results,actions};}
 if(input.kind==='projects'){
  for(const r of input.rows.filter(r=>r.include)){let error=r.errors.join('；');if(!r.projectName||r.projectName.length>100||!r.owner||r.owner.length>60)error+=' 项目名称或负责人不完整';const matches=s.projects.filter(p=>p.name===r.projectName);if(matches.length===1&&matches[0].currency&&matches[0].currency!==(r.currency||'CNY'))error+=' 已有项目币种不一致';if(matches.length>1)error+=' 已有同名项目不唯一';if(error){errors.push('第'+r.excelRow+'行：'+error);results.push({row:r,status:error});continue;}if(matches.length){results.push({row:r,status:'跳过已有项目'});continue;}add('projects',{id:newId('P'),name:r.projectName,owner:r.owner,budget:r.budget,currency:r.currency||'CNY'});results.push({row:r,status:'新增项目'});}
  return {state:s,errors,results,actions};
 }
 let project=opts.projectId?s.projects.find(p=>p.id===opts.projectId):null;let projectNew=!opts.projectId;const selectedCurrency=currency(opts.currency||'CNY');if(!selectedCurrency)errors.push('请选择 CNY 或 SGD');if(project?.currency&&project.currency!==selectedCurrency)errors.push('导入币种与项目不一致，请选择正确币种；不会自动换算');
 if(opts.projectId&&!project)errors.push('所选项目不存在，请刷新');
 if(projectNew&&(!clean(opts.projectName)||clean(opts.projectName).length>100))errors.push('请填写项目名称（最多100字）');
 if(!clean(opts.owner)||clean(opts.owner).length>60)errors.push('请填写负责人（最多60字）');
 if(projectNew&&s.projects.some(p=>p.name===clean(opts.projectName)))errors.push('项目名称已存在，请选择已有项目');
 let budget=null;try{budget=number(opts.budget);}catch(e){errors.push('预算：'+e.message);}
 if(errors.length)return {state:s,errors,results,actions};
 if(projectNew)project={id:newId('P'),name:clean(opts.projectName),owner:clean(opts.owner),budget,currency:selectedCurrency};
 const seen=new Set();
 for(const r of input.rows.filter(r=>r.include)){
  let err=[...r.errors];const profile=link(r.profileOverride||r.profile),handle=xhsId(profile,'account')||r.handle;const postUrl=link(r.postOverride||r.postUrl),postId=xhsId(postUrl,'post')||clean(r.postIdOverride)||r.platformId;
  if(!goodDate(r.date)||r.date>today)err.push('发布日期缺失、无效或晚于今天');if(!postUrl)err.push('发布链接缺失');if(r.postIdOverride&&!/^[a-f0-9]{24}$/i.test(clean(r.postIdOverride)))err.push('内容ID格式无效');
  let account=r.accountId?s.accounts.find(a=>a.id===r.accountId):s.accounts.find(a=>a.platform==='小红书'&&a.handle.toLowerCase()===handle.toLowerCase());
  if(r.accountId&&(!account||account.platform!=='小红书'))err.push('所选账号不是有效的小红书账号');if(account&&handle&&account.handle.toLowerCase()!==handle.toLowerCase())err.push('主页ID与所选账号不一致');
  if(!account&&!handle)err.push('主页短链接需选择已有账号或补完整主页');if(!account&&(!r.name||r.name.length>60))err.push('新达人名称为空或超过60字');
  const key='小红书:'+(postId?postId.toLowerCase():root.PostLinks?.canonical(postUrl)||postUrl);if(postId||postUrl){if(seen.has(key))err.push('文件内内容ID重复');seen.add(key);}
  const existingPost=s.posts.find(p=>((postId&&p.platformId?.toLowerCase()===postId.toLowerCase())||(postUrl&&p.url&&(root.PostLinks?root.PostLinks.canonical(p.url)===root.PostLinks.canonical(postUrl):p.url===postUrl)))&&s.accounts.find(a=>a.id===s.collabs.find(c=>c.id===p.collab)?.account)?.platform==='小红书');
  if(existingPost){const c=s.collabs.find(c=>c.id===existingPost.collab);if(c.project!==project.id||!account||c.account!==account.id)err.push('此内容已属于其他项目或账号，不能重复导入');else if(!err.length){results.push({row:r,status:'跳过已有 Post'});continue;}}
  let collab=account?s.collabs.find(c=>c.account===account.id&&c.project===project.id):null;
  if(collab&&collab.account!==account.id)err.push('同一达人在项目中已登记其他账号，需先人工确认');if(collab&&['已取消','未选中'].includes(collab.stage))err.push('合作已取消或未选中，不能追加 Post');
  if(!collab?.confirmed&&!collab?.confirmedUnknown){if(opts.confirmed&&(!goodDate(opts.confirmed)||opts.confirmed>r.date))err.push('合作确认日期无效或晚于发布日期');if(collab)err.push('已有报名尚未确认合作，请先修改合作阶段');}
  if(err.length){const message=err.join('；');errors.push('第'+r.excelRow+'行：'+message);results.push({row:r,status:message});continue;}
  if(projectNew){add('projects',project);projectNew=false;}
  if(!account){const person=add('people',{id:newId('D'),name:r.name,tag:'',region:'',owner:clean(opts.owner),itea:'',email:'',contact:'',notes:''});account=add('accounts',{id:newId('A'),person:person.id,platform:'小红书',handle,url:profile,fans:r.fans});}
  if(!collab)collab=add('collabs',{id:newId('C'),person:account.person,account:account.id,project:project.id,stage:'已确认合作',confirmed:opts.confirmed||'',confirmedUnknown:!opts.confirmed,owner:clean(opts.owner),due:'',target:1});
  const p={id:newId('POST'),collab:collab.id,account:account.id,platformId:postId?postId.toLowerCase():newId('LINK'),title:r.title||[r.name,r.type||'笔记',r.date].join(' · '),date:r.date,updated:today,url:postUrl,currency:selectedCurrency,contentType:r.type,form:r.form,related:r.related,sourceFile:input.fileName,sourceRow:r.excelRow,sourceData:JSON.stringify(r.raw)};for(const k of metrics)p[k]=r[k]??null;p.voucherCount=r.voucherCount??null;p.voucherCost=p.voucherCount===null?null:p.voucherCount*3;if(p.voucherCount!==null)p.voucherCurrency='SGD';add('posts',p);results.push({row:r,status:'新增 Post'+(r.title?'':'（标题为导入标签）')});
 }
 // All rows are checked before writes; any error blocks this plan in full.
 return {state:s,errors,results,actions};
}
function batches(base,actions,size=20){const s=JSON.parse(JSON.stringify(base));const out=[];for(let i=0;i<actions.length;i+=size){for(const a of actions.slice(i,i+size))s[a.key].push(JSON.parse(JSON.stringify(a.obj)));out.push(JSON.parse(JSON.stringify(s)));}return out;}
root.BulkImport={normalizeWorkbook,currency,readWorkbook,plan,batches,number,link,xhsId,goodDate};
})(globalThis);
