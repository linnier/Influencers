import {imageFiles} from './backup-archive.mjs';

export function createBackupSource({lark,store,db,dataDir,build}){
 return async()=>{
  const startedAt=new Date().toISOString();let source;
  if(!lark){
   // Synchronous reads share one SQLite read transaction, including WAL data.
   db.exec('BEGIN');try{
    const row=db.prepare('SELECT revision,state FROM workspace WHERE id=1').get();
    const rows=db.prepare('SELECT data FROM collaboration_workflow ORDER BY id').all().map(r=>JSON.parse(r.data));
    const audit=db.prepare('SELECT * FROM audit ORDER BY id').all();
    source={backend:'sqlite',build,consistency:'SQLite read transaction; images copied afterwards',business:{revision:row.revision,state:JSON.parse(row.state)},workflow:{rows},audit};
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }else{
   source=await lark.withReadDeadline(async()=>{
    const epoch=lark.readEpoch,workflowEpoch=store.rowsEpoch;if(lark.writeDepth)throw Error('资料正在保存，请稍后再备份');
    const business=await lark.snapshot();
    // Resolve the workflow table afresh, so removed/recreated tables cannot silently disappear.
    const tables=await lark.list(business.root+'/tables',100),matches=tables.filter(t=>t.name==='协作工作流');
    if(matches.length>1)throw Error('存在重名工作流表，备份已停止');
    let workflow={table:null,fields:[],records:[],rows:[]};
    if(matches.length){const table=matches[0],path=business.root+'/tables/'+encodeURIComponent(table.table_id);const fields=await lark.list(path+'/fields',200),records=await lark.list(path+'/records');workflow={table,fields,records,rows:store.decodeRows(records)};}
    if(lark.writeDepth||epoch!==lark.readEpoch||workflowEpoch!==store.rowsEpoch)throw Error('备份期间资料有变化，请稍后重试');
    return {backend:'lark',build,consistency:'Lark paginated export; local writes checked; external Lark edits are not transactionally isolated',business,workflow};
   });
  }
  const images=await imageFiles(dataDir);return {source,images,startedAt,completedAt:new Date().toISOString()};
 };
}
