'use strict';
const $=id=>document.getElementById(id),KEY='itea.discovery.batch.v1',selected=new Set();
let runner=null,notice='',busy=false,locked=false;
const origins={Instagram:['https://www.instagram.com/*'],TikTok:['https://www.tiktok.com/*']};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const labels={idle:'尚未开始',discovering:'正在寻找达人',resolving:'正在识别帖子作者',collecting:'正在读取资料卡',paused:'任务已暂停',done:'采集完成'};
function render(s){
 document.body.dataset.phase=s.phase;document.title=(labels[s.phase]||'自动发现达人')+' · itea';
 $('phase').textContent=labels[s.phase]||s.phase;$('progress').textContent=s.stage==='discovery'?'搜索 '+s.searchRound+' / 6 轮':s.stage==='authors'?'帖子 '+s.postCursor+' / '+(s.posts||[]).length+' 篇':s.cursor+' / '+s.candidates.length+' 位';
 $('bar').max=s.stage==='discovery'?6:s.stage==='authors'?Math.max(1,(s.posts||[]).length):Math.max(1,s.candidates.length);$('bar').value=s.stage==='discovery'?s.searchRound:s.stage==='authors'?(s.postCursor||0):s.cursor;
 $('status').textContent=notice||s.reason||(s.phase==='resolving'?'正在打开帖子并核对顶部作者 '+(s.posts[s.postCursor]||''):s.phase==='collecting'?'正在读取 '+(s.candidates[s.cursor]||''):'正在平台搜索结果中寻找达人…');
 $('found').textContent=s.candidates.length;$('kept').textContent=s.rows.length;$('total').textContent=s.rows.length;
 for(const [id,type] of [['noEmail','skipped'],['filtered','filtered'],['failed','failed']])$(id).textContent=s.outcomes.filter(x=>x.status===type).length;
 $('start').disabled=busy;$('pause').disabled=!busy||s.phase==='paused';$('resume').disabled=busy||s.phase!=='paused';$('skip').disabled=busy||s.phase!=='paused'||!['collection','authors'].includes(s.stage)||(s.stage==='authors'?s.postCursor>=s.posts.length:s.cursor>=s.candidates.length);$('skip').textContent=s.stage==='authors'?'跳过当前帖子':'跳过当前达人';$('work').disabled=!(s.stage==='discovery'?s.searchTab:s.workTab);
 $('setup').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy);
 const tbody=$('results');tbody.replaceChildren();
 for(const r of s.rows){const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(r.url);check.setAttribute('aria-label','选择 '+r.handle);check.onchange=()=>{check.checked?selected.add(r.url):selected.delete(r.url);render(s)};const td=document.createElement('td');td.append(check);tr.append(td);
  const owner=document.createElement('td');owner.textContent=r.name;const sub=document.createElement('small');sub.textContent=r.platform+' @'+r.handle;owner.append(sub);tr.append(owner);
  for(const v of [r.email,r.fans==null?(r.fansDisplay?r.fansDisplay+'（展示值）':'未获取'):r.fans.toLocaleString('zh-CN')]){const cell=document.createElement('td');cell.textContent=v;tr.append(cell)}
  const source=document.createElement('td'),a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看公开主页 ↗';source.append(a);tr.append(source);tbody.append(tr);
 }
 if(!s.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='有公开邮箱的达人会出现在这里。';tr.append(td);tbody.append(tr)}
 const count=s.rows.filter(r=>selected.has(r.url)).length;$('copy').disabled=$('download').disabled=!count;$('all').checked=!!s.rows.length&&count===s.rows.length;$('all').indeterminate=count>0&&count<s.rows.length;
 $('log').replaceChildren();for(const row of s.outcomes){const li=document.createElement('li');li.textContent=row.url+' · '+row.reason;$('log').append(li)}
}
async function save(s){await chrome.storage.local.set({[KEY]:s});render(s)}
async function checkCancelled(){if(runner?.cancelled)throw Error('已暂停')}
async function ready(id){for(let n=0;n<60;n++){await checkCancelled();const t=await chrome.tabs.get(id);if(t.status==='complete')return;await sleep(500)}throw Error('页面加载超时，检查网络或平台限制后可继续')}
async function managedTab(id,url){
 if(id){let tab;try{tab=await chrome.tabs.get(id)}catch{}if(tab){if(tab.url!==url)await chrome.tabs.update(id,{url,active:true});await ready(id);return id}}
 const tab=await chrome.tabs.create({url,active:true});await ready(tab.id);return tab.id;
}
async function inject(id){await chrome.scripting.executeScript({target:{tabId:id},files:['profile-card.js','scan-page.js']})}
async function readProfile(id){let last=null,stable=0;
 for(let n=0;n<20;n++){await checkCancelled();await inject(id);const response=await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const reason=IteaScan.gate(document);return reason?{status:'blocked',reason}:IteaProfileCard.read(document)}});const data=response[0]?.result;
  if(data?.status==='blocked')return data;if(data?.status==='collected')return data;
  if(data?.status==='skipped'){stable++;if(stable>=3)return data}else stable=0;
  last=data;await sleep(1000);
 }return last?.status==='error'?last:{status:'error',reason:'资料卡未能稳定加载，不能判断为无邮箱。请检查工作标签页。'};
}
const io={save,
 searchTab:async(id,url)=>{if(id){try{await chrome.tabs.get(id);return id}catch{}}return managedTab(null,url)},
 profileTab:managedTab,
 scan:async id=>{let last;for(let n=0;n<15;n++){await checkCancelled();await inject(id);const r=await chrome.scripting.executeScript({target:{tabId:id},func:p=>IteaScan.scan(document,p),args:[runner.state.config.platform]});last=r[0]?.result;if(last?.blocked||last?.urls?.length||last?.posts?.length)return last;await sleep(1000)}return last||{error:true,reason:'无法读取搜索页面'};},
 scroll:async id=>{await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const main=document.querySelector('main,[role="main"]');if(main){main.scrollTop+=Math.max(600,innerHeight*.8);for(const node of main.querySelectorAll("div,section")){if(node.clientHeight>200&&node.scrollHeight>node.clientHeight+50&&/auto|scroll/.test(getComputedStyle(node).overflowY)){node.scrollTop+=Math.max(600,node.clientHeight*.8);break}}}window.scrollBy(0,Math.max(600,innerHeight*.8))}});await sleep(2000)},
 author:async(id,url)=>{let last;for(let n=0;n<20;n++){await checkCancelled();await inject(id);const r=await chrome.scripting.executeScript({target:{tabId:id},func:expected=>IteaScan.author(document,expected),args:[url]});last=r[0]?.result;if(last?.status==='blocked'||last?.status==='found')return last;await sleep(1000)}return last||{status:'error',reason:'帖子作者读取失败'};},
 read:readProfile,delay:async()=>{for(let n=0;n<4;n++){await checkCancelled();await sleep(1000)}}
};
async function execute(newTask=false){if(busy||!runner)return;busy=true;notice='';render(runner.state);
 try{await navigator.locks.request(KEY,{ifAvailable:true},async lock=>{if(!lock){notice='另一个任务页正在采集，请先回到该页面暂停任务。';return}locked=true;try{if(!newTask){const latest=(await chrome.storage.local.get(KEY))[KEY];if(latest?.version===1)runner=new IteaBatch.Runner(latest,io)}await runner.run()}finally{locked=false}})}catch(e){notice=String(e.message||e)}finally{busy=false;render(runner.state)}}
