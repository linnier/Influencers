(function(root){'use strict';
function parse(display){const text=String(display??'').trim().replace(/[\s\u00a0]/g,'');if(/^\d+$/.test(text)||/^\d{1,3}(?:,\d{3})+$/.test(text)){const value=Number(text.replace(/,/g,''));return Number.isSafeInteger(value)?{value,approx:false}:null;}const m=text.match(/^(\d+(?:\.\d+)?)\s*(K|M|B|千|万|萬|亿|億)$/i);if(!m)return null;const unit={k:1000,m:1000000,b:1000000000,'千':1000,'万':10000,'萬':10000,'亿':100000000,'億':100000000}[m[2].toLowerCase()],value=Math.round(Number(m[1])*unit);return Number.isSafeInteger(value)?{value,approx:true}:null;}
function cleanLabel(text){return String(text??'').replace(/(?:\bfollowers?\b|粉丝数?|粉絲數?)/ig,'').replace(/[:：]/g,'').trim();}
root.IteaFollowers={parse,cleanLabel};
})(globalThis);
