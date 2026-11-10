(function(root){'use strict';
const KEY='itea.discovery.read-history.v1',TTL=7*24*60*60*1000;
async function recent(scope){const rows=(await chrome.storage.local.get(KEY))[KEY]||[];return rows.filter(r=>r.scope===scope&&r.at>Date.now()-TTL).map(r=>r.url);}
async function remember(scope,url,status){if(!root.IteaProfileCard.profile(url)||!['collected','skipped'].includes(status))return;await navigator.locks.request(KEY,async()=>{const rows=((await chrome.storage.local.get(KEY))[KEY]||[]).filter(r=>r.at>Date.now()-TTL&&!(r.scope===scope&&r.url===url));rows.push({scope,url,status,at:Date.now()});await chrome.storage.local.set({[KEY]:rows.slice(-3000)});});}
root.IteaHistory={KEY,recent,remember};
})(globalThis);
