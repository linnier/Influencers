import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {backupKey,inspectArchive} from '../backup-archive.mjs';
// Offline verification only. Never contacts Lark or writes into a live DATA_DIR.
try{
 const args=process.argv.slice(2),keyIndex=args.indexOf('--key-file');let keyValue=process.env.BACKUP_ENCRYPTION_KEY;
 if(keyIndex>=0){const file=args[keyIndex+1];if(!file)throw Error('--key-file 缺少文件路径');keyValue=JSON.parse(await readFile(file,'utf8')).key;args.splice(keyIndex,2);}
 const [input,output]=args;if(!input)throw Error('用法：node tools/verify-backup.mjs --key-file 离线密钥.json 文件.iteabackup [全新输出目录]');
 const archive=await inspectArchive(await readFile(input),backupKey(keyValue));
 if(output){const dir=resolve(output);await mkdir(dir,{recursive:false,mode:0o700});for(const f of archive.files){const path=join(dir,f.path),parent=resolve(path,'..');await mkdir(parent,{recursive:true,mode:0o700});await writeFile(path,f.content,{mode:0o600,flag:'wx'});}await writeFile(join(dir,'manifest.json'),JSON.stringify(archive.manifest,null,2),{mode:0o600,flag:'wx'});}
 console.log(JSON.stringify({verified:true,startedAt:archive.manifest.startedAt,completedAt:archive.manifest.completedAt,counts:archive.manifest.counts,extracted:!!output},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
