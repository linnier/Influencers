import assert from 'node:assert/strict';
import {WorkflowStore} from './workflow-store.mjs';
import {visibleState,mergeVisible} from './access-control.mjs';
import {teamRecord,replaceTeams} from './project-teams.mjs';
const project={id:'P',name:'Shared project',owner:'Amy'},state={people:[],accounts:[],projects:[project],collabs:[],posts:[]};
let team=teamRecord(project,['Amy','Zhuyun']),reads=0;
const lark={readEpoch:0,list:async path=>{
 const filter=new URL(path,'https://test').searchParams.get('filter');
 assert(filter?.includes('project-team'),'membership must be included in each selective query');
 reads++;
 return [team,{id:'FALSE_POSITIVE',kind:'discovery',project:'P',note:'project-team'}].map(r=>({record_id:r.id,fields:{工作流ID:r.id,数据:JSON.stringify(r)}}));
}};
const store=new WorkflowStore({lark});store.tablePath='/test/workflow';
for(const rows of [await store.visibilityRows(),await store.invitationRows({project:'P'}),await store.managementRows()]){
 assert.equal(rows.length,1);assert.deepEqual(visibleState(state,rows).projects[0].coOwners,['Zhuyun']);
 const merged=mergeVisible(visibleState(state,rows),state,rows);assert.equal(merged.projects[0].coOwners,undefined,'business/Lark tables do not receive derived membership fields');
}
assert.equal(reads,3);
team=teamRecord(project,['Amy']);store.putRow=async r=>r;await store.put(team);
assert.equal(visibleState(state,await store.visibilityRows()).projects[0].coOwners,undefined,'removal invalidates browse membership immediately');
team=teamRecord(project,['Amy','Zhuyun']);assert.equal(visibleState({...state,projects:[{...project,owner:'Other'}]},[team]).projects[0].coOwners,undefined,'external primary-owner changes cannot retain an old secondary team');
const changed=structuredClone(state),changes=replaceTeams(changed,[team],'Zhuyun','Amy');assert.deepEqual(changes[0].coOwners,[]);assert.equal(changed.projects[0].owner,'Amy');
assert.deepEqual(globalThis.ProjectOwners.names({owner:'Amy、Ben'}),['Amy、Ben'],'legacy names are never split to grant permissions');
console.log('PASS Lark selective project membership reads, false-positive filtering, business schema compatibility, cache invalidation, primary-owner pinning and exact name matching.');
