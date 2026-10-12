import { getService } from "@/server/container";
import { endpoint, json, query } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => endpoint(async () => json(await getService().slots(query(request))));
