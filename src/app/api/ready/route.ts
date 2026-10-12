import { getService, storageMode } from "@/server/container";
import { endpoint, json } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = () => endpoint(async () => {
  await getService().ready();
  return json({ ready: true, storage: storageMode(), persistent: storageMode() === "mongodb" });
});
