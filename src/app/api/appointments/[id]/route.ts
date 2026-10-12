import { deleteSchema } from "@/domain/validation";
import { getService } from "@/server/container";
import { body, checkOrigin, endpoint, json, query, type AppointmentContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (_request: Request, context: AppointmentContext) => endpoint(async () =>
  json(await getService().get((await context.params).id)));
export const PATCH = (request: Request, context: AppointmentContext) => endpoint(async () =>
  json(await getService().update((await context.params).id, await body(request))));
export const DELETE = (request: Request, context: AppointmentContext) => endpoint(async () => {
  checkOrigin(request);
  const { expectedVersion } = deleteSchema.parse(query(request));
  await getService().delete((await context.params).id, expectedVersion);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
