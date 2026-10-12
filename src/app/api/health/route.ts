export const dynamic = "force-dynamic";
export const GET = () => Response.json({ status: "ok", service: "clinicflow", storage: "memory",
  persistent: false, readyForDeployment: false }, { headers: { "Cache-Control": "no-store" } });
