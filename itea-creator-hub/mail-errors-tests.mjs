import assert from 'node:assert/strict';
import {LarkMail} from './lark-mail.mjs';
// Lark's draft/send error table: 1236018 = receiver check fail.
// https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/mail-v1/user_mailbox-draft/send
let code=1236018,http=400,calls=0;const mail=new LarkMail({store:{},appSecret:'synthetic-test-secret',fetchImpl:async()=>{calls++;return {ok:false,status:http,json:async()=>({code,msg:'receiver check fail'})};}});
await assert.rejects(mail.send('synthetic-draft',{token:'synthetic-access'}),e=>e.status===400&&e.message.includes('收件人检查失败')&&e.message.includes('1236018')&&!e.message.includes('授权'));
assert.equal(calls,1);
code=1236010;http=429;await assert.rejects(mail.send('synthetic-draft',{token:'synthetic-access'}),e=>e.status===429&&e.message.includes('1236010')&&!e.message.includes('授权'));
assert.equal(calls,2);
console.log('PASS mail error explanations: recipient rejection accurately identified, generic/rate-limit codes retained without falsely diagnosing authorization, and no automatic retry.');