function mode(){const value=$('setup').elements.mode.value;$('searchFields').hidden=value!=='search';$('linkFields').hidden=value!=='links';$('start').textContent=value==='search'?'开始自动发现':'开始批量读取'}
document.querySelectorAll('[name=mode]').forEach(el=>el.onchange=mode);
$('setup').onsubmit=async e=>{e.preventDefault();if(busy)return;
 try{
  const method=$('setup').elements.mode.value,parsed=IteaBatch.links($('urls').value),keyword=$('keyword').value.trim();
  if(method==='search'&&!keyword)throw Error('请先填写搜索关键词，例如 Singapore food blogger');
  if(method==='links'&&(parsed.invalid.length||!parsed.valid.length||parsed.truncated))throw Error('请填写最多 30 个完整 Instagram / TikTok 主页链接；不支持帖子链接。');
  const num=id=>{const v=$(id).value.trim();if(!v)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('粉丝数请输入非负整数');return n};const minFans=num('minFans'),maxFans=num('maxFans');if(minFans!=null&&maxFans!=null&&minFans>maxFans)throw Error('最低粉丝数不能大于最高粉丝数');
  if(runner?.state.rows.length&&!confirm('开始新任务会替换本机当前任务。请先复制或下载需要保留的结果。是否继续？'))return;
  const platforms=method==='search'?[$('platform').value]:[...new Set(parsed.valid.map(u=>IteaProfileCard.profile(u).platform))];
  // Called directly from this user click; grants only the selected platform(s).
  const allowed=await chrome.permissions.request({origins:platforms.flatMap(p=>origins[p])});if(!allowed)throw Error('未授权所选平台，任务尚未开始。');
  const state=IteaBatch.newState({mode:method,keyword,platform:$('platform').value,limit:Number($('limit').value),minFans,maxFans,urls:method==='links'?parsed.valid:[]});runner=new IteaBatch.Runner(state,io);selected.clear();await execute(true);
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
(async()=>{const stored=(await chrome.storage.local.get(KEY))[KEY];const state=stored?.version===1?stored:IteaBatch.newState({mode:'search',platform:'TikTok',limit:10});if(['discovering','resolving','collecting'].includes(state.phase)){state.phase='paused';state.reason='任务页已重新打开。点击“继续任务”从上次进度继续。'}runner=new IteaBatch.Runner(state,io);for(const r of state.rows)selected.add(r.url);if(state.config.keyword)$('keyword').value=state.config.keyword;if(state.config.platform)$('platform').value=state.config.platform;$('limit').value=String(state.config.limit||10);$('minFans').value=state.config.minFans??'';$('maxFans').value=state.config.maxFans??'';$('urls').value=(state.config.urls||[]).join('\n');const radio=document.querySelector('[name=mode][value="'+(state.config.mode==='links'?'links':'search')+'"]');if(radio)radio.checked=true;mode();render(state)})().catch(e=>{$('status').textContent='读取本机任务失败：'+e.message});
