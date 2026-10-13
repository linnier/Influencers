import { api, sameOrigin } from "@/lib/http";
import { importWorkbook } from "@/lib/import-workbook";
import { InputError } from "@/lib/service";
export const runtime = "nodejs";
export function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    if (Number(request.headers.get("content-length")) > 10 * 1024 * 1024) throw new InputError("Excel 文件不能超过 10 MB", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { throw new InputError("请选择 Excel 文件"); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw new InputError("请选择 .xlsx 格式的博主清单");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new InputError("Excel 文件须大于 0 且不超过 10 MB");
    return importWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
  });
}
