(function(root){'use strict';
function targets(state){const search=state.stage==='discovery'||state.searchStalled;return [...new Set((search?[state.searchTab,state.workTab]:[state.workTab,state.searchTab]).filter(id=>Number.isInteger(id)&&id>=0))];}
async function focus(id){if(!Number.isInteger(id)||id<0)throw Error('工作标签页尚未创建，请稍等页面打开后重试。');const tab=await chrome.tabs.get(id);await chrome.tabs.update(id,{active:true});if(!Number.isInteger(tab.windowId))throw Error('无法定位工作标签页所在窗口，请手动打开平台页面。');try{const window=await chrome.windows.get(tab.windowId);await chrome.windows.update(tab.windowId,{focused:true,...(window.state==='minimized'?{state:'normal'}:{})});}catch{throw Error('工作标签页已选中，但浏览器窗口未能切到前面，请从任务栏打开该浏览器窗口。');}return tab;}
async function show(state){const ids=targets(state);if(!ids.length)throw Error('工作标签页尚未创建，请稍等页面打开后重试。');for(const id of ids){try{await chrome.tabs.get(id);}catch{continue;}await focus(id);return {id,fallback:id!==ids[0]};}throw Error('搜索页和工作标签页均已关闭，请先暂停，再点“继续任务”重新打开。');}
root.IteaWorkTabs={targets,focus,show};
})(globalThis);
