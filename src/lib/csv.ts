import type { Influencer } from "./types";
function cell(value: string | number) {
  let s = String(value);
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function influencersCSV(rows: Influencer[]) {
  const headings = ["达人名称", "平台账号", "平台", "领域", "粉丝数", "互动率(%)", "报价(元)", "合作状态", "联系方式", "城市", "备注"];
  return "\uFEFF" + [headings, ...rows.map(x => [x.name, x.handle, x.platform, x.category, x.followers, x.engagement, x.quote, x.status, x.contact, x.city, x.notes])].map(row => row.map(cell).join(",")).join("\r\n");
}
