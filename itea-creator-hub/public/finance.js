(function(root){
'use strict';
const currencies=['CNY','SGD'];
const isNumber=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const money=(v,c,d=2)=>v==null?'未记录':(c==='CNY'?'¥ ':c==='SGD'?'S$ ':'')+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
function interactionValue(p){return ['likes','comments','saves','shares'].every(k=>isNumber(p[k]))?p.likes+p.comments+p.saves+p.shares:isNumber(p.reportedInteractions)?p.reportedInteractions:null;}
function summarize(state,selectedPosts,selectedProjects,manualIssues=[]){
 const collabs=new Map(state.collabs.map(c=>[c.id,c])),projects=new Map(state.projects.map(p=>[p.id,p]));const groups=[];let unknownCurrency=0;
 for(const c of currencies){const localRows=selectedPosts.filter(p=>(p.currency||projects.get(collabs.get(p.collab)?.project)?.currency)===c),pr=selectedProjects.filter(p=>p.currency===c);const voucherRows=c==='SGD'?selectedPosts.filter(p=>isNumber(p.voucherCount)):[],rows=[...new Set([...localRows,...voucherRows])],manualRows=c==='SGD'?manualIssues.filter(x=>selectedProjects.some(p=>p.id===x.project)):[];if(!rows.length&&!pr.length&&!manualRows.length)continue;const sum=(items,key)=>items.reduce((n,p)=>n+(isNumber(p[key])?p[key]:0),0);const feeCount=localRows.filter(p=>isNumber(p.price)).length,adsCount=localRows.filter(p=>isNumber(p.paidCost)).length,budgetCount=pr.filter(p=>isNumber(p.budget)).length;
  const manualCount=manualRows.reduce((t,x)=>t+x.quantity,0),voucher=manualCount*3+voucherRows.reduce((t,p)=>t+p.voucherCount*3,0),cost=p=>(localRows.includes(p)?(isNumber(p.price)?p.price:0)+(isNumber(p.paidCost)?p.paidCost:0):0)+(c==='SGD'&&isNumber(p.voucherCount)?p.voucherCount*3:0),hasCost=p=>localRows.includes(p)&&(isNumber(p.price)||isNumber(p.paidCost))||c==='SGD'&&isNumber(p.voucherCount);
  const engagementValue=interactionValue;
  const exposureRows=rows.filter(p=>hasCost(p)&&isNumber(p.exposure)),readRows=rows.filter(p=>hasCost(p)&&isNumber(p.views)),interactionRows=rows.filter(p=>hasCost(p)&&engagementValue(p)!==null),rateRows=rows.filter(p=>isNumber(p.views)&&engagementValue(p)!==null),interaction=p=>p.likes+p.comments+p.saves+p.shares;
  const ratio=(list,denominator,multiplier=1)=>{const n=list.reduce((sum,p)=>sum+denominator(p),0);return n>0?list.reduce((sum,p)=>sum+cost(p),0)/n*multiplier:null;};
  const total=feeCount||adsCount||voucherRows.length||manualRows.length?sum(localRows,'price')+sum(localRows,'paidCost')+voucher:null,budget=budgetCount?sum(pr,'budget'):null,views=sum(rateRows,'views');
  groups.push({currency:c,posts:rows.length,projectCount:pr.length,coop:feeCount?sum(localRows,'price'):null,ads:adsCount?sum(localRows,'paidCost'):null,voucher:voucherRows.length||manualRows.length?voucher:null,manualVouchers:manualCount,voucherCount:manualCount+voucherRows.reduce((t,p)=>t+p.voucherCount,0),voucherOnly:rows.length-localRows.length,total,budget,balance:total!==null&&budget!==null?budget-total:null,missingFees:localRows.length*2-feeCount-adsCount,missingBudgets:pr.length-budgetCount,cpm:ratio(exposureRows,p=>p.exposure,1000),cpe:ratio(interactionRows,engagementValue),cpc:ratio(readRows,p=>p.views),engagement:views>0?rateRows.reduce((sum,p)=>sum+engagementValue(p),0)/views*100:null,samples:{cpm:exposureRows.length,cpe:interactionRows.length,cpc:readRows.length,engagement:rateRows.length}});
 }
 for(const p of selectedPosts)if(!currencies.includes(p.currency||projects.get(collabs.get(p.collab)?.project)?.currency))unknownCurrency++;
 return {groups,unknownCurrency};
}
function html(result,esc){let h='<section class="panel"><h3>项目费用与效果</h3><p class="muted">按币种分别汇总；项目预算为完整项目预算，平台、达人和负责人筛选不拆分预算。费用含Post记录及人工发券台账，未设置付款状态。人工台账券费只计入金额，不分摊到Post效果指标。</p>';
 if(!result.groups.length)h+='<p class="muted">当前没有已设置币种的费用或预算，请在项目中设置 CNY 或 SGD。</p>';
 for(const g of result.groups){h+='<h3 style="margin-top:18px">'+(g.currency==='CNY'?'人民币 CNY':'新加坡元 SGD')+'</h3><div class="cards">'+[['项目预算',money(g.budget,g.currency),'完整项目预算'],['合作费用',money(g.coop,g.currency),'按笔记价格累计'],['投流费用',money(g.ads,g.currency),'已记录投流费用'],...(g.currency==='SGD'?[['券包费用',money(g.voucher,'SGD'),'已记录 '+g.voucherCount+' 张券 × S$3'+(g.manualVouchers?'（人工台账 '+g.manualVouchers+' 张）':'')]]:[]),['已记录费用',money(g.total,g.currency),g.currency==='SGD'?'合作费用 + 投流费用 + 券包费用':'合作费用 + 投流费用']].map(([label,value,sub])=>'<div class="card">'+label+'<strong class="fee-value">'+esc(value)+'</strong><small>'+sub+'</small></div>').join('')+'</div><p>账面预算余额 <b>'+esc(money(g.balance,g.currency))+'</b></p>';
 if(g.voucherOnly)h+='<p class="muted">其中 '+g.voucherOnly+'篇其他币种项目笔记的券包费用单独记为新币；这些项目的合作费、投流费和预算不计入本组。</p>';
 if(g.missingFees||g.missingBudgets)h+='<p class="muted">'+g.missingFees+'项费用、'+g.missingBudgets+'个项目预算未填写；金额和余额仅按已记录数据计算。</p>';
 h+='<div class="cards">'+[['CPM',money(g.cpm,g.currency),'费用 ÷ 曝光 × 1,000',g.samples.cpm],['CPE',money(g.cpe,g.currency,4),'费用 ÷ 已录入互动量',g.samples.cpe],['CPC',g.cpc===null?'待补阅读量':money(g.cpc,g.currency,4),'费用 ÷ 阅读量（自定义口径）',g.samples.cpc],['互动率',g.engagement===null?'数据不完整':g.engagement.toFixed(2)+'%','已录入互动量 ÷ 阅读量',g.samples.engagement]].map(([label,value,sub,sample])=>'<div class="card">'+label+'<strong class="fee-value">'+esc(value)+'</strong><small>'+sub+' · '+sample+'/'+g.posts+'篇具备所需数据</small></div>').join('')+'</div><p class="muted">互动量每篇只计一次：自动合计点赞、收藏、分享、评论；四项明细不完整时才使用平台报告总数。CPE和互动率使用相同口径。各指标只使用具备相应分母的笔记和这些笔记的已记录费用；未知费用不当作完整费用，CPC 按指定口径使用阅读量，不代表平台点击成本。</p>';}
 if(result.unknownCurrency)h+='<p class="muted">另有 '+result.unknownCurrency+'篇笔记未设置币种，未并入任何币种金额。</p>';return h+'</section>';
}

function dataSummary(rows){
 const keys=['exposure','views','likes','comments','saves','shares','follows','reportedInteractions'];const metrics={};
 for(const key of keys){const known=rows.filter(p=>isNumber(p[key]));metrics[key]={value:known.length?known.reduce((t,p)=>t+p[key],0):null,known:known.length,total:rows.length};}
 const knownInteractions=rows.filter(p=>interactionValue(p)!==null);metrics.interactions={value:knownInteractions.length?knownInteractions.reduce((t,p)=>t+interactionValue(p),0):null,known:knownInteractions.length,total:rows.length};
 return {posts:rows.length,metrics};
}
function creatorSummary(state,rows){const data=dataSummary(rows),projects=new Map(state.projects.map(p=>[p.id,p])),collabs=new Map(state.collabs.map(c=>[c.id,c])),groups=[];const keys=[...new Set(rows.map(p=>p.currency||projects.get(collabs.get(p.collab)?.project)?.currency||''))];for(const currency of keys){const ps=rows.filter(p=>(p.currency||projects.get(collabs.get(p.collab)?.project)?.currency||'')===currency),priced=ps.filter(p=>isNumber(p.price)),expo=priced.filter(p=>isNumber(p.exposure)),eng=priced.filter(p=>interactionValue(p)!==null),ratio=(items,den,scale=1)=>{const d=items.reduce((t,p)=>t+den(p),0);return d>0?items.reduce((t,p)=>t+p.price,0)/d*scale:null;};groups.push({currency,price:priced.length?priced.reduce((t,p)=>t+p.price,0):null,priceKnown:priced.length,total:ps.length,cpm:ratio(expo,p=>p.exposure,1000),cpe:ratio(eng,interactionValue),cpmKnown:expo.length,cpeKnown:eng.length});}return {data,groups};}

function dataHTML(rows,esc){const d=dataSummary(rows),labels=[['exposure','曝光量'],['views','阅读量'],['interactions','互动量']];
 return '<section class="panel"><h3>项目数据汇总</h3><p class="muted">当前筛选范围 · '+d.posts+'篇笔记；已录入的曝光和阅读包含投流时不再重复叠加投流数据。</p><div class="cards summary-cards">'+labels.map(([k,label])=>{const m=d.metrics[k];return '<div class="card">'+label+'<strong class="fee-value">'+esc(m.value===null?'未获取':m.value.toLocaleString('zh-CN'))+'</strong><small>'+m.known+' / '+m.total+'篇已填写'+(m.known<m.total?' · 部分数据待补全':'')+'</small></div>';}).join('')+'</div><p class="muted">每项只累计已填写数值，未知不当作0。互动量自动合计点赞、收藏、分享、评论；四项不完整时使用平台报告总数，每篇只计一次。阅读量为内容累加，不代表独立人数。切换项目、平台、达人或负责人后重新汇总。</p></section>';
}
root.FeeOverview={summarize,money,html,dataSummary,dataHTML,interactionValue,creatorSummary};
})(globalThis);
