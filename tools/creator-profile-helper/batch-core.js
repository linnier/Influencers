(function(root){'use strict';
const LIMIT=30;
function searchUrl(platform,keyword){const q=encodeURIComponent(String(keyword||'').trim());if(!q)throw Error('请填写搜索关键词');if(platform==='TikTok')return 'https://www.tiktok.com/search/user?q='+q;if(platform==='Instagram')return 'https://www.instagram.com/explore/search/keyword/?q='+q;throw Error('不支持的平台');}
function links(raw){const valid=[],invalid=[];for(const s of String(raw||'').split(/[\s,，]+/).filter(Boolean)){const p=root.IteaProfileCard.profile(s);if(p){if(!valid.includes(p.url))valid.push(p.url)}else invalid.push(s)}return {valid:valid.slice(0,LIMIT),invalid,truncated:valid.length>LIMIT};}
function newState(config){config={...config,limit:Math.max(1,Math.min(LIMIT,Number(config.limit)||10)),urls:(config.urls||[]).slice(0,LIMIT)};return {version:1,phase:'idle',stage:config.mode==='links'?'collection':'discovery',config,candidates:config.urls||[],cursor:0,rows:[],outcomes:[],searchRound:0,emptyRounds:0,searchTab:null,workTab:null,reason:''};}
class Runner{
 constructor(state,io){this.state=state;this.io=io;this.active=false;this.cancelled=false;}
 async save(){await this.io.save(this.state);}
 async pause(reason='已暂停，可继续当前任务。'){this.cancelled=true;this.state.phase='paused';this.state.reason=reason;await this.save();}
 async run(){if(this.active)return;this.active=true;this.cancelled=false;const s=this.state;try{
  s.reason='';
  if(s.stage==='discovery'){
   s.phase='discovering';await this.save();
   s.searchTab=await this.io.searchTab(s.searchTab,searchUrl(s.config.platform,s.config.keyword));if(this.cancelled)return;await this.save();
   while(s.searchRound<6&&s.candidates.length<s.config.limit){
    const result=await this.io.scan(s.searchTab,s.config.platform);if(this.cancelled)return;
    if(result.blocked||result.error){await this.pause(result.reason||'搜索页暂时无法读取，请检查工作标签页后继续。');return;}
    const before=s.candidates.length;for(const url of result.urls||[]){const p=root.IteaProfileCard.profile(url);if(p&&p.platform===s.config.platform&&!s.candidates.includes(p.url)&&s.candidates.length<s.config.limit)s.candidates.push(p.url);}
    s.emptyRounds=s.candidates.length===before?(s.emptyRounds||0)+1:0;s.searchRound++;await this.save();if(s.candidates.length>=s.config.limit||result.end||s.emptyRounds>=2)break;
    await this.io.scroll(s.searchTab);if(this.cancelled)return;
   }
   if(!s.candidates.length){s.searchRound=0;await this.pause('没有识别到达人搜索结果。请打开工作标签页，确认搜索词和“用户/账号”结果是否正常；此平台搜索布局可能尚不兼容。');return;}
   s.stage='collection';await this.save();
  }
  s.phase='collecting';await this.save();
  while(s.cursor<s.candidates.length){
   if(this.cancelled)return;const url=s.candidates[s.cursor];s.workTab=await this.io.profileTab(s.workTab,url);if(this.cancelled)return;await this.save();
   const data=await this.io.read(s.workTab);if(this.cancelled)return;
   if(data.status==='blocked'||data.status==='error'){await this.pause(data.reason||'主页暂时无法读取。检查工作标签页后可继续，或跳过本位。');return;}
   if(data.status==='collected'){
    if(data.record?.url!==url){await this.pause('工作页账号与任务不一致，已暂停，避免采集到其他达人。');return;}
    const r=data.record,min=s.config.minFans,max=s.config.maxFans;
    if((min!=null||max!=null)&&(r.fans==null||(min!=null&&r.fans<min)||(max!=null&&r.fans>max))){s.outcomes.push({url,status:'filtered',reason:r.fans==null?'精确粉丝数未获取，未纳入数值筛选':'不在粉丝数范围内'});}
    else{if(!s.rows.some(x=>x.url===url))s.rows.push(r);s.outcomes.push({url,status:'collected',reason:'已保留公开邮箱'});}
   }else if(data.status==='skipped'){if(data.url!==url){await this.pause('工作页账号与任务不一致，无法判断为无邮箱。');return;}s.outcomes.push({url,status:'skipped',reason:data.reason});}
   else{await this.pause('未识别的读取结果，已暂停。');return;}
   s.cursor++;await this.save();if(s.cursor<s.candidates.length)await this.io.delay();
  }
  s.phase='done';s.reason='本次任务已完成。勾选结果后可统一导入系统。';await this.save();
 }catch(e){if(!this.cancelled)await this.pause('任务已暂停：'+String(e.message||e).slice(0,240));}finally{this.active=false;}}
 async skip(){if(this.active)throw Error('请等待任务暂停后操作');if(this.state.stage!=='collection')throw Error('当前还在搜索阶段');const s=this.state;if(s.cursor<s.candidates.length){s.outcomes.push({url:s.candidates[s.cursor],status:'failed',reason:'用户跳过未能读取的主页'});s.cursor++;await this.save();}}
}
root.IteaBatch={LIMIT,searchUrl,links,newState,Runner};
})(globalThis);
