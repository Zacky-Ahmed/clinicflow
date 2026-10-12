import { getService } from "@/server/container";
import { body, endpoint, json, query } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => endpoint(async () => json(await getService().list(query(request))));
export const POST = (request: Request) => endpoint(async () => json(await getService().create(await body(request)), 201));
