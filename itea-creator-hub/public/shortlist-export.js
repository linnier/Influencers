(function(root){'use strict';
const types={paid:'付费博主',mutual:'互惠博主',pending:'待商议'},safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
function workbook({project,selections,people,accounts,defaults={}},X){
 if(!X?.utils)throw Error('Excel组件尚未就绪，请刷新页面后重试');
 const rows=selections.filter(r=>r.project===project.id&&r.phase==='预选'&&(r.status??'预选')==='预选');
 if(!rows.length)throw Error('当前没有可导出的预选达人');
 if(new Set(rows.map(r=>r.person)).size!==rows.length)throw Error('预选资料重复，请刷新后重试');
 const persons=new Map(people.map(p=>[p.id,p])),byPerson=new Map();for(const a of accounts){if(!byPerson.has(a.person))byPerson.set(a.person,[]);byPerson.get(a.person).push(a);}
 const summary=[['项目','达人ID','达人名称','达人标签／内容方向（全部）','地区','达人负责人','邮箱','联系方式','平台','合作类型','费用方式','币种','固定合作费','内部预计现金费','预计权益成本','约定券数量','权益说明（中文）','权益说明（英文）','发布要求（中文）','发布要求（英文）','报名截止日期','发布截止日期','方案名称','已单独调整','内部预选备注','状态','跟进状态','拟合作平台','拟合作账号']];
 const details=[['项目','达人ID','达人名称','达人标签／内容方向（全部）','邮箱','联系方式','平台','平台账号','主页链接','粉丝数','跟进状态','本次合作账号']],links=[];
 for(const selection of rows){
  const p=persons.get(selection.person);if(!p)throw Error('预选达人资料已变化，请刷新后重试');
  const offer=selection.offer||{},as=byPerson.get(p.id)||[],type=offer.type||'pending',tags=String(p.tag||''),chosen=Array.isArray(selection.accountIds)?as.filter(a=>selection.accountIds.includes(a.id)):as;
  summary.push([project.name,p.id,p.name,tags,p.region||'',p.owner||'',String(p.email??''),String(p.contact??''),[...new Set(as.map(a=>a.platform))].join('、'),types[type]||'待商议',type==='paid'?(offer.feeMode==='quote'?'报名报价':'固定报酬'):type==='mutual'?'互惠，无现金报酬':'待商议',project.currency||'',type==='paid'&&offer.feeMode!=='quote'?offer.amount??null:null,type==='mutual'?0:type==='paid'?(offer.feeMode==='quote'?offer.estimate??null:offer.amount??null):null,offer.benefitCost??null,type==='pending'?null:offer.vouchers??null,offer.benefitsZh||'',offer.benefitsEn||'',offer.requirementsZh||'',offer.requirementsEn||'',offer.deadline||defaults.inviteDeadline||'',offer.publishDeadline||defaults.deadline||'',selection.schemeName||'',selection.personalized?'是':'否',offer.note||'','预选，尚未邀约',selection.progress||'未标注',[...new Set(chosen.map(a=>a.platform))].join('、'),chosen.map(a=>a.platform+' @'+a.handle).join('；')]);
  for(const a of as){const url=safeURL(a.url);details.push([project.name,p.id,p.name,tags,String(p.email??''),String(p.contact??''),a.platform,a.handle||'',url,Number.isFinite(a.fans)?a.fans:null,selection.progress||'未标注',chosen.some(x=>x.id===a.id)?'是':'否']);if(url)links.push({r:details.length-1,c:8,url});}
 }
 const wb=X.utils.book_new(),main=X.utils.aoa_to_sheet(summary),account=X.utils.aoa_to_sheet(details);
 main['!cols']=[20,22,24,40,16,16,38,38,22,16,20,10,16,20,18,16,40,40,40,40,18,18,24,16,40,24,18,24,48].map(wch=>({wch}));account['!cols']=[20,22,24,40,38,38,16,26,55,16,18,18].map(wch=>({wch}));
 for(const sheet of [main,account])sheet['!autofilter']={ref:sheet['!ref']};
 for(let r=1;r<summary.length;r++)for(const c of [12,13,14]){const cell=main[X.utils.encode_cell({r,c})];if(cell?.t==='n')cell.z='#,##0.00';}
 for(const {r,c,url}of links)account[X.utils.encode_cell({r,c})].l={Target:url};
 X.utils.book_append_sheet(wb,main,'预选达人');X.utils.book_append_sheet(wb,account,'平台账号');
 wb.Props={Title:project.name+'－项目预选达人',Subject:'预选不表示已邀约或已确认合作；空白费用及粉丝数表示未记录'};
 return wb;
}
function filename(project,scope){const name=String(project.name||'项目').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80);return name+'-预选达人-'+(scope==='selected'?'已勾选':'全部')+'.xlsx';}
root.ShortlistExport={workbook,filename};
})(globalThis);
