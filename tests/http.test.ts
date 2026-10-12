import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "@/app/api/appointments/route";
import { GET as get, PATCH as update, DELETE as remove } from "@/app/api/appointments/[id]/route";
import { PATCH as status } from "@/app/api/appointments/[id]/status/route";
import { GET as activity } from "@/app/api/appointments/[id]/activity/route";
import { GET as slots } from "@/app/api/availability/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as ready } from "@/app/api/ready/route";
import { GET as health } from "@/app/api/health/route";
import { body, endpoint } from "@/server/http";
import type { AppointmentService } from "@/services/appointment-service";

const base = "http://localhost:3001";
const data = { patientName: "Demo Patient", doctorId: "11111111-1111-4111-8111-111111111111",
  appointmentType: "consultation", startAt: "2026-10-12T09:00:00+05:30" };
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (path: string, method = "GET", payload?: unknown) => new Request(`${base}${path}`, {
  method, ...(payload !== undefined ? { body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } } : {}),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z"));
  vi.stubEnv("CLINIC_TIMEZONE", "Asia/Colombo");
  delete (globalThis as typeof globalThis & { clinicflowService?: AppointmentService }).clinicflowService;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("HTTP contract", () => {
  it("handles create, get, filter, edit, status, activity and delete", async () => {
    const created = await create(req("/api/appointments", "POST", data));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { data: a } = await created.json();
    const ctx = context(a.id);
    expect((await get(req(`/api/appointments/${a.id}`), ctx)).status).toBe(200);
    expect((await (await list(req("/api/appointments?q=demo&date=2026-10-12"))).json()).data.total).toBe(1);
    const edited = await update(req(`/api/appointments/${a.id}`, "PATCH", { patientName: "Demo Updated", expectedVersion: 1 }), ctx);
    expect((await edited.json()).data.version).toBe(2);
    const confirmed = await status(req(`/api/appointments/${a.id}/status`, "PATCH", { status: "confirmed", expectedVersion: 2 }), ctx);
    expect((await confirmed.json()).data.status).toBe("confirmed");
    expect((await (await activity(req(`/api/appointments/${a.id}/activity`), ctx)).json()).data).toHaveLength(3);
    expect((await remove(req(`/api/appointments/${a.id}?expectedVersion=3`, "DELETE"), ctx)).status).toBe(204);
    expect((await get(req(`/api/appointments/${a.id}`), ctx)).status).toBe(404);
  });

  it("returns structured conflicts and availability", async () => {
    await create(req("/api/appointments", "POST", data));
    const conflict = await create(req("/api/appointments", "POST", data));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.details.suggestions).toHaveLength(3);
    const response = await slots(req(`/api/availability?doctorId=${data.doctorId}&from=2026-10-12T03%3A30%3A00Z`));
    expect((await response.json()).data.slots).toHaveLength(3);
    expect((await (await dashboard(req("/api/dashboard?date=2026-10-12"))).json()).data.total).toBe(1);
  });

  it("rejects malformed JSON and unsupported media", async () => {
    const invalid = new Request(`${base}/api/appointments`, { method: "POST", body: "{", headers: { "Content-Type": "application/json" } });
    expect((await create(invalid)).status).toBe(400);
    expect((await create(new Request(`${base}/api/appointments`, { method: "POST", body: "x" }))).status).toBe(415);
  });

  it("caps body size and rejects cross-origin writes", async () => {
    expect((await create(req("/api/appointments", "POST", { ...data, patientName: "x".repeat(17000) }))).status).toBe(413);
    const request = req("/api/appointments", "POST", data);
    request.headers.set("origin", "https://untrusted.example");
    expect((await create(request)).status).toBe(403);
  });

  it("rejects unknown/duplicate parameters, missing versions, and bad IDs", async () => {
    expect((await list(req("/api/appointments?unknown=x"))).status).toBe(400);
    expect((await list(req("/api/appointments?page=1&page=2"))).status).toBe(400);
    expect((await remove(req("/api/appointments/x", "DELETE"), context(data.doctorId))).status).toBe(400);
    expect((await get(req("/api/appointments/not-id"), context("not-id"))).status).toBe(400);
  });

  it("does not echo submitted values in validation errors", async () => {
    const response = await create(req("/api/appointments", "POST", { ...data, secret: "private-marker" }));
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain("private-marker");
  });

  it("keeps liveness up but refuses production readiness without MongoDB", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(health().status).toBe(200);
    expect((await ready()).status).toBe(503);
    expect((await list(req("/api/appointments"))).status).toBe(503);
  });

  it("sanitizes unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await endpoint(() => { throw new Error("database-password-private"); });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database-password-private");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("database-password-private");
    spy.mockRestore();
  });

  it("accepts same-origin JSON", async () => {
    const request = req("/api/appointments", "POST", data);
    request.headers.set("origin", base);
    expect(await body(request)).toEqual(data);
  });
});
