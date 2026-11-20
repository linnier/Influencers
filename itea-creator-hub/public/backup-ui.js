(function(root){'use strict';
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(container){
  if(!container||container.querySelector('#backupPanel'))return;
  const box=document.createElement('section');box.id='backupPanel';box.innerHTML='<h4>数据备份 · Google Drive</h4><p role="status">正在读取备份状态…</p>';container.append(box);
  const head=container.querySelector('.flow-head');if(head){const jump=document.createElement('button');jump.type='button';jump.textContent='数据备份';jump.onclick=()=>box.scrollIntoView({behavior:'smooth',block:'start'});head.querySelector('#adminClose')?.before(jump);}
  let timer=null,busy=false,disposed=false,controller=null;
  const observer=new MutationObserver(()=>{if(!box.isConnected){disposed=true;clearTimeout(timer);controller?.abort();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  async function api(path,value){controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);try{const r=await(root.AppPath?.fetch||fetch)(path,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'备份操作失败');return d;}catch(e){if(e.name==='AbortError')throw Error('备份状态读取超时，请重试');throw e;}finally{clearTimeout(timeout);controller=null;}}
  const stamp=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Singapore'}):'尚无记录';
  async function act(fn){if(busy)return;busy=true;clearTimeout(timer);const buttons=[...box.querySelectorAll('button')].map(b=>[b,b.disabled]);for(const [b] of buttons)b.disabled=true;try{await fn();if(!disposed)await load();}catch(e){if(!disposed){const p=box.querySelector('[data-backup-message]');if(p)p.textContent=e.message;}}finally{busy=false;for(const [b,disabled] of buttons)if(b.isConnected)b.disabled=disabled;}}
  function paint(s){
   if(disposed)return;clearTimeout(timer);
   box.innerHTML='<h4>数据备份 · Google Drive</h4><p role="status">'+escape(s.error||(s.connected?'Google Drive 已连接':'尚未连接 Google Drive'))+'</p>'+
    (s.keyFingerprint?'<p>密钥编号：'+escape(s.keyFingerprint)+'。请另存密钥副本；丢失后无法恢复备份。</p>':'<p>先初始化备份密钥并保存离线副本，再连接 Google Drive。</p>')+
    '<p><button data-backup-key '+(s.active?'disabled':'')+'>'+(s.configured?'下载密钥离线副本':'初始化密钥并下载副本')+'</button></p>'+
    '<p><a data-backup-helper href="'+escape(root.AppPath?.url('/api/backup/authorize-helper')||'/api/backup/authorize-helper')+'" download="itea-google-drive-authorize.ps1">下载 Windows 本机授权工具</a></p><p>使用 Google Cloud 的“桌面应用”客户端完成本机授权，然后导入工具生成的连接文件。连接文件含授权凭据，导入成功后请删除本机副本，不要通过聊天发送。</p>'+
    '<details><summary>首次连接步骤</summary><ol><li>初始化并离线保存备份密钥。</li><li>在 <a href="https://console.cloud.google.com/auth/overview/personal" target="_blank" rel="noopener noreferrer">Google Personal mode</a> 中创建“桌面应用”客户端，下载 JSON，并启用该项目的 Google Drive API。</li><li>下载本机授权工具，在命令提示符运行 <code>powershell -NoProfile -ExecutionPolicy Bypass -File &quot;%USERPROFILE%\\Downloads\\itea-google-drive-authorize.ps1&quot;</code>，选择客户端 JSON，完成 Google 授权；连接文件会自动保存到客户端 JSON 所在文件夹，命令窗口会显示路径。</li><li>导入连接文件，先立即备份并检查成功，再开启每天自动备份。</li></ol><p>Google 客户端需配置为 Personal mode 或正式使用状态；Testing 模式授权通常 7 天到期。</p></details>'+
    '<label>连接文件<input data-backup-file type="file" accept=".json,application/json" '+(!s.configured||s.active?'disabled':'')+'></label>'+
    (s.folderURL?'<p><a href="'+escape(s.folderURL)+'" target="_blank" rel="noopener noreferrer">打开 Google Drive 备份文件夹</a></p>':'')+
    '<form data-backup-settings class="formgrid"><label style="display:flex;align-items:center;gap:8px"><input name="enabled" type="checkbox" style="width:auto;min-width:0" '+(s.enabled?'checked':'')+'> 每天自动备份</label><label>备份时间（新加坡时间，整点）<input name="hour" type="number" min="0" max="23" required value="'+escape(s.hour)+'"></label><label>保留最近多少天的成功备份<input name="daily" type="number" min="1" max="365" required value="'+escape(s.daily)+'"></label><label>另保留最近多少个月的代表备份<input name="monthly" type="number" min="1" max="60" required value="'+escape(s.monthly)+'"></label><button '+(!s.connected||s.active?'disabled':'')+'>保存备份设置</button></form>'+
    '<p><button data-backup-start '+(!s.connected||s.active?'disabled':'')+' class="primary">立即备份</button> <button data-backup-refresh>刷新备份状态</button> <button data-backup-disconnect '+(!s.connected||s.active?'disabled':'')+'>断开 Google Drive</button></p>'+
    '<p>备份：'+(s.active?'正在'+(s.active.status==='connecting'?'连接 Google Drive':'备份，后台处理中'):'空闲')+'；最近成功：'+escape(stamp(s.lastSuccess?.completedAt))+'</p><p data-backup-message role="status" aria-live="polite"></p>'+
    (s.history?.length?'<div class="scroll"><table><thead><tr><th>时间（新加坡）</th><th>结果</th><th>详情</th></tr></thead><tbody>'+s.history.map(h=>'<tr><td>'+escape(stamp(h.completedAt||h.startedAt))+'</td><td>'+escape(({success:'成功',failed:'失败',interrupted:'未完成'})[h.status]||h.status)+'</td><td>'+escape(h.message||h.warning||h.verification||'')+(h.bytes?'<small>'+escape((h.bytes/1024).toFixed(1))+' KB</small>':'')+'</td></tr>').join('')+'</tbody></table></div>':'')+
    '<p>备份文件已加密，内含 JSON、CSV 和本地产品图片。过期版本移入 Google Drive 回收站。恢复前需离线校验；不会自动覆盖线上资料。</p>';
   box.querySelector('[data-backup-key]').onclick=()=>void act(async()=>{const value=await api('/api/backup/key-copy',{}),blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='itea-backup-key-'+value.fingerprint+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
   const settings=box.querySelector('[data-backup-settings]');settings.onsubmit=ev=>{ev.preventDefault();const f=settings.elements;void act(()=>api('/api/backup/settings',{enabled:f.enabled.checked,hour:Number(f.hour.value),daily:Number(f.daily.value),monthly:Number(f.monthly.value)}));};
   box.querySelector('[data-backup-file]').onchange=ev=>{const input=ev.target,file=input.files[0];if(!file)return;void act(async()=>{try{if(file.size>16000)throw Error('连接文件过大，请选择授权工具生成的 JSON');let value;try{value=JSON.parse(await file.text());}catch{throw Error('连接文件无法解析');}await api('/api/backup/connect',value);}finally{input.value='';}});};
   box.querySelector('[data-backup-start]').onclick=()=>void act(()=>api('/api/backup/start',{}));
   box.querySelector('[data-backup-disconnect]').onclick=()=>{if(confirm('断开后停止自动备份，已有云端备份仍会保留。是否继续？'))void act(()=>api('/api/backup/disconnect',{}));};
   box.querySelector('[data-backup-refresh]').onclick=()=>void act(async()=>{});
   if(s.active)timer=setTimeout(()=>void load(),5000);
  }
  async function load(){try{const s=await api('/api/backup');if(typeof s.configured!=='boolean'||!Array.isArray(s.history))throw Error('备份状态返回异常，请重试');paint(s);}catch(e){if(disposed)return;box.innerHTML='<h4>数据备份 · Google Drive</h4><p role="alert">'+escape(e.message)+'</p><button data-retry>重新读取备份状态</button>';box.querySelector('[data-retry]').onclick=()=>void load();}}
  void load();
 }
 root.BackupUI={mount};
})(globalThis);
