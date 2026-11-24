import './public/project-owners.js';
import {createHash} from 'node:crypto';

export const teamId=project=>'PROJECT_TEAM_'+createHash('sha256').update(project).digest('hex');
export function teamFor(project,rows){
 const row=rows.find(r=>r.kind==='project-team'&&r.project===project.id);
 return {...project,coOwners:row?.primary===project.owner&&Array.isArray(row.coOwners)?row.coOwners:[]};
}
export const assignedCount=(state,rows,owner)=>!owner?0:
 [...state.people,...state.collabs].filter(p=>p.owner===owner).length+
 state.projects.filter(p=>globalThis.ProjectOwners.has(teamFor(p,rows),owner)).length;
export function teamRecord(project,owners){
 return {id:teamId(project.id),kind:'project-team',project:project.id,primary:project.owner,
  coOwners:owners.filter(n=>n!==project.owner),updated:new Date().toISOString()};
}
// Change project membership independently from ownership of creator records.
export function replaceTeams(state,rows,from,to){
 const changes=[];
 for(const p of state.projects){const names=globalThis.ProjectOwners.names(teamFor(p,rows));
  if(!names.includes(from))continue;
  const next=[...new Set(names.map(n=>n===from?to:n))];
  if(p.owner===from)p.owner=to;
  changes.push(teamRecord(p,next));
 }
 return changes;
}
