import { daySchema } from "@/domain/validation";
import { getService } from "@/server/container";
import { endpoint, json, query } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => endpoint(async () => {
  const { date } = daySchema.parse(query(request));
  return json(await getService().dailySummary(date));
});
