import { randomUUID } from "node:crypto";
import { database, transaction } from "./db";
import { PLATFORMS, CATEGORIES, INFLUENCER_STATUSES, PROJECT_STATUSES, CHANNELS } from "./types";
import type { Influencer, Project, Followup, WorkspaceData } from "./types";

export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Input = Record<string, unknown>;
export function object(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("请求内容必须为对象");
  return value as Input;
}
function text(b: Input, key: string, label: string, required = false, max = 200) {
  const v = b[key] ?? "";
  if (typeof v !== "string") throw new InputError(`${label}必须为文本`);
  const s = v.trim();
  if ((required && !s) || s.length > max) throw new InputError(`${label}${required ? "不能为空，且" : ""}不能超过 ${max} 字`);
  return s;
}
function choice(b: Input, key: string, label: string, values: readonly string[]) {
  const v = text(b, key, label, true);
  if (!values.includes(v)) throw new InputError(`${label}选项无效`);
  return v;
}
function number(b: Input, key: string, label: string, max: number, integer = false) {
  const v = b[key] ?? 0;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max || (integer && !Number.isSafeInteger(v)))
    throw new InputError(`${label}必须为 0 至 ${max} 的${integer ? "整数" : "数值"}`);
  return v;
}
function date(b: Input, key: string, label: string, required = false) {
  const v = text(b, key, label, required, 10);
  if (!v) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)
    throw new InputError(`${label}日期无效`);
  return v;
}
export function getData(): WorkspaceData {
  const db = database();
  const influencers = db.prepare("SELECT * FROM influencers ORDER BY createdAt DESC, id").all() as unknown as Influencer[];
  const projectRows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC, id").all();
  const members = db.prepare("SELECT projectId, influencerId FROM project_influencers").all();
  const projects = projectRows.map(p => ({ ...p, influencerIds: members.filter(m => m.projectId === p.id).map(m => m.influencerId) })) as unknown as Project[];
  const followups = db.prepare("SELECT * FROM followups ORDER BY date DESC, createdAt DESC, id").all() as unknown as Followup[];
  return { influencers, projects, followups };
}
function exists(table: "influencers" | "projects" | "followups", id: string) {
  if (!database().prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)) throw new InputError("记录不存在或已删除", 404);
}
export function saveInfluencer(body: unknown, id?: string): Influencer {
  const b = object(body);
  if (id) exists("influencers", id);
  const old = id ? database().prepare("SELECT createdAt FROM influencers WHERE id = ?").get(id) : undefined;
  const now = new Date().toISOString();
  const value: Influencer = {
    id: id || randomUUID(), name: text(b, "name", "达人名称", true, 80), handle: text(b, "handle", "平台账号", false, 100),
    platform: choice(b, "platform", "平台", PLATFORMS), category: choice(b, "category", "领域", CATEGORIES),
    followers: number(b, "followers", "粉丝数", 1e10, true), engagement: number(b, "engagement", "互动率", 100),
    quote: number(b, "quote", "报价", 1e9), status: choice(b, "status", "合作状态", INFLUENCER_STATUSES),
    contact: text(b, "contact", "联系方式", false, 200), city: text(b, "city", "城市", false, 80),
    notes: text(b, "notes", "备注", false, 4000), createdAt: String(old?.createdAt || now), updatedAt: now,
  };
  database().prepare(`INSERT INTO influencers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, handle=excluded.handle, platform=excluded.platform,
    category=excluded.category, followers=excluded.followers, engagement=excluded.engagement,
    quote=excluded.quote, status=excluded.status, contact=excluded.contact, city=excluded.city,
    notes=excluded.notes, updatedAt=excluded.updatedAt`).run(...Object.values(value));
  return value;
}
export function saveProject(body: unknown, id?: string): Project {
  const b = object(body);
  if (id) exists("projects", id);
  const old = id ? database().prepare("SELECT createdAt FROM projects WHERE id = ?").get(id) : undefined;
  const startDate = date(b, "startDate", "开始日期"), endDate = date(b, "endDate", "结束日期");
  if (startDate && endDate && endDate < startDate) throw new InputError("结束日期不能早于开始日期");
  const ids = b.influencerIds ?? [];
  if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== "string")) throw new InputError("关联达人无效");
  const influencerIds = [...new Set(ids as string[])];
  for (const member of influencerIds) exists("influencers", member);
  const now = new Date().toISOString();
  const value: Project = {
    id: id || randomUUID(), name: text(b, "name", "项目名称", true, 120), brand: text(b, "brand", "品牌", true, 120),
    budget: number(b, "budget", "预算", 1e10), status: choice(b, "status", "项目状态", PROJECT_STATUSES),
    startDate, endDate, description: text(b, "description", "项目说明", false, 4000),
    createdAt: String(old?.createdAt || now), updatedAt: now, influencerIds,
  };
  transaction(() => {
    const { influencerIds: members, ...row } = value;
    database().prepare(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, budget=excluded.budget,
      status=excluded.status, startDate=excluded.startDate, endDate=excluded.endDate,
      description=excluded.description, updatedAt=excluded.updatedAt`).run(...Object.values(row));
    database().prepare("DELETE FROM project_influencers WHERE projectId = ?").run(value.id);
    for (const member of members) database().prepare("INSERT INTO project_influencers VALUES (?, ?)").run(value.id, member);
  });
  return value;
}
export function saveFollowup(body: unknown): Followup {
  const b = object(body), influencerId = text(b, "influencerId", "达人", true);
  exists("influencers", influencerId);
  const recordedDate = date(b, "date", "跟进日期", true), nextDate = date(b, "nextDate", "下次跟进日期");
  if (nextDate && nextDate < recordedDate) throw new InputError("下次跟进日期不能早于本次跟进日期");
  const value: Followup = {
    id: randomUUID(), influencerId, channel: choice(b, "channel", "沟通方式", CHANNELS), date: recordedDate,
    nextDate, content: text(b, "content", "跟进内容", true, 4000), createdAt: new Date().toISOString(),
  };
  database().prepare("INSERT INTO followups VALUES (?, ?, ?, ?, ?, ?, ?)").run(...Object.values(value));
  return value;
}
export function remove(kind: "influencers" | "projects" | "followups", id: string) {
  exists(kind, id);
  database().prepare(`DELETE FROM ${kind} WHERE id = ?`).run(id);
}
export function loadDemo() {
  return transaction(() => {
    const data = getData();
    if (data.influencers.length || data.projects.length || data.followups.length) throw new InputError("仅可在空数据库中载入演示数据", 409);
    const names = ["林小夏", "阿泽的日常", "许知意", "可可食记", "科技阿辰", "橙子同学"];
    const people = names.map((name, i) => saveInfluencer({name, handle: `demo_${i + 1}`, platform: PLATFORMS[i % 3],
      category: CATEGORIES[i], followers: [128000, 352000, 89000, 216000, 540000, 67000][i],
      engagement: [5.8, 4.2, 7.1, 6.3, 3.9, 8.2][i], quote: [6800, 15000, 4500, 8000, 18000, 3200][i],
      status: INFLUENCER_STATUSES[i % 3], city: ["上海", "杭州", "北京"][i % 3], contact: "", notes: "演示档案，请替换为真实业务数据。"}));
    // This function owns the transaction; avoid nested saveProject transactions.
    const now = new Date().toISOString();
    const p = randomUUID();
    database().prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(p, "秋日生活提案 · 演示", "演示品牌", 50000, "执行中", "", "", "用于体验合作项目管理", now, now);
    for (const person of people.slice(0, 3)) database().prepare("INSERT INTO project_influencers VALUES (?, ?)").run(p, person.id);
    const today = new Date().toISOString().slice(0, 10);
    saveFollowup({influencerId: people[0].id, channel: "微信", date: today, nextDate: today, content: "演示记录：已沟通内容方向，待确认合作档期。"});
    return getData();
  });
}
