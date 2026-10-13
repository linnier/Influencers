import { api, sameOrigin } from "@/lib/http";
import { loadDemo } from "@/lib/service";
export const runtime = "nodejs";
export function POST(request: Request) { return api(() => { sameOrigin(request); return loadDemo(); }, 201); }
