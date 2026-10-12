import { getService } from "@/server/container";
import { endpoint, json, type AppointmentContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (_request: Request, context: AppointmentContext) => endpoint(async () =>
  json(await getService().activity((await context.params).id)));
