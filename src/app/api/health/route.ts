import { storageMode } from "@/server/container";

export const dynamic = "force-dynamic";
export const GET = () => Response.json({ status: "ok", service: "clinicflow", storage: storageMode(),
  persistent: storageMode() === "mongodb", databaseChecked: false }, { headers: { "Cache-Control": "no-store" } });
