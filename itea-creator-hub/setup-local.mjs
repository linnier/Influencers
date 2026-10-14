import {createInterface,emitKeypressEvents} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {spawn} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),runtime=resolve(root,'.runtime'),configPath=resolve(runtime,'local-config.json');
async function ask(label){const rl=createInterface({input:process.stdin,output:process.stdout});try{return await new Promise(r=>rl.question(label,r))}finally{rl.close()}}
async function secret(label){if(!process.stdin.isTTY)throw Error('请在终端或双击启动脚本运行配置向导。');process.stdout.write(label);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';function end(){process.stdin.off('keypress',handle);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n')}function handle(str,key={}){if(key.ctrl&&key.name==='c'){end();reject(Error('配置已取消'));return}if(key.name==='return'||key.name==='enter'){end();resolve(value);return}if(key.name==='backspace'){if(value){value=value.slice(0,-1);process.stdout.write('\b \b')}return}if(str&&!key.ctrl&&!key.meta){value+=str;process.stdout.write('*'.repeat(str.length))}}process.stdin.on('keypress',handle)})}
function check(c){if(!c.LARK_APP_ID||!c.LARK_APP_SECRET||(!c.LARK_BASE_TOKEN&&!c.LARK_SOURCE_URL))throw Error('Lark配置不完整，请重新运行配置向导。');if(!c.TEAM_PASSWORD||c.TEAM_PASSWORD.length<16)throw Error('团队登录密码至少需要16位。')}
let config={};if(existsSync(configPath)&&!process.argv.includes('--configure')){try{config=JSON.parse(readFileSync(configPath,'utf8'))}catch{throw Error('本机配置文件损坏，请运行 node setup-local.mjs --configure 重新配置。')}}else{
 console.log('\nitea创作者管理 · 免费内网启动向导\n输入内容只保存到本机.runtime目录；密钥输入不会显示。');
 const id=(await ask('Lark App ID：')).trim();const sec=(await secret('Lark App Secret：')).trim();const source=(await ask('原始Base链接/token（知识库wiki链接也可，解析需对应权限）：')).trim();const password=await secret('设置团队登录密码（至少16位）：');const repeat=await secret('再输入一次团队密码：');if(password!==repeat)throw Error('两次密码不一致，配置未保存。');
 config={LARK_APP_ID:id,LARK_APP_SECRET:sec,TEAM_PASSWORD:password};if(source.startsWith('https://')){const u=new URL(source);if(!u.hostname.endsWith('.larksuite.com'))throw Error('请使用Lark链接。');if(u.pathname.startsWith('/base/'))config.LARK_BASE_TOKEN=u.pathname.split('/')[2];else if(u.pathname.startsWith('/wiki/'))config.LARK_SOURCE_URL=source;else throw Error('请使用Base或知识库链接。')}else config.LARK_BASE_TOKEN=source;
 check(config);mkdirSync(runtime,{recursive:true,mode:0o700});writeFileSync(configPath,JSON.stringify(config),'utf8');if(process.platform!=='win32'){const {chmodSync}=await import('node:fs');chmodSync(configPath,0o600)}console.log('配置已保存到本机，未发送到聊天或代码仓库。');
}
check(config);const port=process.env.PORT||'3000';const env={...process.env,...config,DATA_BACKEND:'lark',HOST:'0.0.0.0',PORT:port,DATA_DIR:resolve(runtime,'runtime-data')};
console.log('\n启动网站…\n本机地址：http://127.0.0.1:'+port+'\n同事在同一局域网使用以下地址：');
let found=false;for(const entries of Object.values(networkInterfaces()))for(const address of entries??[]){if((address.family==='IPv4'||address.family===4)&&!address.internal){console.log('http://'+address.address+':'+port);found=true}}
if(!found)console.log('未检测到局域网IPv4地址，请连接办公室网络。');
console.log('登录用户名：team；密码为配置时设置的团队密码。\n请让运行电脑保持开机，不要休眠。关闭窗口或按Ctrl+C会停止网站。\n');
const child=spawn(process.execPath,[resolve(root,'server.mjs')],{cwd:root,env,stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
