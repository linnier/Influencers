(function(root){'use strict';
const fields=['shootStart','shootEnd','publishStart','publishEnd'];
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const check=(ok,message)=>{if(!ok)throw Error(message);};
function ranges(value={}){
 const out={};for(const key of fields){const v=value[key]??'';check(typeof v==='string','日期格式无效 / Invalid date');out[key]=v;}
 for(const [key,label,en]of [['shoot','拍摄','shoot'],['publish','发布','publication']]){
  const start=out[key+'Start'],end=out[key+'End'];
  check(!start&&!end||date(start)&&date(end),'请填写完整有效的'+label+'日期范围 / Enter both valid '+en+' dates');
  check(!start||start<=end,label+'开始日期不能晚于结束日期 / The '+en+' start must be on or before its end');
 }
 check(!out.shootStart||!out.publishEnd||out.publishEnd>=out.shootStart,'发布日期范围不能全部早于拍摄日期范围 / The publication window must allow a date on or after the shoot');
 return out;
}
function selection(value,limits={}){
 const r=ranges(limits),out={};
 for(const [key,label,en]of [['shoot','拍摄日期','shoot date'],['publish','发布日期','publication date']]){
  const v=value[key+'Date']??'',start=r[key+'Start'],end=r[key+'End'];
  check(typeof v==='string'&&(!v||date(v)),label+'格式无效 / Invalid '+en);
  check(!start||!!v,'请选择'+label+' / Select a '+en);
  check(!v||(!start||v>=start)&&(!end||v<=end),label+'不在允许范围内 / The '+en+' is outside the allowed dates');
  out[key+'Date']=v;
 }
 check(!out.shootDate||!out.publishDate||out.publishDate>=out.shootDate,'发布日期不能早于拍摄日期 / Publication cannot be before the shoot');
 return out;
}
root.InviteSchedule={fields,date,ranges,selection};
})(globalThis);
