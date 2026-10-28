import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const testPassword='SYNTHETIC_RENDER_TEST_PASSWORD_ONLY';
async function check(configured){
 const dir=mkdtempSync(join(tmpdir(),'creator-render-smoke-'));
 const child=spawn(process.execPath,[resolve(root,'server.mjs')],{cwd:root,env:{...process.env,HOST:'0.0.0.0',PORT:'0',DATA_BACKEND:'lark',DATA_DIR:dir,TEAM_PASSWORD:testPassword,LARK_APP_ID:'SYNTHETIC_APP',LARK_APP_SECRET:configured?'SYNTHETIC_SECRET':'',LARK_BASE_TOKEN:'',LARK_SOURCE_URL:'https://example.larksuite.com/base/SYNTHETIC_BASE',LARK_MEMBER_MAP:'{}'},stdio:['ignore','pipe','pipe']});
 let errorText='';child.stderr.on('data',b=>errorText+=b);
 try{
  const port=await new Promise((ok,fail)=>{const timeout=setTimeout(()=>fail(Error('Cloud-style startup timed out')),10000);child.stdout.on('data',b=>{const m=String(b).match(/listening on http:\/\/0\.0\.0\.0:(\d+)/);if(m){clearTimeout(timeout);ok(Number(m[1]));}});child.once('error',e=>{clearTimeout(timeout);fail(e)});child.once('exit',code=>{clearTimeout(timeout);fail(Error('Server exited '+code+': '+errorText))});});
  const url='http://127.0.0.1:'+port;
  let headers={Authorization:'Basic '+Buffer.from('team:'+testPassword).toString('base64')};
  let r=await fetch(url+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
  r=await fetch(url+'/',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
  r=await fetch(url+'/api/connection');assert.equal(r.status,401);
  r=await fetch(url+'/auth/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({username:'team',password:testPassword})});assert.equal(r.status,200);headers={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
  r=await fetch(url+'/',{headers});assert.equal(r.status,200);assert((await r.text()).includes('project-workflow.js'));
  r=await fetch(url+'/project-workflow.js',{headers});assert.equal(r.status,200);assert((await r.text()).includes('ProjectWorkflow'));
  r=await fetch(url+'/api/connection',{headers});const connection=await r.json();assert.equal(connection.mode,'lark');assert.equal(connection.configured,configured);assert.equal(connection.build,'2.6.34');assert.equal(connection.automaticWriteBatches,true);assert(!JSON.stringify(connection).includes('SYNTHETIC_SECRET'));
  if(!configured){r=await fetch(url+'/api/state',{headers});assert.equal(r.status,503);assert((await r.json()).error.includes('尚未配置'));}
 }finally{
  const exit=new Promise(r=>child.once('exit',r));if(child.exitCode===null){child.kill('SIGTERM');await exit;}rmSync(dir,{recursive:true,force:true});
 }
}
await check(true);await check(false);
console.log('PASS Render-style startup: platform port, public health check, protected pages/assets/API, env-only Lark config, missing secret fails without SQLite fallback. No live Lark requests.');
