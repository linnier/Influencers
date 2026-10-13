import { api } from "@/lib/http";
import { getData } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return api(getData); }
