"use client";
import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PLATFORMS, CATEGORIES, INFLUENCER_STATUSES, PROJECT_STATUSES, CHANNELS } from "@/lib/types";
import type { WorkspaceData, Influencer, Project } from "@/lib/types";
import { influencersCSV } from "@/lib/csv";
import Icon from "./icon";
import Modal from "./modal";

type View = "overview" | "influencers" | "projects" | "followups";
type Editor = { kind: "influencer"; value?: Influencer } | { kind: "project"; value?: Project } | {kind:"followup"; influencerId?:string} | null;
const NAV = [{id:"overview",label:"工作概览",icon:"grid"},{id:"influencers",label:"达人资源库",icon:"users"},{id:"projects",label:"合作项目",icon:"briefcase"},{id:"followups",label:"跟进记录",icon:"message"}] as const;
const empty: WorkspaceData = {influencers:[],projects:[],followups:[]};
const money = (n:number) => `¥${n.toLocaleString("zh-CN", {maximumFractionDigits:2})}`;
const compact = (n:number) => n>=10000 ? `${(n/10000).toFixed(1).replace(/\.0$/,"")}万` : n.toLocaleString("zh-CN");
const today = () => new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Shanghai"}).format(new Date());
function Avatar({name, small=false}: {name:string;small?:boolean}) { return <span className={`avatar ${small?"small":""} tone-${name.charCodeAt(0)%5}`}>{name.slice(0,1)}</span>; }
function Badge({status}:{status:string}) { return <span className={`badge ${["已合作","已完成"].includes(status)?"green":["沟通中","执行中"].includes(status)?"orange":["暂停合作","已取消"].includes(status)?"gray":"blue"}`}><i/>{status}</span>; }
function Field({label,children,full=false}: {label:string;children:React.ReactNode;full?:boolean}) {
  const id=useId();
  return <div className={`field ${full?"full":""}`}><label htmlFor={id}>{label}</label>{Children.map(children,(child,index)=>index===0&&isValidElement<{id?:string}>(child)?cloneElement(child,{id}):child)}</div>;
}
function Options({values}: {values:readonly string[]}) { return <>{values.map(v=><option key={v}>{v}</option>)}</>; }
function Empty({title,description,action}:{title:string;description:string;action?:React.ReactNode}) { return <div className="empty"><span className="empty-icon"><Icon name="users" size={28}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
async function request(path:string, method="GET", body?:unknown) {
  const res = await fetch(path, {method, cache:"no-store", headers:body===undefined?undefined:{"Content-Type":"application/json"}, body:body===undefined?undefined:JSON.stringify(body)});
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "操作失败，请重试");
  return json;
}
export default function Workspace() {
  const [data,setData] = useState<WorkspaceData>(empty), [loading,setLoading] = useState(true), [loadError,setLoadError]=useState("");
  const [view,setView]=useState<View>("overview"), [query,setQuery]=useState(""), [platform,setPlatform]=useState(""), [status,setStatus]=useState("");
  const [editor,setEditor]=useState<Editor>(null), [detail,setDetail]=useState<string|null>(null), [busy,setBusy]=useState(false), [formError,setFormError]=useState("");
  const [notice,setNotice]=useState(""), [deletion,setDeletion]=useState<{kind:"influencers"|"projects"|"followups";id:string;name:string}|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=> { try { const result=await request("/api/workspace"); setData(result); setLoadError(""); } catch(e) { setLoadError((e as Error).message); throw e; } finally {setLoading(false);} },[]);
  useEffect(()=>{ void refresh().catch(()=>{}); },[refresh]);
  useEffect(()=>{ if (!notice) return; const timer=setTimeout(()=>setNotice(""),4000); return ()=>clearTimeout(timer); },[notice]);
  const changeView=(next:View)=>{setView(next);setQuery("");setPlatform("");setStatus("");};
  const openEditor=(e:Editor)=>{setEditor(e);setFormError("");setDetail(null);};
  const closeEditor=()=>{if(!busy){setEditor(null);setFormError("");}};
  const selected=data.influencers.find(x=>x.id===detail);
  const q=query.trim().toLocaleLowerCase();
  const people=data.influencers.filter(x=>(!q||[x.name,x.handle,x.category,x.city,x.contact].some(s=>s.toLocaleLowerCase().includes(q)))&&(!platform||x.platform===platform)&&(!status||x.status===status));
  const projects=data.projects.filter(x=>(!q||[x.name,x.brand,x.description].some(s=>s.toLocaleLowerCase().includes(q)))&&(!status||x.status===status));
  const person=(id:string)=>data.influencers.find(p=>p.id===id);
  const followups=data.followups.filter(x=>!q||[person(x.influencerId)?.name||"",x.content,x.channel].some(s=>s.toLocaleLowerCase().includes(q)));
  const day=today();
  const due=data.influencers.map(p=>({person:p,last:data.followups.find(f=>f.influencerId===p.id)})).filter(x=>x.last?.nextDate&&x.last.nextDate<=day);
  const totalFollowers=data.influencers.reduce((sum,p)=>sum+p.followers,0), active=data.projects.filter(p=>p.status==="执行中");
  const newButton=()=>view==="projects"?openEditor({kind:"project"}):view==="followups"?openEditor({kind:"followup"}):openEditor({kind:"influencer"});
  async function mutate(path:string, method:string, body?:unknown, success="已保存") {
    setBusy(true);setFormError("");
    try { await request(path,method,body); await refresh(); setEditor(null);setDeletion(null);setNotice(success); return true; }
    catch(e) {setFormError((e as Error).message);return false;} finally {setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!editor||busy)return;
    const f=new FormData(event.currentTarget), str=(key:string)=>String(f.get(key)||"");
    if(editor.kind==="influencer") {
      const body: Record<string,unknown>=Object.fromEntries(["name","handle","platform","category","status","contact","city","notes"].map(k=>[k,str(k)]));
      for(const key of ["followers","engagement","quote"]) body[key]=Number(str(key));
      await mutate(`/api/influencers${editor.value?`/${editor.value.id}`:""}`,editor.value?"PUT":"POST",body);
    } else if(editor.kind==="project") {
      await mutate(`/api/projects${editor.value?`/${editor.value.id}`:""}`,editor.value?"PUT":"POST",{
        ...Object.fromEntries(["name","brand","status","startDate","endDate","description"].map(k=>[k,str(k)])),budget:Number(str("budget")),influencerIds:f.getAll("influencerIds")
      });
    } else await mutate("/api/followups","POST",Object.fromEntries(["influencerId","channel","date","nextDate","content"].map(k=>[k,str(k)])),"跟进记录已添加");
  }
  function exportCSV() {
    const url=URL.createObjectURL(new Blob([influencersCSV(people)],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`达人档案-${day}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(`已导出 ${people.length} 位达人的档案`);
  }
  async function importExcel(file?:File) {
    if(!file||busy)return;
    setBusy(true);setFormError("");
    try {
      const form=new FormData();form.append("file",file);
      const response=await fetch("/api/import",{method:"POST",body:form});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"导入失败，请检查 Excel");
      await refresh();setNotice(`导入完成：新增 ${result.inserted} 位达人，跳过 ${result.skipped} 位已有达人，合并 ${result.mergedDuplicateRows} 行重复记录`);
    } catch(error) {setFormError((error as Error).message);}
    finally {setBusy(false);if(importInput.current)importInput.current.value="";}
  }
  const title=NAV.find(n=>n.id===view)!.label;
  const subtitle={overview:"连接好内容，让每一次合作都有迹可循。",influencers:"沉淀达人资源，找到下一位合适的合作伙伴。",projects:"从合作意向到项目落地，把进度握在手中。",followups:"记录每一次沟通，不错过下一步行动。"}[view];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="spark" size={24}/></span><div className="brand-name">itea达人库<span>ITEA WORKSPACE</span></div></div>
      <div className="workspace-chip"><span className="workspace-dot"/>我的工作空间<span className="chip-label">本地版</span></div>
      <p className="nav-label">资源与合作</p>
      <nav aria-label="主导航">{NAV.map(n=><button key={n.id} className={`nav-item ${view===n.id?"active":""}`} onClick={()=>changeView(n.id)} aria-current={view===n.id?"page":undefined}><Icon name={n.icon}/><span>{n.label}</span>{n.id==="influencers"&&<small>{data.influencers.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Icon name="spark"/><strong>从一个好连接开始</strong><p>建立达人档案，把灵感变成下一次合作。</p>{!data.influencers.length&&!data.projects.length&&!data.followups.length&&!loading&&!loadError&&<button onClick={()=>{setFormError("");void mutate("/api/demo","POST",{},"已载入演示数据");}} disabled={busy}>体验演示数据 <Icon name="arrow" size={15}/></button>}</div><div className="local-user"><span className="avatar small">我</span><div>本地管理员<small>单人工作空间</small></div><span className="online-dot"/></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作空间 <span>/</span> <b>{title}</b></div><div className="topbar-right"><span className="local-indicator"><i/>SQLite 本地存储</span><span className="avatar small">我</span></div></header>
      <main>
        <div className="page-heading"><div><span className="eyebrow">{view==="overview"?"YOUR CREATOR NETWORK":"CREATOR MANAGEMENT"}</span><h1>{title}<span className="title-dot">.</span></h1><p>{subtitle}</p></div><div className="heading-actions">{view==="influencers"&&<><input ref={importInput} type="file" accept=".xlsx" hidden aria-label="导入 Excel 文件" onChange={event=>void importExcel(event.target.files?.[0])}/><button className="button secondary" onClick={()=>importInput.current?.click()} disabled={loading||!!loadError||busy}>{busy?"正在处理…":"导入 Excel"}</button><button className="button secondary" onClick={exportCSV} disabled={loading||!!loadError||!people.length}><Icon name="download" size={17}/>导出 CSV</button></>}<button className="button primary" onClick={newButton} disabled={loading||!!loadError||busy}><Icon name="plus" size={18}/>{view==="projects"?"新建项目":view==="followups"?"添加跟进":"添加达人"}</button></div></div>
        {notice&&<div className="toast" role="status"><Icon name="check" size={18}/>{notice}</div>}
        {loadError&&<div className="error-banner" role="alert">数据加载失败：{loadError}<button className="button secondary" onClick={()=>void refresh().catch(()=>{})}>重新加载</button></div>}
        {formError&&!editor&&!deletion&&<div className="error-banner" role="alert">{formError}<button className="icon-button" aria-label="关闭错误提示" onClick={()=>setFormError("")}><Icon name="close"/></button></div>}
        {loading?<div className="loading">正在加载工作空间…</div>:!loadError&&<>
          {view==="overview"&&<>
            <div className="stats-grid">{[
              {label:"达人资源总数",value:String(data.influencers.length),unit:"位",icon:"users" as const,note:`${data.influencers.filter(x=>x.status==="已合作").length} 位已建立合作`,color:"orange"},
              {label:"粉丝覆盖总量",value:compact(totalFollowers),unit:"",icon:"trend" as const,note:"各档案粉丝数之和，未去重",color:"blue"},
              {label:"执行中的项目",value:String(active.length),unit:"个",icon:"briefcase" as const,note:`共 ${data.projects.length} 个合作项目`,color:"purple"},
              {label:"执行项目预算",value:money(active.reduce((n,p)=>n+p.budget,0)),unit:"",icon:"money" as const,note:"计划预算，非实际支出",color:"green"},
            ].map(s=><article className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><span className={`stat-icon ${s.color}`}><Icon name={s.icon} size={19}/></span></div><div className="stat-value">{s.value}<small>{s.unit}</small></div><p>{s.note}</p></article>)}</div>
            <div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>达人资源分布</h2><p>了解你的内容生态</p></div><span className="muted">按平台</span></div>{data.influencers.length?<div className="platform-chart">{PLATFORMS.map((p,i)=>({p,i,count:data.influencers.filter(x=>x.platform===p).length})).filter(x=>x.count).map(x=><div className="chart-row" key={x.p}><span>{x.p}</span><div className="bar-track"><div className={`bar-fill bar-${x.i%3}`} style={{width:`${x.count/data.influencers.length*100}%`}}/></div><strong>{x.count}<small> 位</small></strong></div>)}<div className="chart-foot">已收录 {data.influencers.length} 位达人 · {new Set(data.influencers.map(x=>x.platform)).size} 个平台</div></div>:<Empty title="你的达人网络，从这里开始" description="添加第一位达人，即可查看资源分布。" action={<button className="text-button" onClick={()=>openEditor({kind:"influencer"})}>建立达人档案 <Icon name="arrow" size={16}/></button>}/>}</section>
            <section className="panel"><div className="panel-heading"><div><h2>待办跟进 <span className="count-tag">{due.length}</span></h2><p>根据每位达人的最新跟进记录</p></div><Icon name="clock" size={19}/></div>{due.length?<div className="due-list">{due.slice(0,4).map(x=><button key={x.person.id} className="due-item" onClick={()=>openEditor({kind:"followup",influencerId:x.person.id})}><Avatar name={x.person.name} small/><div><strong>{x.person.name}</strong><small>{x.last!.nextDate} · {x.last!.nextDate<day?"已到期":"今天跟进"}</small></div><Icon name="arrow" size={17}/></button>)}<button className="text-button" onClick={()=>changeView("followups")}>查看全部跟进 <Icon name="arrow" size={16}/></button></div>:<Empty title="暂时没有到期跟进" description="添加记录时设置下次跟进日期，即可在这里查看提醒。"/>}</section></div>
            <section className="panel recent-panel"><div className="panel-heading"><div><h2>最近添加的达人</h2><p>新连接，新可能</p></div><button className="text-button" onClick={()=>changeView("influencers")}>查看达人库 <Icon name="arrow" size={16}/></button></div>{data.influencers.length?renderPeople(data.influencers.slice(0,5)):<Empty title="还没有达人档案" description="录入平台、粉丝量、报价和联系方式，建立你的合作资源库。" action={<button className="button secondary" onClick={()=>openEditor({kind:"influencer"})}><Icon name="plus" size={16}/>添加第一位达人</button>}/>}</section>
          </>}
          {view!=="overview"&&<div className="filterbar"><label className="search"><Icon name="search" size={18}/><input aria-label="搜索" placeholder={view==="influencers"?"搜索达人、账号、领域或城市…":view==="projects"?"搜索项目名称或品牌…":"搜索达人或跟进内容…"} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" onClick={()=>setQuery("")} aria-label="清空搜索"><Icon name="close" size={15}/></button>}</label><div className="filter-options">{view==="influencers"&&<select aria-label="筛选平台" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">全部平台</option><Options values={PLATFORMS}/></select>}{view!=="followups"&&<select aria-label="筛选状态" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态</option><Options values={view==="projects"?PROJECT_STATUSES:INFLUENCER_STATUSES}/></select>}{(query||platform||status)&&<button className="text-button" onClick={()=>{setQuery("");setPlatform("");setStatus("");}}>重置</button>}</div></div>}
          {view==="influencers"&&<section className="panel"><div className="table-toolbar"><h2>全部达人 <span className="count-tag">{people.length}</span></h2><span>共 {data.influencers.length} 位达人</span></div>{people.length?renderPeople(people):<Empty title={data.influencers.length?"没有匹配的达人":"创建你的第一份达人档案"} description={data.influencers.length?"尝试其他关键词，或清除筛选条件。":"把分散的达人资源，变成清晰的合作网络。"}/>}</section>}
          {view==="projects"&&<><div className="section-meta"><span>共 {projects.length} 个项目</span><span>预算合计 {money(projects.reduce((sum,p)=>sum+p.budget,0))}</span></div>{projects.length?<div className="project-grid">{projects.map(p=><article key={p.id} className="panel project-card"><div className="project-top"><span className="project-icon"><Icon name="briefcase"/></span><Badge status={p.status}/></div><p className="project-brand">{p.brand}</p><h2>{p.name}</h2><p className="project-description">{p.description||"暂无项目说明"}</p><div className="project-budget"><span>项目预算</span><strong>{money(p.budget)}</strong></div><div className="project-dates"><Icon name="clock" size={15}/>{p.startDate||"未设开始日期"} — {p.endDate||"未设结束日期"}</div><div className="project-members">{p.influencerIds.length?<><div className="avatar-stack">{p.influencerIds.slice(0,3).map(id=><Avatar key={id} name={person(id)?.name||"?"} small/>)}</div><span>{p.influencerIds.length} 位合作达人</span></>:<span>尚未关联达人</span>}</div><div className="project-actions"><button className="text-button" onClick={()=>openEditor({kind:"project",value:p})}>管理项目 <Icon name="arrow" size={16}/></button><button className="icon-button danger" aria-label={`删除项目 ${p.name}`} onClick={()=>{setFormError("");setDeletion({kind:"projects",id:p.id,name:p.name});}}><Icon name="trash" size={17}/></button></div></article>)}</div>:<section className="panel"><Empty title={data.projects.length?"没有匹配的项目":"为下一次合作创建项目"} description="关联达人、记录品牌与预算，持续跟踪项目状态。" action={<button className="button secondary" onClick={()=>openEditor({kind:"project"})}>新建合作项目</button>}/></section>}</>}
          {view==="followups"&&<section className="panel"><div className="table-toolbar"><h2>沟通时间线 <span className="count-tag">{followups.length}</span></h2><span>日期从新到旧</span></div>{followups.length?<div className="timeline">{followups.map(f=><article className="timeline-item" key={f.id}><div className="timeline-date">{f.date.slice(5)}<small>{f.date.slice(0,4)}</small></div><div className="timeline-dot"/><div className="timeline-content"><div className="followup-header"><button className="person-link" onClick={()=>setDetail(f.influencerId)}><Avatar name={person(f.influencerId)?.name||"?"} small/><strong>{person(f.influencerId)?.name}</strong></button><span className="channel">{f.channel}</span><button className="icon-button danger" aria-label="删除跟进记录" onClick={()=>{setFormError("");setDeletion({kind:"followups",id:f.id,name:"这条跟进记录"});}}><Icon name="trash" size={16}/></button></div><p>{f.content}</p>{f.nextDate&&<span className={`next-date ${f.nextDate<=day?"due":""}`}><Icon name="clock" size={14}/>下次跟进：{f.nextDate}</span>}</div></article>)}</div>:<Empty title={data.followups.length?"没有匹配的跟进记录":"让每次沟通都有记录"} description="保存沟通内容，设置下一次跟进日期。" action={<button className="button secondary" onClick={()=>openEditor({kind:"followup"})}>添加跟进记录</button>}/>}</section>}
          <footer className="page-footer"><span>itea达人库 · 让好内容与好合作相遇</span><span>数据存储于当前服务器 · 本地单人版</span></footer>
        </>}
      </main>
    </div>
    {editor&&<Modal title={editor.kind==="influencer"?(editor.value?"编辑达人档案":"添加达人档案"):editor.kind==="project"?(editor.value?"编辑合作项目":"新建合作项目"):"添加跟进记录"} onClose={closeEditor} wide={editor.kind!=="followup"}><form onSubmit={submit} key={editor.kind+(editor.kind==="followup"?editor.influencerId||"new":editor.value?.id||"new")}>
      <div className="form-body"><p className="form-hint">带 * 的字段为必填项。金额单位为人民币元。</p><fieldset disabled={busy} className="form-grid">
        {editor.kind==="influencer"&&<>
          <Field label="达人名称 *"><input name="name" required maxLength={80} placeholder="例如：林小夏" defaultValue={editor.value?.name}/></Field>
          <Field label="平台账号"><input name="handle" maxLength={100} placeholder="账号 ID 或昵称" defaultValue={editor.value?.handle}/></Field>
          <Field label="内容平台 *"><select name="platform" defaultValue={editor.value?.platform||PLATFORMS[0]}><Options values={PLATFORMS}/></select></Field>
          <Field label="内容领域 *"><select name="category" defaultValue={editor.value?.category||CATEGORIES[0]}><Options values={CATEGORIES}/></select></Field>
          <Field label="粉丝数量"><input name="followers" type="number" min="0" max="10000000000" step="1" defaultValue={editor.value?.followers||0}/></Field>
          <Field label="互动率（%）"><input name="engagement" type="number" min="0" max="100" step="any" defaultValue={editor.value?.engagement||0}/></Field>
          <Field label="单次合作报价（元）"><input name="quote" type="number" min="0" max="1000000000" step="any" defaultValue={editor.value?.quote||0}/></Field>
          <Field label="合作状态 *"><select name="status" defaultValue={editor.value?.status||INFLUENCER_STATUSES[0]}><Options values={INFLUENCER_STATUSES}/></select></Field>
          <Field label="联系方式"><input name="contact" maxLength={200} placeholder="微信 / 邮箱 / 电话" defaultValue={editor.value?.contact}/></Field>
          <Field label="所在城市"><input name="city" maxLength={80} placeholder="例如：上海" defaultValue={editor.value?.city}/></Field>
          <Field label="备注" full><textarea name="notes" rows={3} maxLength={4000} placeholder="内容风格、合作偏好及其他信息…" defaultValue={editor.value?.notes}/></Field>
        </>}
        {editor.kind==="project"&&<>
          <Field label="项目名称 *"><input name="name" required maxLength={120} placeholder="例如：秋季新品种草计划" defaultValue={editor.value?.name}/></Field>
          <Field label="合作品牌 *"><input name="brand" required maxLength={120} placeholder="品牌或客户名称" defaultValue={editor.value?.brand}/></Field>
          <Field label="预算（元）"><input name="budget" type="number" min="0" max="10000000000" step="any" defaultValue={editor.value?.budget||0}/></Field>
          <Field label="项目状态 *"><select name="status" defaultValue={editor.value?.status||PROJECT_STATUSES[0]}><Options values={PROJECT_STATUSES}/></select></Field>
          <Field label="开始日期"><input name="startDate" type="date" defaultValue={editor.value?.startDate}/></Field>
          <Field label="结束日期"><input name="endDate" type="date" defaultValue={editor.value?.endDate}/></Field>
          <Field label="项目说明" full><textarea name="description" rows={3} maxLength={4000} defaultValue={editor.value?.description} placeholder="合作目标、内容要求与交付说明…"/></Field>
          <div className="field full"><span>关联达人（可多选）</span><div className="member-select">{data.influencers.length?data.influencers.map(p=><label key={p.id}><input type="checkbox" name="influencerIds" value={p.id} defaultChecked={editor.value?.influencerIds.includes(p.id)}/><Avatar name={p.name} small/><span>{p.name}<small>{p.platform}</small></span></label>):<p>尚无达人，可先保存项目，再添加达人并关联。</p>}</div></div>
        </>}
        {editor.kind==="followup"&&<>
          <Field label="跟进达人 *" full><select name="influencerId" required defaultValue={editor.influencerId||""}><option value="" disabled>请选择达人</option>{data.influencers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.platform}</option>)}</select></Field>
          <Field label="沟通方式 *"><select name="channel"><Options values={CHANNELS}/></select></Field>
          <Field label="跟进日期 *"><input name="date" type="date" required defaultValue={day}/></Field>
          <Field label="沟通内容 *" full><textarea name="content" required rows={4} maxLength={4000} placeholder="本次沟通要点、对方反馈与下一步计划…"/></Field>
          <Field label="下次跟进日期" full><input name="nextDate" type="date"/><small>概览中的提醒以该达人的最新跟进记录为准。</small></Field>
          {!data.influencers.length&&<p className="form-error full">请先添加达人档案，再记录跟进。</p>}
        </>}
      </fieldset>{formError&&<p className="form-error" role="alert">{formError}</p>}</div><div className="modal-footer"><button type="button" className="button secondary" onClick={closeEditor} disabled={busy}>取消</button><button type="submit" className="button primary" disabled={busy||(editor.kind==="followup"&&!data.influencers.length)}>{busy?"正在保存…":"保存"}</button></div>
    </form></Modal>}
    {selected&&<Modal title="达人详情" onClose={()=>setDetail(null)} wide><div className="detail-body"><div className="detail-person"><Avatar name={selected.name}/><div><h2>{selected.name}</h2><p>{selected.platform} · {selected.handle||"未填写账号"}</p></div><Badge status={selected.status}/></div><div className="detail-metrics"><div><small>粉丝数量</small><strong>{compact(selected.followers)}</strong></div><div><small>互动率</small><strong>{selected.engagement}%</strong></div><div><small>合作报价</small><strong>{money(selected.quote)}</strong></div></div><dl className="detail-fields"><dt>内容领域</dt><dd>{selected.category}</dd><dt>所在城市</dt><dd>{selected.city||"未填写"}</dd><dt>联系方式</dt><dd>{selected.contact||"未填写"}</dd><dt>档案备注</dt><dd className="pre-wrap">{selected.notes||"暂无备注"}</dd></dl><h3 className="detail-section-title">关联项目</h3><div className="detail-projects">{data.projects.filter(p=>p.influencerIds.includes(selected.id)).map(p=><button key={p.id} onClick={()=>openEditor({kind:"project",value:p})}>{p.name}<Badge status={p.status}/></button>)}{!data.projects.some(p=>p.influencerIds.includes(selected.id))&&<p className="muted">暂未关联项目</p>}</div><h3 className="detail-section-title">近期跟进</h3>{data.followups.filter(f=>f.influencerId===selected.id).slice(0,4).map(f=><div className="detail-followup" key={f.id}><small>{f.date} · {f.channel}</small><p>{f.content}</p>{f.nextDate&&<small>下次跟进：{f.nextDate}</small>}</div>)}{!data.followups.some(f=>f.influencerId===selected.id)&&<p className="muted">暂无跟进记录</p>}</div><div className="modal-footer detail-footer"><button className="button danger-button" onClick={()=>{setDetail(null);setFormError("");setDeletion({kind:"influencers",id:selected.id,name:selected.name});}}><Icon name="trash" size={16}/>删除档案</button><div><button className="button secondary" onClick={()=>openEditor({kind:"followup",influencerId:selected.id})}>添加跟进</button><button className="button primary" onClick={()=>openEditor({kind:"influencer",value:selected})}><Icon name="edit" size={16}/>编辑档案</button></div></div></Modal>}
    {deletion&&<Modal title="确认删除" onClose={()=>{if(!busy){setDeletion(null);setFormError("");}}}><div className="form-body"><p>确定删除「{deletion.name}」吗？</p><p className="muted">{deletion.kind==="influencers"?"该达人的跟进记录和项目关联也将删除，项目本身保留。":"此操作无法撤销。"}</p>{formError&&<p role="alert" className="form-error">{formError}</p>}</div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={()=>{setDeletion(null);setFormError("");}}>取消</button><button className="button destructive" disabled={busy} onClick={()=>void mutate(`/api/${deletion.kind}/${deletion.id}`,"DELETE",undefined,"已删除")}>{busy?"删除中…":"确认删除"}</button></div></Modal>}
  </div>;

  function renderPeople(rows:Influencer[]) {
    return <div className="table-scroll"><table><thead><tr><th>达人信息</th><th>内容领域</th><th>粉丝数量</th><th>互动率</th><th>合作报价</th><th>合作状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><button className="person-cell" onClick={()=>setDetail(p.id)}><Avatar name={p.name}/><span><strong>{p.name}</strong><small><span className={`platform-mark platform-${PLATFORMS.indexOf(p.platform as typeof PLATFORMS[number])%3}`}/>{p.platform}<span className="account">{p.handle?` · ${p.handle}`:""}</span></small></span></button></td><td><span className="category-tag">{p.category}</span></td><td className="numeric">{compact(p.followers)}</td><td className="numeric">{p.engagement}%</td><td className="numeric">{money(p.quote)}</td><td><Badge status={p.status}/></td><td><button className="icon-button" onClick={()=>openEditor({kind:"influencer",value:p})} aria-label={`编辑 ${p.name}`}><Icon name="edit" size={17}/></button></td></tr>)}</tbody></table></div>;
  }
}
