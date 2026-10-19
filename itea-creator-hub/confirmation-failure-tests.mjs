import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
for(const succeeded of [0,1]){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',url:'https://creator.test'}),w=dom.window;let calls=0;
 Object.assign(w,{people:[],accounts:[],esc:v=>String(v),num:v=>String(v),notify:()=>{},table:()=>'<table></table>',setInterval:()=>0});
 w.fetch=async()=>{if(calls++<succeeded)return {ok:true,json:async()=>({status:'已确认合作'})};throw new TypeError('Failed to fetch')};
 w.eval(readFileSync(new URL('./public/lifecycle-ui.js',import.meta.url),'utf8'));
 const apps=Array.from({length:3},(_,i)=>({id:'A'+i,name:'Creator '+i,email:'c'+i+'@example.com',accounts:[],reward:{amount:0,vouchers:10}}));
 w.LifecycleUI.batchApprove({id:'P',currency:'SGD'},apps);w.document.querySelector('#batchChecked').checked=true;
 const button=w.document.querySelector('[data-confirm]');button.click();await new Promise(r=>setTimeout(r,20));
 assert.equal(calls,succeeded+1);assert(button.disabled);assert(!w.document.querySelector('[data-close]').disabled);
 const msg=w.document.querySelector('#lifeError').textContent;assert(msg.includes('结果未知'));assert(msg.includes('第 '+(succeeded+1)+' 位'));assert(msg.includes('已收到 '+succeeded+' 位'));assert(!msg.includes('已确认 0 位'));
 button.click();assert.equal(calls,succeeded+1);w.document.querySelector('[data-close]').click();assert(!w.document.querySelector('#lifeModal'));dom.window.close();
}
console.log('PASS lost confirmation responses: distinguish acknowledged/unknown/not-started, stop batch, disable repeat POST and allow close for fresh reconciliation.');
