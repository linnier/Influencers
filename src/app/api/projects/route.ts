import { api, sameOrigin } from "@/lib/http";
import { saveProject } from "@/lib/service";
export const runtime = "nodejs";
export function POST(request: Request) { return api(async () => { sameOrigin(request); return saveProject(await request.json()); }, 201); }
