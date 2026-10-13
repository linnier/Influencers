import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

test('production HTTP API, validation, associations and SQLite persistence', {timeout:60000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'influencers-api-'));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let logs = '';
  async function start() {
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)], {
      cwd:process.cwd(), env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',INFLUENCERS_DB_PATH:join(directory,'test.sqlite')}, stdio:['ignore','pipe','pipe'],
    });
    child.stdout.on('data', x => {logs+=x;}); child.stderr.on('data', x => {logs+=x;});
    for(let i=0;i<100;i++) {
      if(child.exitCode!==null) throw new Error(`Server exited: ${logs}`);
      try { const r=await fetch(`${origin}/api/workspace`); if(r.ok) return; } catch {}
      await delay(100);
    }
    throw new Error(`Server failed to start: ${logs}`);
  }
  async function stop() {
    if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}
  }
  async function call(path, method='GET', body, expected=200, headers={}) {
    const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result;
  }
  const base={name:'测试达人',handle:'test_creator',platform:'小红书',category:'生活方式',followers:12000,engagement:5.5,quote:1800,status:'待联系',city:'上海',contact:'contact@example.test',notes:'测试备注'};
  let person,project,followup;
  try {
    await start();
    await t.test('empty workspace and rendered application page', async()=>{
      assert.deepEqual(await call('/api/workspace'),{influencers:[],projects:[],followups:[]});
      const page=await fetch(origin);assert.equal(page.status,200);assert.match(await page.text(),/星桥/);
    });
    await t.test('reject invalid fields, malformed JSON and cross-site writes', async()=>{
      for(const body of [{...base,name:''},{...base,followers:-1},{...base,followers:1.2},{...base,engagement:101},{...base,platform:'unknown'},{...base,quote:'100'},[]])
        await call('/api/influencers','POST',body,400);
      await call('/api/influencers','POST',base,403,{Origin:'https://untrusted.example'});
      await call('/api/influencers','POST',base,403,{Origin:'null'});
      const malformed=await fetch(origin+'/api/influencers',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
      assert.equal((await call('/api/workspace')).influencers.length,0);
    });
    await t.test('create and update influencer without losing creation timestamp', async()=>{
      person=await call('/api/influencers','POST',base,201);assert.ok(person.id);assert.equal(person.followers,12000);
      const updated=await call('/api/influencers/'+person.id,'PUT',{...base,name:'测试达人 · 已编辑',status:'沟通中',followers:15000});
      assert.equal(updated.createdAt,person.createdAt);assert.equal(updated.status,'沟通中');assert.equal(updated.followers,15000);
      assert.equal((await call('/api/workspace')).influencers[0].name,'测试达人 · 已编辑');
    });
    await t.test('project members, date validation and atomic failed update', async()=>{
      const value={name:'新品合作',brand:'测试品牌',budget:20000,status:'执行中',startDate:'2026-10-13',endDate:'2026-11-01',description:'交付两篇内容',influencerIds:[person.id,person.id]};
      project=await call('/api/projects','POST',value,201);assert.deepEqual(project.influencerIds,[person.id]);
      await call('/api/projects','POST',{...value,endDate:'2026-02-30'},400);
      await call('/api/projects','POST',{...value,endDate:'2026-01-01'},400);
      await call('/api/projects/'+project.id,'PUT',{...value,name:'不应保存',influencerIds:['missing']},404);
      assert.equal((await call('/api/workspace')).projects[0].name,'新品合作');
      project=await call('/api/projects/'+project.id,'PUT',{...value,status:'已完成',budget:21000});assert.equal(project.status,'已完成');
    });
    await t.test('followup links and next-date validation', async()=>{
      const value={influencerId:person.id,channel:'微信',date:'2026-10-13',nextDate:'2026-10-15',content:'等待确认档期'};
      await call('/api/followups','POST',{...value,nextDate:'2026-10-12'},400);
      await call('/api/followups','POST',{...value,influencerId:'missing'},404);
      followup=await call('/api/followups','POST',value,201);assert.equal(followup.influencerId,person.id);
      assert.equal((await call('/api/workspace')).followups.length,1);
    });
    await t.test('data survives server restart', async()=>{
      await stop();await start();const stored=await call('/api/workspace');
      assert.equal(stored.influencers[0].id,person.id);assert.equal(stored.projects[0].status,'已完成');assert.equal(stored.followups[0].id,followup.id);
    });
    await t.test('delete cascade preserves projects and missing records return 404', async()=>{
      await call('/api/demo','POST',{},409);
      await call('/api/influencers/'+person.id,'DELETE');const stored=await call('/api/workspace');
      assert.equal(stored.influencers.length,0);assert.equal(stored.followups.length,0);assert.deepEqual(stored.projects[0].influencerIds,[]);
      await call('/api/influencers/'+person.id,'DELETE',undefined,404);
      await call('/api/followups/'+followup.id,'DELETE',undefined,404);
      await call('/api/projects/'+project.id,'DELETE');assert.equal((await call('/api/workspace')).projects.length,0);
    });
    await t.test('Excel import merges real account identities, preserves notes, skips edited records and rolls back invalid batches', async()=>{
      const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Instagram');
      sheet.addRow(['序号','昵称','粉丝数','类型','主页','备注','联系']);
      sheet.addRow([1,'账号甲',12000,'food','https://www.instagram.com/creator_a/reels/?share=transient','已合作 USD 300','contact-a@example.test']);
      sheet.addRow([2,'账号甲旧名',13000,'生活','https://www.instagram.com/creator_a/','其他报价套餐','contact-old@example.test']);
      sheet.addRow([3,'账号乙',20000,'fashion','https://www.instagram.com/creator_b/reels/','','']);
      async function upload(book,headers={},expected=200) {
        const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer({useSharedStrings:true}));
        const shared=zip.file('xl/sharedStrings.xml');
        if(shared)zip.file('xl/sharedStrings.xml',(await shared.async('string')).replace('<si><t>账号甲</t></si>','<si><t></t><r><t>账号甲</t></r></si>'));
        const form=new FormData();form.append('file',new Blob([await zip.generateAsync({type:'nodebuffer'})]),'博主清单.xlsx');
        const response=await fetch(origin+'/api/import',{method:'POST',headers:{Origin:origin,...headers},body:form});
        const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;
      }
      await upload(workbook,{Origin:'https://untrusted.example'},403);
      const result=await upload(workbook);
      assert.deepEqual(result,{sourceRows:3,uniqueRecords:2,mergedDuplicateRows:1,inserted:2,skipped:0});
      let stored=(await call('/api/workspace')).influencers;
      assert.deepEqual(stored.map(item=>item.handle).sort(),['creator_a','creator_b']);
      const first=stored.find(item=>item.handle==='creator_a');assert.equal(first.followers,12000);assert.equal(first.status,'已合作');
      assert.match(first.notes,/USD 300/);assert.match(first.notes,/13000/);assert.match(first.contact,/contact-old/);assert.doesNotMatch(first.notes,/transient/);
      await call('/api/influencers/'+first.id,'PUT',{...first,name:'手动编辑保留',quote:3000});
      assert.equal((await upload(workbook)).skipped,2);
      const invalid=new ExcelJS.Workbook();const other=invalid.addWorksheet('XHS');other.addRow(['序号','昵称','粉丝数','类型','主页','备注','联系']);
      other.addRow([1,'不应部分导入',100,'生活','https://www.xiaohongshu.com/user/profile/new-valid','','']);
      other.addRow([2,'字段过长应回滚',100,'生活','https://www.xiaohongshu.com/user/profile/new-invalid','x'.repeat(4001),'']);
      await upload(invalid,{},400);
      stored=(await call('/api/workspace')).influencers;assert.equal(stored.length,2);
      assert.equal(stored.find(item=>item.id===first.id).name,'手动编辑保留');assert.equal(stored.find(item=>item.id===first.id).quote,3000);
      const malformed=new FormData();malformed.append('file',new Blob(['bad archive']),'bad.xlsx');
      assert.equal((await fetch(origin+'/api/import',{method:'POST',body:malformed})).status,400);
      for(const item of stored)await call('/api/influencers/'+item.id,'DELETE');
    });
    await t.test('demo data is opt-in and cannot overwrite existing records', async()=>{
      const demo=await call('/api/demo','POST',{},201);assert.equal(demo.influencers.length,6);assert.equal(demo.projects.length,1);assert.equal(demo.followups.length,1);
      await call('/api/demo','POST',{},409);assert.equal((await call('/api/workspace')).influencers.length,6);
      await call('/api/followups/'+demo.followups[0].id,'DELETE');assert.equal((await call('/api/workspace')).followups.length,0);
    });
  } finally {await stop();await rm(directory,{recursive:true,force:true});}
});
