'use strict';
const $=id=>document.getElementById(id),KEY='itea.discovery.batch.v1',selected=new Set();
let runner=null,notice='',busy=false,locked=false,lastSync=0,syncFlight=null,tableStamp='';
const origins={Instagram:['https://www.instagram.com/*'],TikTok:['https://www.tiktok.com/*']};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const labels={idle:'尚未开始',discovering:'正在寻找达人',resolving:'正在识别帖子作者',collecting:'正在读取资料卡',paused:'任务已暂停',done:'采集完成'};
function render(s){
 document.body.dataset.phase=s.phase;document.title=(labels[s.phase]||'自动发现达人')+' · itea';
 $('phase').textContent=labels[s.phase]||s.phase;$('progress').textContent=s.stage==='discovery'?'搜索 '+s.searchRound+' / '+s.config.maxRounds+' 轮':s.stage==='authors'&&s.activeItem!=='profile'?'帖子 '+s.postCursor+' / '+(s.posts||[]).length+' 篇':s.cursor+' / '+s.candidates.length+' 位';
 $('bar').max=s.stage==='discovery'?s.config.maxRounds:s.stage==='authors'&&s.activeItem!=='profile'?Math.max(1,(s.posts||[]).length):Math.max(1,s.candidates.length);$('bar').value=s.stage==='discovery'?s.searchRound:s.stage==='authors'&&s.activeItem!=='profile'?(s.postCursor||0):s.cursor;
 $('status').textContent=notice||s.reason||(s.phase==='resolving'?'正在打开帖子并核对顶部作者 '+(s.posts[s.postCursor]||''):s.phase==='collecting'?'正在读取 '+(s.candidates[s.cursor]||''):'正在平台搜索结果中寻找达人…');
 $('repairFans').disabled=busy||!s.rows.some(r=>r.fans==null);$('diagnostic').disabled=!s.diagnostic;$('cached').textContent=(s.cachedUrls||[]).length;$('found').textContent=s.candidates.length;$('kept').textContent=s.rows.length;$('total').textContent=s.rows.length;
 for(const [id,type] of [['noEmail','skipped'],['filtered','filtered'],['failed','failed']])$(id).textContent=s.outcomes.filter(x=>x.status===type).length;
 $('start').disabled=busy;$('pause').disabled=!busy||s.phase==='paused';$('resume').disabled=busy||s.phase!=='paused';$('skip').disabled=busy||s.phase!=='paused'||!['collection','authors'].includes(s.stage)||(s.stage==='authors'&&s.activeItem!=='profile'?s.postCursor>=s.posts.length:s.cursor>=s.candidates.length);$('skip').textContent=s.stage==='authors'&&s.activeItem!=='profile'?'跳过当前帖子':'跳过当前达人';$('work').disabled=!(s.stage==='discovery'?s.searchTab:s.workTab);
 $('setup').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy);
 const stamp=JSON.stringify(s.rows.map(r=>[r.url,r.email,r.name,r.fans,r.fansDisplay,r.rangeStatus,r.emailNeedsReview,selected.has(r.url)]));if(stamp!==tableStamp){tableStamp=stamp;const tbody=$('results');tbody.replaceChildren();
 for(const r of s.rows){const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(r.url);check.setAttribute('aria-label','选择 '+r.handle);check.onchange=()=>{check.checked?selected.add(r.url):selected.delete(r.url);render(s)};const td=document.createElement('td');td.append(check);tr.append(td);
  const owner=document.createElement('td');owner.textContent=r.name;const sub=document.createElement('small');sub.textContent=r.platform+' @'+r.handle+(r.emailNeedsReview?' · 邮箱待核对':'')+(r.rangeStatus==='outside'?' · 范围外，仍保留':r.rangeStatus==='unknown'?' · 粉丝待核实':'');owner.append(sub);tr.append(owner);
  for(const v of [r.email,r.fans==null?(r.fansApprox!=null?'约 '+r.fansApprox.toLocaleString('zh-CN')+'（'+r.fansDisplay+'）':r.fansDisplay?r.fansDisplay+'（展示值）':'未获取'):String(r.fans)]){const cell=document.createElement('td');cell.textContent=v;tr.append(cell)}
  const source=document.createElement('td'),a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看公开主页 ↗';source.append(a);tr.append(source);tbody.append(tr);
 }
 if(!s.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='有公开邮箱的达人会出现在这里。';tr.append(td);tbody.append(tr)}}
 const count=s.rows.filter(r=>selected.has(r.url)).length;$('copy').disabled=$('download').disabled=!count;$('all').checked=!!s.rows.length&&count===s.rows.length;$('all').indeterminate=count>0&&count<s.rows.length;
 $('log').replaceChildren();for(const row of s.outcomes.slice(-80)){const li=document.createElement('li');li.textContent=row.url+' · '+row.reason;$('log').append(li)}
}
async function save(s){await chrome.storage.local.set({[KEY]:s});render(s)}
async function checkCancelled(){if(runner?.cancelled)throw Error('已暂停')}
function sameDocument(actual,expected){try{const a=IteaProfileCard.profile(actual),b=IteaProfileCard.profile(expected);if(a&&b)return a.url===b.url;const x=new URL(actual),y=new URL(expected);return x.origin===y.origin&&x.pathname.replace(/\/$/,'')===y.pathname.replace(/\/$/,'')&&x.searchParams.get('q')===y.searchParams.get('q');}catch{return false}}
async function ready(id,expected){for(let n=0;n<60;n++){await checkCancelled();const t=await chrome.tabs.get(id);if(t.status==='complete'&&(!t.pendingUrl||t.pendingUrl===t.url)){if(sameDocument(t.url,expected))return;try{const actual=new URL(t.url);if(/\/(login|accounts\/login|challenge|checkpoint|auth)(?:\/|$)/.test(actual.pathname))return;}catch{}}
 try{const r=await chrome.scripting.executeScript({target:{tabId:id},func:()=>({href:location.href,state:document.readyState})}),value=r[0]?.result;if(value?.href&&sameDocument(value.href,expected)&&value.state!=='loading')return;}catch{}
 await sleep(500)}throw Error('页面加载超时，检查网络或平台限制后可继续')}
