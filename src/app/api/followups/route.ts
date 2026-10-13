import { api, sameOrigin } from "@/lib/http";
import { saveFollowup } from "@/lib/service";
export const runtime = "nodejs";
export function POST(request: Request) { return api(async () => { sameOrigin(request); return saveFollowup(await request.json()); }, 201); }
