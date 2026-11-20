(function(root){'use strict';
let running=false;const $=id=>document.getElementById(id);
const message=text=>{const el=$('syncActionStatus');if(el)el.textContent=text;};
function describe(r){return [r.error,r.reason,'本次已保存 '+(r.saved||0)+' 位，剩余待保存 '+(r.pending||0)+' 位。'].filter(Boolean).join(' ');}
function pending(rows,config){const n=config?.enabled?rows.filter(r=>!r.savedAt&&r.actorId&&r.actorId!==config.actorId).length:0;const b=$('reviewPending');if(b){b.hidden=!n;b.textContent='核对旧账号线索（'+n+'）';}}
async function run({buttonId,operation,refresh=async()=>{}}){
 if(running)return;running=true;const buttons=['connect','retrySync','retry','disconnect','reviewPending'].map($).filter(Boolean),before=buttons.map(b=>[b,b.disabled,b.textContent]);for(const b of buttons)b.disabled=true;const active=$(buttonId);if(active)active.textContent='处理中…';message('正在连接系统并处理待保存线索，请稍候…');
 try{const value=await operation(),r=value?.result||value;if(r)message(describe(r));await refresh();pending(await IteaSync.archive(),await IteaSync.connection());return value;}
 catch(e){message(e.message||'保存失败，线索仍保存在本机。');}
 finally{running=false;for(const [b,disabled,text]of before){b.disabled=disabled;if(b.id!=='reviewPending')b.textContent=text;}}
}
function review(refresh){return run({buttonId:'reviewPending',refresh,operation:async()=>{
 const proof=await IteaSync.transferPreview();$('syncRecovery')?.remove();const dialog=document.createElement('dialog');dialog.id='syncRecovery';dialog.setAttribute('aria-label','核对旧账号线索');
 const title=document.createElement('h2');title.textContent='将旧账号待保存线索交给 '+proof.username;dialog.append(title);
 const info=document.createElement('p');info.textContent='可转交 '+proof.count+' 条；同主页已存在或重复的 '+proof.skipped+' 条保留在本机，不覆盖现有资料。请先暂停采集再核对。只转交待保存线索，不改已保存记录。';dialog.append(info);
 const list=document.createElement('ul');list.className='syncRecoveryList';for(const item of proof.items){const li=document.createElement('li');li.textContent=(item.name||item.handle)+' · '+item.platform+' @'+item.handle;list.append(li);}dialog.append(list);
 if(proof.skipped){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看保留待核对的 '+proof.skipped+' 条';details.append(summary);const names=document.createElement('p');names.textContent=proof.skippedItems.map(p=>p.name||p.handle).join('、');details.append(names);dialog.append(details);}
 const label=document.createElement('label');label.className='syncRecoveryCheck';const checkbox=document.createElement('input');checkbox.type='checkbox';label.append(checkbox,document.createTextNode('我确认将以上 '+proof.count+' 条线索保存到 '+proof.username+' 账号。'));dialog.append(label);
 const error=document.createElement('p');error.setAttribute('role','alert');dialog.append(error);const actions=document.createElement('div');actions.className='actions';const confirm=document.createElement('button'),cancel=document.createElement('button');confirm.type=cancel.type='button';confirm.textContent='确认转交并重试保存';confirm.className='primary';confirm.disabled=true;cancel.textContent='取消';checkbox.onchange=()=>confirm.disabled=!checkbox.checked||!proof.count;cancel.onclick=()=>{dialog.close();dialog.remove();};actions.append(confirm,cancel);dialog.append(actions);
 confirm.onclick=()=>{if(!checkbox.checked||!proof.count)return;confirm.disabled=cancel.disabled=true;void run({buttonId:'reviewPending',refresh,operation:async()=>{try{const moved=await IteaSync.transferPending({...proof,confirm:true});dialog.close();dialog.remove();const r=await IteaSync.flush();return {...r,reason:[r.reason,'已确认转交 '+moved.moved+' 条；同主页 '+moved.skipped+' 条仍保留本机供核对。'].filter(Boolean).join(' ')};}catch(e){error.textContent=e.message;throw e;}finally{if(dialog.isConnected){confirm.disabled=!checkbox.checked;cancel.disabled=false;}}}});};document.body.append(dialog);dialog.showModal();return null;
 }});}
root.IteaSyncUI={run,pending,review};
})(globalThis);