async function managedTab(id,url){
 if(id){let tab;try{tab=await chrome.tabs.get(id)}catch{}if(tab){if(tab.url!==url)await chrome.tabs.update(id,{url,active:false});await ready(id,url);return id}}
 const tab=await chrome.tabs.create({url,active:false});await ready(tab.id,url);return tab.id;
}
async function inject(id){await chrome.scripting.executeScript({target:{tabId:id},files:['follower-count.js','profile-card.js','scan-page.js']})}
async function readProfile(id){let last=null,stable=0,missingFans=0;
 for(let n=0;n<20;n++){await checkCancelled();await inject(id);const response=await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const reason=IteaScan.gate(document);return reason?{status:'blocked',reason}:IteaProfileCard.read(document)}});const data=response[0]?.result;
  if(data?.status==='blocked')return data;if(data?.status==='collected'){if(data.record.fans!=null)return data;missingFans++;if(missingFans>=5)return data;last=data;await sleep(1000);continue;}
  if(data?.status==='skipped'){stable++;if(stable>=3&&(!runner?.state.config.repairFans||data.fans!=null||stable>=5))return data}else stable=0;
  last=data;await sleep(1000);
 }return last?.status==='error'?last:{status:'error',reason:'资料卡未能稳定加载，不能判断为无邮箱。请检查工作标签页。'};
}
async function flushBuffered(){if(syncFlight)return syncFlight;syncFlight=(async()=>{try{const result=await IteaSync.flush();lastSync=Date.now();await syncStatus();if(result.error){notice='采集继续，结果已保存在本机；系统待同步：'+result.error;if(runner)render(runner.state)}return result;}finally{syncFlight=null}})();return syncFlight;}
const io={save,onRecord:async record=>{const result=await IteaSync.keep(record,{sync:false});await syncStatus();if(result.pending>=10||Date.now()-lastSync>=10000)void flushBuffered().catch(()=>{});},remember:async(url,status)=>IteaHistory.remember(runner.state.config.historyScope||'local',url,status),
 searchTab:async(id,url)=>{if(id){try{const tab=await chrome.tabs.get(id),current=new URL(tab.url),wanted=new URL(url);if(current.origin===wanted.origin&&current.searchParams.get('q')===wanted.searchParams.get('q')&&current.pathname.includes('/search'))return id;}catch{}}return managedTab(id,url)},
 profileTab:managedTab,
 scan:async id=>{let last;for(let n=0;n<15;n++){await checkCancelled();await inject(id);const r=await chrome.scripting.executeScript({target:{tabId:id},func:input=>IteaScan.scan(document,input.platform,input.seen),args:[{platform:runner.state.config.platform,seen:{urls:runner.state.observedProfiles,posts:runner.state.posts}}]});last=r[0]?.result;if(last?.blocked||last?.urls?.length||last?.posts?.length||(last?.ready&&runner.state.searchRound>0))return last;await sleep(700)}return last||{error:true,reason:'无法读取搜索页面'};},
 scroll:async id=>{await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const main=document.querySelector('main,[role="main"]');if(main){main.scrollTop+=Math.max(600,innerHeight*.8);for(const node of main.querySelectorAll("div,section")){if(node.clientHeight>200&&node.scrollHeight>node.clientHeight+50&&/auto|scroll/.test(getComputedStyle(node).overflowY)){node.scrollTop+=Math.max(600,node.clientHeight*.8);break}}}window.scrollBy(0,Math.max(600,innerHeight*.8))}});await sleep(900)},
 author:async(id,url)=>{let last;for(let n=0;n<20;n++){await checkCancelled();await inject(id);const r=await chrome.scripting.executeScript({target:{tabId:id},func:expected=>IteaScan.author(document,expected),args:[url]});last=r[0]?.result;if(last?.status==='blocked'||last?.status==='found')return last;await sleep(1000)}return last||{status:'error',reason:'帖子作者读取失败'};},
 read:async id=>{const data=await readProfile(id),previous=runner?.state.config.repairFans?runner.state.rows.find(r=>r.url===runner.state.candidates[runner.state.cursor]):null;if(previous&&data.status==='skipped'&&data.url===previous.url){if(data.fans!=null&&IteaProfileCard.emails(previous.cardText||'').some(email=>email.toLowerCase()===previous.email.toLowerCase()))return {status:'collected',record:{...previous,fans:data.fans,fansApprox:data.fansApprox,fansDisplay:data.fansDisplay,metricUpdatedAt:new Date().toISOString()}};if(!IteaProfileCard.emails(previous.cardText||'').some(email=>email.toLowerCase()===previous.email.toLowerCase())){previous.emailNeedsReview=true;if(data.fans!=null)Object.assign(previous,{fans:data.fans,fansApprox:data.fansApprox,fansDisplay:data.fansDisplay});}}return data;},delay:async()=>{const end=Date.now()+(runner?.state.config.paceMs||800);while(Date.now()<end){await checkCancelled();await sleep(Math.min(200,end-Date.now()))}}
};
async function execute(newTask=false){if(busy||!runner)return;busy=true;notice='';render(runner.state);
 try{await navigator.locks.request(KEY,{ifAvailable:true},async lock=>{if(!lock){notice='另一个任务页正在采集，请先回到该页面暂停任务。';return}locked=true;try{if(!newTask){const latest=(await chrome.storage.local.get(KEY))[KEY];if(latest?.version===1)runner=new IteaBatch.Runner(latest,io)}await runner.run()}finally{locked=false}})}catch(e){notice=String(e.message||e)}finally{busy=false;render(runner.state);void flushBuffered().then(result=>{if(result.pending&&!result.error&&!result.reason)return flushBuffered()}).catch(()=>{})}}
