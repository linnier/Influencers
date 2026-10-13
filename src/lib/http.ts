import { InputError } from "./service";
export async function api(run: () => unknown | Promise<unknown>, status = 200) {
  try { return Response.json(await run(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof InputError) return Response.json({error: error.message}, {status: error.status});
    if (error instanceof SyntaxError) return Response.json({error: "JSON 格式无效"}, {status: 400});
    console.error("API operation failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({error: "服务器处理失败，请稍后重试"}, {status: 500});
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  // Next.js may normalize request.url to localhost; the actual Host retains
  // the browser's origin (including its port).
  const host = request.headers.get("host") || new URL(request.url).host;
  let originHost: string | undefined;
  if (origin) {
    try { originHost = new URL(origin).host; }
    catch { throw new InputError("不允许跨站写入", 403); }
  }
  if ((origin && originHost !== host) || site === "cross-site") throw new InputError("不允许跨站写入", 403);
}
