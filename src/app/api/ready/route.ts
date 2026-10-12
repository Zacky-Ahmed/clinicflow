import { getService } from "@/server/container";
import { endpoint, json } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = () => endpoint(() => { getService(); return json({ ready: true, mode: "development", persistent: false }); });
