import { api, sameOrigin } from "@/lib/http";
import { saveInfluencer } from "@/lib/service";
export const runtime = "nodejs";
export function POST(request: Request) { return api(async () => { sameOrigin(request); return saveInfluencer(await request.json()); }, 201); }
