(function(root){'use strict';
// Project membership is supplied by the server. Creator ownership stays separate.
const names=p=>[...new Set([p?.owner,...(Array.isArray(p?.coOwners)?p.coOwners:[])].filter(x=>typeof x==='string'&&x.trim()))];
root.ProjectOwners={names,has:(p,owner)=>!!owner&&names(p).includes(owner),label:p=>names(p).join('、')};
})(globalThis);
