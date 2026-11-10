(function(root){'use strict';
const LIMIT=300;
function searchUrl(platform,keyword,searchType='content'){const q=encodeURIComponent(String(keyword||'').trim());if(!q)throw Error('请填写搜索关键词');if(platform==='TikTok')return 'https://www.tiktok.com/search'+(searchType==='accounts'?'/user':'')+'?q='+q;if(platform==='Instagram')return 'https://www.instagram.com/explore/search/keyword/?q='+q;throw Error('不支持的平台');}
function links(raw){const valid=[],invalid=[];for(const s of String(raw||'').split(/[\s,，]+/).filter(Boolean)){const p=root.IteaProfileCard.profile(s);if(p){if(!valid.includes(p.url))valid.push(p.url)}else invalid.push(s)}return {valid:valid.slice(0,LIMIT),invalid,truncated:valid.length>LIMIT};}
function config(value){const limit=Math.max(1,Math.min(LIMIT,Number(value.limit)||100));return {...value,searchType:value.searchType==='accounts'?'accounts':'content',limit,maxRounds:Math.min(120,Math.max(12,Math.ceil(limit/10)*4)),postLimit:Math.min(900,limit*3),paceMs:Number(value.paceMs)===2000?2000:800,urls:(value.urls||[]).slice(0,LIMIT)};}
function newState(value){return {version:1,phase:'idle',stage:value.mode==='links'?'collection':'discovery',config:config(value),candidates:(value.urls||[]).slice(0,LIMIT),cursor:0,rows:[],outcomes:[],searchRound:0,emptyRounds:0,posts:[],postCursor:0,cachedUrls:[],observedProfiles:[],searchTab:null,workTab:null,reason:'',activeItem:''};}
class Runner{
 constructor(state,io){state.config=config(state.config);for(const key of ['posts','cachedUrls','observedProfiles'])state[key]=state[key]||[];state.postCursor=state.postCursor||0;this.state=state;this.io=io;this.active=false;this.cancelled=false;this.known=new Set(state.config.knownUrls||[]);}
 async save(){await this.io.save(this.state);}
 knownURL(url){return !this.state.config.repairFans&&this.state.config.skipKnown!==false&&this.known.has(url);}
 cached(url){if(!this.state.cachedUrls.includes(url))this.state.cachedUrls.push(url);}
 async pause(reason='已暂停，可继续当前任务。'){this.cancelled=true;this.state.phase='paused';this.state.reason=reason;await this.save();}
 async consume(){const s=this.state,url=s.candidates[s.cursor];if(this.cancelled)return false;
  if(this.knownURL(url)){this.cached(url);s.cursor++;await this.save();return true;}
  s.activeItem='profile';s.phase='collecting';await this.save();if(this.cancelled)return false;
  s.workTab=await this.io.profileTab(s.workTab,url);if(this.cancelled)return false;await this.save();if(this.cancelled)return false;
  const data=await this.io.read(s.workTab);if(this.cancelled)return false;
  if(data.status==='blocked'||data.status==='error'){if(data.diagnostic)s.diagnostic=data.diagnostic;await this.pause(data.reason||'主页暂时无法读取。检查工作标签页后可继续，或跳过本位。');return false;}
  if(data.status==='collected'){
   if(data.record?.url!==url){await this.pause('工作页账号与任务不一致，已暂停，避免采集到其他达人。');return false;}
   const r=data.record,min=s.config.minFans,max=s.config.maxFans,estimate=root.IteaFollowers.parse(r.fansDisplay),value=r.fans??(estimate?.approx?estimate.value:null);
   r.rangeStatus=min==null&&max==null?'match':value==null?'unknown':((min!=null&&value<min)||(max!=null&&value>max))?'outside':'match';
   const existing=s.rows.findIndex(x=>x.url===url);if(existing<0)s.rows.push(r);else s.rows[existing]={...s.rows[existing],...r};if(r.fans==null&&r.metricDiagnostic)s.diagnostic=r.metricDiagnostic;
   s.outcomes.push({url,status:r.rangeStatus==='match'?'collected':'filtered',reason:r.rangeStatus==='unknown'?'已保留邮箱；粉丝数待核实':r.rangeStatus==='outside'?'已保留邮箱；粉丝数不在筛选范围内':'已保留公开邮箱'});
   await this.save();if(this.io.onRecord)await this.io.onRecord(r);
  }else if(data.status==='skipped'){
   if(data.url!==url){await this.pause('工作页账号与任务不一致，无法判断为无邮箱。');return false;}
   s.outcomes.push({url,status:'skipped',reason:data.reason+(data.fansDisplay?' 粉丝数：'+data.fansDisplay:'')});
  }else{await this.pause('未识别的读取结果，已暂停。');return false;}
  if(this.io.remember)await this.io.remember(url,data.status);this.known.add(url);s.cursor++;s.activeItem='';await this.save();return !this.cancelled;
 }
 async run(){if(this.active)return;this.active=true;this.cancelled=false;const s=this.state;try{
  s.reason='';
  if(s.stage==='discovery'){
   s.phase='discovering';s.activeItem='';await this.save();if(this.cancelled)return;
   s.searchTab=await this.io.searchTab(s.searchTab,searchUrl(s.config.platform,s.config.keyword,s.config.searchType));if(this.cancelled)return;await this.save();
   while(s.searchRound<s.config.maxRounds&&s.candidates.length<s.config.limit&&s.posts.length<s.config.postLimit){
    if(this.cancelled)return;const result=await this.io.scan(s.searchTab,s.config.platform);if(this.cancelled)return;
    if(result.blocked||result.error){await this.pause(result.reason||'搜索页暂时无法读取，请检查工作标签页后继续。');return;}
    const before=s.observedProfiles.length+s.posts.length;
    for(const raw of result.urls||[]){const a=root.IteaProfileCard.profile(raw);if(!a||a.platform!==s.config.platform)continue;if(!s.observedProfiles.includes(a.url))s.observedProfiles.push(a.url);if(this.knownURL(a.url)){this.cached(a.url);continue;}if(!s.candidates.includes(a.url)&&s.candidates.length<s.config.limit)s.candidates.push(a.url);}
    for(const raw of result.posts||[]){const url=root.IteaScan.post(raw);if(s.config.platform==='Instagram'&&url&&!s.posts.includes(url)&&s.posts.length<s.config.postLimit)s.posts.push(url);}
    s.emptyRounds=s.observedProfiles.length+s.posts.length===before?s.emptyRounds+1:0;s.searchRound++;await this.save();if(this.cancelled)return;
    if(s.candidates.length>=s.config.limit||s.posts.length>=s.config.postLimit||result.end||s.emptyRounds>=4)break;
    await this.io.scroll(s.searchTab);if(this.cancelled)return;
   }
   if(!s.candidates.length&&!s.posts.length){if(s.cachedUrls.length){s.phase='done';s.reason='本批账号近期已读取，已跳过 '+s.cachedUrls.length+' 位。可更换关键词，或取消“跳过最近已读主页”重新读取。';await this.save();return;}s.searchRound=0;await this.pause('没有识别到达人搜索结果。请打开工作标签页检查结果是否正常；此平台搜索布局可能尚不兼容。');return;}
   s.stage=s.posts.length?'authors':'collection';await this.save();
  }
  if(s.stage==='authors'){
   while(s.cursor<s.candidates.length||(s.postCursor<s.posts.length&&s.candidates.length<s.config.limit)){
    if(this.cancelled)return;
    // Stream results: read a new author's profile before resolving the next post.
    if(s.cursor<s.candidates.length){if(!await this.consume())return;if(s.postCursor<s.posts.length)await this.io.delay();continue;}
    s.phase='resolving';s.activeItem='post';await this.save();if(this.cancelled)return;
    const url=s.posts[s.postCursor];s.workTab=await this.io.profileTab(s.workTab,url);if(this.cancelled)return;await this.save();if(this.cancelled)return;
    const data=await this.io.author(s.workTab,url);if(this.cancelled)return;
    const owner=data.status==='found'?root.IteaProfileCard.profile(data.url):null;
    if(!owner||owner.platform!=='Instagram'||data.postUrl!==url){s.diagnostic=data.diagnostic||null;await this.pause(data.reason||'未能可靠识别当前帖子的作者，已暂停。');return;}
    s.diagnostic=null;const duplicate=s.candidates.includes(owner.url),known=!duplicate&&this.knownURL(owner.url);
    if(known)this.cached(owner.url);else if(!duplicate)s.candidates.push(owner.url);
    s.outcomes.push({url,status:'author',reason:(known?'近期已读，跳过：':duplicate?'重复作者，已合并：':'识别作者：')+'@'+owner.handle,authorUrl:owner.url});s.postCursor++;s.activeItem='';await this.save();
    if((known||duplicate)&&s.postCursor<s.posts.length)await this.io.delay();
   }
   s.stage='collection';await this.save();
  }
  while(s.cursor<s.candidates.length){if(!await this.consume())return;if(s.cursor<s.candidates.length)await this.io.delay();}
  s.phase='done';s.activeItem='';s.reason='本次任务已完成。邮箱线索已保存在本机，连接系统后分批自动保存。'+(s.cachedUrls.length?' 已跳过近期读过的 '+s.cachedUrls.length+' 位。':'');await this.save();
 }catch(e){if(!this.cancelled)await this.pause('任务已暂停：'+String(e.message||e).slice(0,240));}finally{this.active=false;}}
 async skip(){if(this.active)throw Error('请等待任务暂停后操作');const s=this.state;
  if(s.activeItem==='profile'||s.stage==='collection'){if(s.cursor<s.candidates.length){s.outcomes.push({url:s.candidates[s.cursor],status:'failed',reason:'用户跳过未能读取的主页'});s.cursor++;await this.save();}return;}
  if(s.stage==='authors'){if(s.postCursor<s.posts.length){s.outcomes.push({url:s.posts[s.postCursor],status:'failed',reason:'用户跳过无法确认作者的帖子'});s.postCursor++;await this.save();}return;}
  throw Error('当前还在搜索阶段');
 }
}
root.IteaBatch={LIMIT,searchUrl,links,newState,Runner};
})(globalThis);
