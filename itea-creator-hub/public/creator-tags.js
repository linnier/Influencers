(function(root){'use strict';
const presets=['内容质量差','配合度低','发布拖延','数据待核实','内容优质','配合积极'];
const caution=new Set(presets.slice(0,4));
function split(value){const seen=new Set();return String(value??'').split(/[、,，;；\n]+/).map(x=>x.trim()).filter(x=>{const key=x.toLowerCase();if(!x||seen.has(key))return false;seen.add(key);return true;});}
function join(items){return split(items.join('、')).join('、');}
function toggle(value,label){const items=split(value),key=label.toLowerCase(),exists=items.some(x=>x.toLowerCase()===key);return join(exists?items.filter(x=>x.toLowerCase()!==key):[...items,label]);}
function html(value,escape){const items=split(value);return items.length?'<div class="creator-tag-badges" aria-label="达人标签">'+items.map(x=>'<span class="creator-tag '+(caution.has(x)?'caution':presets.slice(4).includes(x)?'positive':'')+'">'+escape(x)+'</span>').join('')+'</div>':'';}
root.CreatorTags={presets,split,join,toggle,html};
})(globalThis);
