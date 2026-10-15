import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createLifecycle} from './lifecycle.mjs';
const key='unit-test-only-key',base='https://creator.test';let time=Date.now();const realNow=Date.now;Date.now=()=>time;
const state={people:[{id:'p1',name:'Alice',itea:'alice',email:'alice@example.com',contact:'WeChat Alice',region:'SG',owner:'INTERNAL OWNER',notes:'PRIVATE NOTES'},{id:'p2',name:'Bob',itea:'bob',email:'bob@example.com',contact:'WhatsApp Bob'}],accounts:[{id:'a1',person:'p1',platform:'Instagram',handle:'alice',url:'https://www.instagram.com/alice/',fans:0},{id:'a2',person:'p1',platform:'TikTok',handle:'alice',url:'',fans:null},{id:'b1',person:'p2',platform:'TikTok',handle:'bob',url:'https://www.tiktok.com/@bob',fans:100}],collabs:[],posts:[],projects:[]};let writes=0,sends=0,failSend=false;const drafts=new Map(),rows=[{id:'FORM',kind:'intake-form',title:'Join',enabled:true},{id:'FORM2',kind:'intake-form',title:'Join2',enabled:true}];const store={rows:async()=>structuredClone(rows),put:async()=>{writes++;throw Error('Autofill must not write to the workflow or library')},lock:async fn=>fn()};const mail={access:async()=>{},draft:async d=>{drafts.set(d.id,d);return d.id;},send:async id=>{sends++;if(failSend)throw Error('Unknown send');return 'mail-id';}};
const create=()=>createLifecycle({store,mail,getState:async()=>({state:structuredClone(state)}),saveState:async()=>{writes++;throw Error('No writes')},validate:()=>{},key,baseURL:base});let life=create();const token=f=>f+'.'+createHmac('sha256',key).update('lifecycle:'+f).digest('base64url'),path=(action,form='FORM')=>'/api/creator/entry/'+token(form)+'/autofill/'+action;
async function req(action,v,{form='FORM',origin=base,url=path(action,form),method='POST'}={}){const r=Readable.from([Buffer.from(JSON.stringify(v))]);r.method=method;r.headers={host:'creator.test',origin,'content-type':'application/json'};r.socket={remoteAddress:'test-ip'};let status=200,data;const res={writeHead(s){status=s},end(v){data=JSON.parse(v)}};try{assert(await life.publicHandle(r,res,new URL(url,base)));}catch(e){status=e.status||400;data={error:e.message};}return {status,data};}
const identity={itea:'alice',email:'alice@example.com'},request=(v=identity)=>req('request',v),verify=(challenge,code,v=identity,opt)=>req('verify',{...v,challenge,code},opt),code=()=>[...drafts.values()].at(-1).body.match(/\b\d{6}\b/)[0];
try{
 assert.equal((await req('request',identity,{origin:'https://evil.test'})).status,400);
 assert.equal((await req('request',identity,{url:path('request').replace(token('FORM'),'FORM.invalid')})).status,400);
 assert.equal((await request({...identity,email:'bad'})).status,400);
 const first=await request();assert.equal(first.status,200);assert.equal(sends,1);assert.deepEqual(Object.keys(first.data).sort(),['challenge','message','retryAfter']);assert(!JSON.stringify(first.data).includes('Alice'));assert(!JSON.stringify(first.data).includes('alice@example.com'));
 assert.equal((await request()).status,400);
 assert.equal((await verify(first.data.challenge,'000000')).status,400);
 assert.equal((await verify(first.data.challenge,code(),{itea:'bob',email:'bob@example.com'})).status,400);
 assert.equal((await verify(first.data.challenge,code(),identity,{form:'FORM2'})).status,400);
 const confirmed=await verify(first.data.challenge,code());assert.equal(confirmed.status,200);assert.equal(confirmed.data.profile.name,'Alice');assert.equal(confirmed.data.profile.accounts[0].fans,0);assert.equal(confirmed.data.profile.accounts[1].fans,null);assert(confirmed.data.profile.accounts[1].url.includes('tiktok.com/@alice'));assert(!JSON.stringify(confirmed.data).includes('Bob'));assert(!JSON.stringify(confirmed.data).includes('INTERNAL'));assert(!JSON.stringify(confirmed.data).includes('PRIVATE'));assert(!JSON.stringify(confirmed.data).includes('"id"'));assert.equal(writes,0);
 assert.equal((await verify(first.data.challenge,code())).status,400);
 time+=16*60000;const wrong=await request({itea:'missing',email:'missing@example.com'});assert.equal(wrong.status,200);assert.equal(wrong.data.message,first.data.message);assert.equal(sends,1);assert.equal((await verify(wrong.data.challenge,'123456',{itea:'missing',email:'missing@example.com'})).status,400);
 time+=16*60000;const bad=await request();const correct=code();for(let n=0;n<5;n++)assert.equal((await verify(bad.data.challenge,'000000')).status,400);assert.equal((await verify(bad.data.challenge,correct)).status,400);
 time+=16*60000;const expired=await request(),expiredCode=code();time+=11*60000;assert.equal((await verify(expired.data.challenge,expiredCode)).status,400);
 time+=16*60000;const changed=await request(),oldCode=code();state.people[0].email='new@example.com';assert.equal((await verify(changed.data.challenge,oldCode)).status,400);state.people[0].email=identity.email;
 time+=16*60000;failSend=true;const failed=await request(),failedCode=code();assert.equal(failed.status,200);assert.equal((await verify(failed.data.challenge,failedCode)).status,400);failSend=false;
 time+=16*60000;state.people.push({...state.people[0],id:'duplicate'});const count=sends;await request();assert.equal(sends,count);state.people.pop();
 time+=16*60000;const restart=await request(),restartCode=code();life=create();assert.equal((await verify(restart.data.challenge,restartCode)).status,400);
 rows[0].enabled=false;assert.equal((await request()).status,400);assert.equal(writes,0);
 console.log('PASS signed public autofill: origin, no details before verification, no account enumeration in response, one-time codes, expiry, 5-attempt limit, cooldown, identity/form binding, changed identity, duplicate identity, failed mail and restart suppression; whitelist only, fan zero preserved, no library writes.');
}finally{Date.now=realNow;}