function mode(){const value=$('setup').elements.mode.value;$('searchFields').hidden=value!=='search';$('linkFields').hidden=value!=='links';$('start').textContent=value==='search'?'开始自动发现':'开始批量读取'}
document.querySelectorAll('[name=mode]').forEach(el=>el.onchange=mode);
$('setup').onsubmit=async e=>{e.preventDefault();if(busy)return;
 try{
  const method=$('setup').elements.mode.value,parsed=IteaBatch.links($('urls').value),keyword=$('keyword').value.trim();
  if(method==='search'&&!keyword)throw Error('请先填写搜索关键词，例如 Singapore food blogger');
  if(method==='links'&&(parsed.invalid.length||!parsed.valid.length||parsed.truncated))throw Error('请填写最多 300 个完整 Instagram / TikTok 主页链接；不支持帖子链接。');
  const num=id=>{const v=$(id).value.trim();if(!v)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('粉丝数请输入非负整数');return n};const minFans=num('minFans'),maxFans=num('maxFans');if(minFans!=null&&maxFans!=null&&minFans>maxFans)throw Error('最低粉丝数不能大于最高粉丝数');
  if(runner?.state.rows.length&&!confirm('开始新任务会替换本机当前任务。请先复制或下载需要保留的结果。是否继续？'))return;
  const platforms=method==='search'?[$('platform').value]:[...new Set(parsed.valid.map(u=>IteaProfileCard.profile(u).platform))];
  // Called directly from this user click; grants only the selected platform(s).
  const allowed=await chrome.permissions.request({origins:platforms.flatMap(p=>origins[p])});if(!allowed)throw Error('未授权所选平台，任务尚未开始。');
  const connection=await IteaSync.connection(),scope=connection?.actorId||'local',known=await IteaHistory.recent(scope),archive=await IteaSync.archive();for(const item of archive)if((item.actorId||'local')===scope&&Date.parse(item.updatedAt||item.record.capturedAt)>Date.now()-7*86400000)known.push(item.record.url);const state=IteaBatch.newState({mode:method,keyword,platform:$('platform').value,limit:Number($('limit').value),paceMs:Number($('pace').value),skipKnown:$('skipKnown').checked,historyScope:scope,knownUrls:[...new Set(known)],minFans,maxFans,urls:method==='links'?parsed.valid:[]});state.searchTab=runner?.state.searchTab||null;state.workTab=runner?.state.workTab||null;runner=new IteaBatch.Runner(state,io);selected.clear();await execute(true);
 }catch(e){notice=String(e.message||e);$('status').textContent=notice}
};
$('pause').onclick=()=>{if(runner)void runner.pause('你已暂停任务。继续时会重试当前页面，不会重复保存已完成达人。')};
$('resume').onclick=()=>void execute();
$('skip').onclick=async()=>{try{await runner.skip();await execute()}catch(e){$('status').textContent=e.message}};
$('work').onclick=async()=>{try{const s=runner.state,id=s.stage==='discovery'?s.searchTab:s.workTab;await chrome.tabs.update(id,{active:true})}catch{$('status').textContent='工作标签页已关闭，请继续任务重新打开。'}};
$('all').onchange=()=>{for(const r of runner?.state.rows||[])$('all').checked?selected.add(r.url):selected.delete(r.url);render(runner.state)};
function chosen(){return (runner?.state.rows||[]).filter(r=>selected.has(r.url))}
$('copy').onclick=async()=>{const text=JSON.stringify(chosen(),null,2);try{await navigator.clipboard.writeText(text);notice='已复制所选结果。打开系统“达人发现 → 粘贴资料卡结果”，预览保存后再确认导入达人库。'}catch{$('copyFallback').hidden=false;$('copyFallback').open=true;$('json').value=text;$('json').select();notice='自动复制未成功，请手动复制下方已选中的 JSON。'}render(runner.state)};
$('download').onclick=()=>{const blob=new Blob([JSON.stringify(chosen(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='itea-creator-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('system').onclick=()=>void chrome.tabs.create({url:'https://47.86.198.65/creators/'});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY]&&!locked&&!busy){const s=changes[KEY].newValue;if(s)render(s)}});
(async()=>{const stored=(await chrome.storage.local.get(KEY))[KEY];const state=stored?.version===1?stored:IteaBatch.newState({mode:'search',platform:'TikTok',limit:100});if(['discovering','resolving','collecting'].includes(state.phase)){state.phase='paused';state.reason='任务页已重新打开。点击“继续任务”从上次进度继续。'}runner=new IteaBatch.Runner(state,io);for(const r of state.rows)selected.add(r.url);if(state.config.keyword)$('keyword').value=state.config.keyword;if(state.config.platform)$('platform').value=state.config.platform;$('limit').value=String(state.config.limit||100);$('pace').value=String(state.config.paceMs||800);$('skipKnown').checked=state.config.repairFans?true:state.config.skipKnown!==false;$('minFans').value=state.config.minFans??'';$('maxFans').value=state.config.maxFans??'';$('urls').value=(state.config.urls||[]).join('\n');const radio=document.querySelector('[name=mode][value="'+(state.config.mode==='links'?'links':'search')+'"]');if(radio)radio.checked=true;mode();render(state)})().catch(e=>{$('status').textContent='读取本机任务失败：'+e.message});

$('diagnostic').onclick=async()=>{const value=runner?.state.diagnostic;if(!value)return;const text=JSON.stringify(value,null,2);try{await navigator.clipboard.writeText(text);notice='页面布局诊断已复制，可粘贴反馈。只包含公开账号、帖子网址和布局尺寸，不含 Cookie、密码或私信。'}catch{$('copyFallback').hidden=false;$('copyFallback').open=true;$('json').value=text;$('json').select();notice='请手动复制下方已选中的页面诊断。'}render(runner.state)};

async function syncStatus(){const [config,rows]=await Promise.all([IteaSync.connection(),IteaSync.archive()]);$('syncStatus').textContent=(config?.enabled?'已连接 '+config.username+' · ':'未连接系统 · ')+'本机 '+rows.length+' 位，系统已保存 '+rows.filter(r=>r.savedAt).length+' 位，待同步 '+rows.filter(r=>!r.savedAt).length+' 位。';const details=$('archiveRows').closest('details');if(details&&!details.open)return;$('archiveRows').replaceChildren();for(const item of rows.slice().reverse()){const tr=document.createElement('tr');for(const value of [item.record.name,item.record.email,item.record.fans??(item.record.fansDisplay?'约 '+item.record.fansDisplay:'未获取'),item.savedAt?'已保存到系统':item.error||'已存本机，待同步']){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}$('archiveRows').append(tr)}}
$('connect').onclick=async()=>{try{const result=await IteaSync.connect();notice=result.result.error||'已连接，今后读到邮箱自动保存到系统达人发现。';await syncStatus();render(runner.state)}catch(e){$('syncStatus').textContent=e.message}};
$('retrySync').onclick=async()=>{try{const r=await IteaSync.flush();await syncStatus();$('status').textContent=r.error||r.reason||('已同步 '+r.saved+' 位，待同步 '+r.pending+' 位。')}catch(e){$('syncStatus').textContent=e.message}};
$('disconnect').onclick=async()=>{await IteaSync.disconnect();await syncStatus()};
$('backup').onclick=async()=>{const rows=await IteaSync.archive(),url=URL.createObjectURL(new Blob([JSON.stringify(rows.map(r=>r.record),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='itea-local-leads.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
void syncStatus();

chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes[IteaSync.ARCHIVE]||changes[IteaSync.CONNECTION]))void syncStatus()});

$('repairFans').onclick=async()=>{if(busy||!runner)return;try{const old=runner.state,targets=old.rows.filter(r=>r.fans==null).slice(0,300);if(!targets.length)return;const platforms=[...new Set(targets.map(r=>r.platform))],allowed=await chrome.permissions.request({origins:platforms.flatMap(p=>origins[p])});if(!allowed)throw Error('未授权主页读取，原结果已保留。');const state=IteaBatch.newState({...old.config,mode:'links',repairFans:true,skipKnown:false,urls:targets.map(r=>r.url)});state.rows=JSON.parse(JSON.stringify(old.rows));state.workTab=old.workTab;runner=new IteaBatch.Runner(state,io);await execute(true);}catch(e){$('status').textContent=e.message}};

setInterval(()=>{if(busy)void flushBuffered().catch(()=>{})},10000);

$('archiveRows').closest('details').addEventListener('toggle',event=>{if(event.target.open)void syncStatus()});
