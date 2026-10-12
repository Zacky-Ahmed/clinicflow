import assert from "node:assert/strict";
import { DateTime } from "luxon";

// Run against the local development server only. Creates and removes its own fictional appointment.
const base = "http://127.0.0.1:3001";
async function call(path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

const clinic = await call("/api/clinic");
assert.equal(clinic.status, 200);
const { timezone, doctors } = clinic.body.data;
let day = DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
while (day.weekday > 5) day = day.plus({ days: 1 });
const params = new URLSearchParams({ doctorId: doctors[0].id, from: day.toUTC().toISO(), durationMinutes: "30" });
const available = await call(`/api/availability?${params}`);
assert.equal(available.status, 200);
assert.ok(available.body.data.slots.length);
const startAt = available.body.data.slots[0].startAt;
const payload = { patientName: "Smoke Test Fictional Patient", doctorId: doctors[0].id, appointmentType: "consultation", startAt };
let id;
try {
  const created = await call("/api/appointments", "POST", payload);
  assert.equal(created.status, 201);
  id = created.body.data.id;
  const conflict = await call("/api/appointments", "POST", payload);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "SCHEDULE_CONFLICT");
  assert.equal(conflict.body.error.details.suggestions.length, 3);
  const edited = await call(`/api/appointments/${id}`, "PATCH", { patientName: "Smoke Test Updated Fictional Patient", expectedVersion: 1 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.version, 2);
  const stale = await call(`/api/appointments/${id}`, "PATCH", { patientName: "Stale Fictional Update", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  const confirmed = await call(`/api/appointments/${id}/status`, "PATCH", { status: "confirmed", expectedVersion: 2 });
  assert.equal(confirmed.status, 200);
  const filtered = await call("/api/appointments?q=Smoke%20Test&status=confirmed");
  assert.ok(filtered.body.data.items.some((a) => a.id === id));
  const activity = await call(`/api/appointments/${id}/activity`);
  assert.equal(activity.body.data.length, 3);
  const date = DateTime.fromISO(startAt, { zone: timezone }).toISODate();
  const dashboard = await call(`/api/dashboard?date=${date}`);
  assert.ok(dashboard.body.data.doctors.flatMap((d) => d.appointments).some((a) => a.id === id));
  const removed = await call(`/api/appointments/${id}?expectedVersion=3`, "DELETE");
  assert.equal(removed.status, 204);
  assert.equal((await call(`/api/appointments/${id}`)).status, 404);
  id = undefined;
  console.log("HTTP smoke passed: create, conflict suggestions, edit, stale version, status, filter, activity, dashboard, delete.");
} finally {
  if (id) {
    const current = await call(`/api/appointments/${id}`);
    if (current.status === 200) await call(`/api/appointments/${id}?expectedVersion=${current.body.data.version}`, "DELETE");
  }
}
