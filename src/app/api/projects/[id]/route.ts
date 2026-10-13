import { api, sameOrigin } from "@/lib/http";
import { saveProject, remove } from "@/lib/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function PUT(request: Request, context: Context) { return api(async () => { sameOrigin(request); return saveProject(await request.json(), (await context.params).id); }); }
export function DELETE(request: Request, context: Context) { return api(async () => { sameOrigin(request); remove("projects", (await context.params).id); return {ok:true}; }); }
