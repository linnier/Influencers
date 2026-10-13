import ExcelJS from "exceljs";
import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { database, transaction } from "./db";
import { InputError, saveInfluencer } from "./service";
import type { Influencer } from "./types";

const platforms: Record<string, string> = { XHS: "小红书", Instagram: "Instagram", Tiktok: "TikTok" };
const hosts: Record<string, string[]> = {
  "小红书": ["www.xiaohongshu.com", "xhslink.com", "xhslink.cn"],
  Instagram: ["www.instagram.com", "instagram.com"], TikTok: ["www.tiktok.com", "tiktok.com"],
};
type SourceRow = { row: number; sheet: string; name: string; followers: number; category: string; note: string; contact: string; extra: string[]; handle: string };
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value).trim();
  if ("formula" in value || "sharedFormula" in value) return String(value.result ?? "").trim();
  if ("hyperlink" in value) return value.text.trim();
  if ("richText" in value) return value.richText.map(item => item.text).join("").trim();
  return cell.text.trim();
}
function contentCategory(value: string) {
  const choices: [string, string[]][] = [
    ["美食探店", ["美食", "探店", "food", "饮品", "咖啡", "抹茶"]],
    ["美妆护肤", ["美妆", "护肤", "beauty", "makeup"]],
    ["时尚穿搭", ["时尚", "穿搭", "fashion"]], ["运动健康", ["运动", "健身", "健康", "足球", "羽毛球", "骑行", "fitness"]],
    ["母婴亲子", ["母婴", "亲子", "家庭", "family"]], ["数码科技", ["数码", "科技", "tech"]],
    ["生活方式", ["生活", "lifestyle", "vlog", "plog", "旅行", "旅游", "情侣", "好物", "摄影"]],
  ];
  return choices.find(([, words]) => words.some(word => value.toLowerCase().includes(word)))?.[0] ?? "其他";
}
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];
async function compatibleWorkbook(bytes: Buffer) {
  // WPS may mix an empty <t> and rich-text <r> inside one shared string.
  // Preserve the visible text and shared-string order before ExcelJS reads it.
  const archive = await JSZip.loadAsync(bytes);
  const shared = archive.file("xl/sharedStrings.xml");
  if (!shared) return bytes;
  const strings: string[] = [];
  let inString = false, inText = false, phonetic = 0, value = "";
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", tag => {
    if (tag.local === "si") { inString = true; value = ""; }
    if (inString && tag.local === "rPh") phonetic++;
    if (inString && tag.local === "t" && !phonetic) inText = true;
  });
  const append = (text: string) => { if (inText) value += text; };
  parser.on("text", append); parser.on("cdata", append);
  parser.on("closetag", tag => {
    if (tag.local === "t") inText = false;
    if (tag.local === "rPh") phonetic--;
    if (tag.local === "si") { strings.push(value); inString = false; }
  });
  parser.write(await shared.async("string")).close();
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  archive.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(text => `<si><t xml:space="preserve">${escape(text)}</t></si>`).join("")}</sst>`);
  return archive.generateAsync({ type: "nodebuffer" });
}
export async function importWorkbook(bytes: Buffer, filename: string) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await compatibleWorkbook(bytes) as unknown as ExcelJS.Buffer); }
  catch { throw new InputError("无法读取 Excel，请选择原始 .xlsx 文件"); }
  if (!workbook.worksheets.length || workbook.worksheets.some(sheet => !platforms[sheet.name]))
    throw new InputError("工作表须命名为 XHS、Instagram 或 Tiktok，使用原博主清单的列顺序");
  const groups = new Map<string, { platform: string; link: string; rows: SourceRow[] }>();
  let sourceRows = 0;
  for (const sheet of workbook.worksheets) {
    const platform = platforms[sheet.name];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const values = Array.from({ length: Math.max(7, row.cellCount) }, (_, i) => cellText(row.getCell(i + 1)));
      if (values.every(value => !value)) return;
      if (++sourceRows > 10000) throw new InputError("一次最多导入 10000 行");
      const location = `${sheet.name} 第 ${index} 行`;
      const name = values[1].replace(/\s+/g, " ");
      const followers = Number(values[2]);
      if (!name || !values[2] || !Number.isSafeInteger(followers) || followers < 0 || followers > 1e10)
        throw new InputError(`${location}：请填写昵称和有效的整数粉丝数`);
      const linkValue = row.getCell(5).value;
      const rawLink = values[4].startsWith("http") ? values[4] : linkValue && typeof linkValue === "object" && "hyperlink" in linkValue ? linkValue.hyperlink : values[4];
      let url: URL;
      try { url = new URL(rawLink); } catch { throw new InputError(`${location}：主页链接无效`); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !hosts[platform].includes(url.hostname))
        throw new InputError(`${location}：请使用对应平台的主页链接`);
      let path = url.pathname.replace(/\/+$/, "");
      if (platform === "Instagram" || platform === "TikTok") path = path.toLowerCase();
      if (platform === "Instagram") path = "/" + path.split("/").filter(Boolean)[0];
      if (!path || path === "/undefined") throw new InputError(`${location}：缺少主页账号`);
      const host = ["instagram.com", "tiktok.com"].includes(url.hostname) ? `www.${url.hostname}` : url.hostname;
      const link = `https://${host}${path}`;
      let handle = "";
      try { handle = ["xhslink.com", "xhslink.cn"].includes(host) ? "" : decodeURIComponent(path.split("/").at(-1)!).replace(/^@/, ""); }
      catch { throw new InputError(`${location}：主页链接编码无效`); }
      const value: SourceRow = { row: index, sheet: sheet.name, name, followers, category: values[3], note: values[5], contact: values[6],
        extra: values.slice(7).flatMap((text, i) => text ? [`第${i + 8}列：${text}`] : []), handle };
      const key = `${platform}|${link}`;
      const group = groups.get(key);
      if (group) group.rows.push(value); else groups.set(key, { platform, link, rows: [value] });
    });
  }
  if (!sourceRows) throw new InputError("Excel 中没有可导入的达人");
  const candidates = [...groups.values()].map(({ platform, link, rows }) => {
    const first = rows[0], categories = unique(rows.map(row => row.category)), originalNotes = unique(rows.map(row => row.note));
    const contacts = unique(rows.map(row => row.contact)), combinedContact = contacts.join("；");
    const notes = [
      `导入来源：${filename} / ${first.sheet} / Excel 行 ${rows.map(row => row.row).join(", ")}`,
      `主页链接：${link}`, `原始类型：${categories.join("；") || "未填写"}`,
      ...(originalNotes.length ? [`原始备注：\n${originalNotes.join("\n\n")}`] : []),
      ...(contacts.length > 1 ? [`原始联系方式：${contacts.join("；")}`] : []), ...unique(rows.flatMap(row => row.extra)),
      ...(new Set(rows.map(row => row.followers)).size > 1 ? [`重复行粉丝量不同，采用首行值；原值：${rows.map(row => `行${row.row}=${row.followers}`).join("；")}`] : []),
      ...(new Set(rows.map(row => row.name)).size > 1 ? [`原始昵称：${unique(rows.map(row => row.name)).join("；")}`] : []),
      "互动率和人民币报价未提供，字段中的 0 仅为未录入占位；外币/套餐报价见原始备注，未经换算。",
    ];
    return { link, value: { name: first.name, handle: first.handle, platform, category: contentCategory(categories.join("；")),
      followers: first.followers, engagement: 0, quote: 0, status: originalNotes.some(note => note.includes("已合作")) ? "已合作" : "待联系",
      contact: combinedContact.length <= 200 ? combinedContact : contacts[0], city: "", notes: notes.join("\n\n") } };
  });
  const accounts = candidates.filter(record => record.value.handle).map(record => `${record.value.platform}|${record.value.handle}`);
  if (new Set(accounts).size !== accounts.length) throw new InputError("存在无法确定是否同一账号的链接，请先核对 Excel");
  return transaction(() => {
    const existing = database().prepare("SELECT * FROM influencers").all() as unknown as Influencer[];
    const accountKeys = new Set(existing.filter(record => record.handle).map(record => `${record.platform}|${record.handle.toLowerCase()}`));
    const profileKeys = new Set(existing.flatMap(record => {
      const link = record.notes.match(/^主页链接：(.*)$/m)?.[1];
      return link ? [`${record.platform}|${link}`] : [];
    }));
    let inserted = 0, skipped = 0;
    for (const { link, value } of candidates) {
      if (profileKeys.has(`${value.platform}|${link}`) || value.handle && accountKeys.has(`${value.platform}|${value.handle.toLowerCase()}`)) { skipped++; continue; }
      saveInfluencer(value); inserted++;
    }
    return { sourceRows, uniqueRecords: candidates.length, mergedDuplicateRows: sourceRows - candidates.length, inserted, skipped };
  });
}
