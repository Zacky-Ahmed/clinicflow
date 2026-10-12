import { getService } from "@/server/container";
import { body, endpoint, json, type AppointmentContext } from "@/server/http";

export const runtime = "nodejs";
export const PATCH = (request: Request, context: AppointmentContext) => endpoint(async () =>
  json(await getService().changeStatus((await context.params).id, await body(request))));
