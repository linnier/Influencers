import { api, sameOrigin } from "@/lib/http";
import { remove } from "@/lib/service";
export const runtime = "nodejs";
export function DELETE(request: Request, context: {params: Promise<{id: string}>}) { return api(async () => { sameOrigin(request); remove("followups", (await context.params).id); return {ok:true}; }); }
