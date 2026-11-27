(function(root){'use strict';
const progressStates=['','已询价','洽谈中','权益确认','高意向合作'];
const types={paid:'付费博主',mutual:'互惠博主',pending:'待商议'},fields=['shootStart','shootEnd','publishStart','publishEnd'];
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const check=(v,m)=>{if(!v)throw Error(m);};
function clean(raw={}, {defaults={},resolve=false,allowPending=false}={}){
 check(raw&&typeof raw==='object'&&!Array.isArray(raw),'合作方案格式无效');
 const type=raw.type||((raw.amount||0)>0?'paid':'mutual'),feeMode=type==='paid'?(raw.feeMode||'fixed'):'fixed';
 check(Object.hasOwn(types,type)&&(allowPending||type!=='pending'),'请确定付费或互惠合作类型');check(['fixed','quote'].includes(feeMode),'费用方式无效');
 const out={type,feeMode,amount:type==='mutual'?0:type==='paid'&&feeMode==='fixed'?raw.amount:null,estimate:raw.estimate??null,vouchers:raw.vouchers??0,benefitCost:raw.benefitCost??null};
 if(type==='paid'&&feeMode==='fixed')check(typeof out.amount==='number'&&Number.isFinite(out.amount)&&out.amount>0&&out.amount<=1e8,'固定合作费必须大于0且不超过一亿');
 for(const k of ['estimate','benefitCost'])check(out[k]===null||typeof out[k]==='number'&&Number.isFinite(out[k])&&out[k]>=0&&out[k]<=1e8,'内部预计费用无效，未知请留空');
 check(Number.isSafeInteger(out.vouchers)&&out.vouchers>=0&&out.vouchers<=100000,'券数量须为0至100000的整数');
 for(const k of ['benefitsZh','benefitsEn','requirementsZh','requirementsEn','note']){const v=raw[k]??'';check(typeof v==='string'&&v.length<=(k==='note'?500:1500),'权益、发布要求或内部备注过长');out[k]=v.trim();}
 // The numeric voucher field is authoritative; product/experience text is optional.
 check(type!=='mutual'||out.vouchers>0||out.benefitsZh,'请填写互惠权益或券数量');
 for(const [key,fallback]of [['deadline',defaults.inviteDeadline],['publishDeadline',defaults.deadline]]){const v=raw[key]??'';check(typeof v==='string'&&(!v||validDate(v)),'请填写有效的报名／发布截止日期');out[key]=v||(resolve?fallback||'':'');if(resolve)check(validDate(out[key]),'请设置报名和发布截止日期，或补充项目默认日期');}
 const deadline=out.deadline||defaults.inviteDeadline,publish=out.publishDeadline||defaults.deadline;
 check(!deadline||!publish||publish>=deadline,'发布截止日期不能早于报名截止日期');
 Object.assign(out,root.InviteSchedule.ranges(Object.fromEntries(fields.map(k=>[k,raw[k]??'']))));
 check(!out.publishEnd||!publish||out.publishEnd<=publish,'发布日期范围不能晚于发布截止日期');
 return out;
}
function benefits(r,currency,en=false){
 const parts=[];if(r.type==='paid')parts.push(r.amount>0?currency+' '+r.amount.toFixed(2):en?'Fee subject to quotation':'合作费用待报价');else if(r.type==='mutual')parts.push(en?'No cash fee':'无现金报酬');
 const custom=en?r.benefitsEn:r.benefitsZh;if(custom)parts.push(custom);else if(en&&r.benefitsZh)parts.push(r.benefitsZh);
 if(r.vouchers)parts.push(r.vouchers+(en?' vouchers agreed':' 张约定优惠券'));return parts.join(en?'; ':'；');
}
function settings(base,r,currency){if(!r?.type)return {...base};return {...base,benefitsZh:benefits(r,currency),benefitsEn:benefits(r,currency,true),requirementsZh:r.requirementsZh||base.requirementsZh,requirementsEn:r.requirementsEn||base.requirementsEn,inviteDeadline:r.deadline||base.inviteDeadline,deadline:r.publishDeadline||base.deadline};}
function paidBody(template,r,currency){
 if(r.type!=='paid')return template;
 const notice=r.feeMode==='quote'?'请在报名表提交合作报价（'+currency+'）、包含的发布内容及费用说明。提交报价不代表合作已确认。\nPlease submit your quote in '+currency+', the deliverables covered and any fee notes in the application form. A quote does not confirm the collaboration.':'本次固定合作报酬：'+currency+' '+r.amount.toFixed(2)+'。请在报名表确认接受，合作须经负责人审核。\nFixed collaboration fee: '+currency+' '+r.amount.toFixed(2)+'. Please confirm acceptance in the application form. Your application is subject to review.';
 const marker='拍摄与发布要求 / Content and publishing requirements';return template.includes(marker)?template.replace(marker,notice+'\n\n'+marker):template+'\n\n'+notice;
}
function quote(raw,r,currency){
 if(r.type!=='paid'||r.feeMode!=='quote')return undefined;
 check(raw&&typeof raw==='object'&&typeof raw.amount==='number'&&Number.isFinite(raw.amount)&&raw.amount>0&&raw.amount<=1e8,'请填写有效的合作报价 / Enter a valid collaboration quote');
 check(raw.currency===currency,'报价币种必须与项目一致 / Quote currency must match the project');
 check(typeof raw.scope==='string'&&raw.scope.trim()&&raw.scope.length<=1500&&typeof (raw.notes??'')==='string'&&(raw.notes||'').length<=1000,'请填写报价包含的内容及有效说明 / Enter the deliverables covered by your quote');
 return {amount:raw.amount,currency,scope:raw.scope.trim(),notes:(raw.notes||'').trim()};
}
function publicReward(r){const out={...r};for(const k of ['estimate','benefitCost','note'])delete out[k];return out;}
function summary(r,currency){return (types[r.type]||'合作')+' · '+(r.feeMode==='quote'&&r.amount==null?'报名报价':r.amount==null?'费用待定':currency+' '+r.amount.toFixed(2))+' · '+r.vouchers+' 张券';}
root.CooperationOffers={types,progressStates,fields,validDate,clean,benefits,settings,paidBody,quote,publicReward,summary};
})(globalThis);
