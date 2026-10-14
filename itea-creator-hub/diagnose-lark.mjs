import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LarkStore} from './lark-store.mjs';
const root=dirname(fileURLToPath(import.meta.url));
let config;try{config=JSON.parse(readFileSync(resolve(root,'.runtime/local-config.json'),'utf8'))}catch{console.log('未找到本机配置。请把本文件放到 setup-local.mjs 所在的文件夹，再运行。');process.exit(1)}
const clean=value=>{let text=String(value??'');for(const secret of [config.LARK_APP_SECRET,config.TEAM_PASSWORD])if(secret)text=text.split(secret).join('[已隐藏]');return text.replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').slice(0,600)};
console.log('itea · Lark只读连接检查');
console.log('App ID已填写：'+Boolean(config.LARK_APP_ID)+'；App Secret已填写：'+Boolean(config.LARK_APP_SECRET));
console.log(config.LARK_BASE_TOKEN?'数据源类型：原始Base token':'已配置的知识库链接：'+clean(config.LARK_SOURCE_URL));
let step=0;
const fetchImpl=async(url,options)=>{
 const u=new URL(url);if(u.origin!=='https://open.larksuite.com')throw Error('不允许的接口地址');
 const auth=u.pathname.includes('/auth/');const name=auth?'应用身份认证':u.pathname.includes('/wiki/')?'知识库链接解析':'Base表列表读取';
 console.log('\n步骤 '+(++step)+'：'+name);console.log('接口：'+u.pathname);
 let response;try{response=await fetch(url,options)}catch{console.log('网络请求失败或超时');throw Error('网络不可达')}
 let body;try{body=await response.clone().json()}catch{console.log('返回内容无法解析');return response}
 console.log('HTTP：'+response.status+'；业务码：'+String(body.code));
 if(body.code!==0){console.log('Lark错误说明：'+clean(body.msg??body.message??'未提供'));const scopes=(body.error?.permission_violations??body.error?.permissionviolations??[]).map(v=>v.subject).filter(v=>typeof v==='string'&&/^[a-z0-9_:.-]+$/.test(v));if(scopes.length)console.log('接口要求的权限：'+scopes.join(', '));}
 return response;
};
const store=new LarkStore({appId:config.LARK_APP_ID,appSecret:config.LARK_APP_SECRET,baseToken:config.LARK_BASE_TOKEN,sourceUrl:config.LARK_SOURCE_URL,fetchImpl});
try{const base=await store.resolveBase();console.log('\n已取得原始Base标识：'+base);const tables=await store.list('/open-apis/bitable/v1/apps/'+encodeURIComponent(base)+'/tables',100);console.log('读取成功，表名：'+tables.map(t=>t.name).join('、'));console.log('这里只检查连接，未读取达人联系资料，未修改配置或Lark记录。')}catch(e){console.log('\n检查停在以上失败步骤。');console.log(clean(e.message));console.log('请只发送上述检查结果；不要发送.runtime配置文件。');process.exitCode=1}
