import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { DateTime } from "luxon";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { MongoAppointmentRepository } from "@/repositories/mongo-appointment-repository";
import { AppointmentService } from "@/services/appointment-service";

// Explicit opt-in command only. Records are isolated by a random fictional doctor ID.
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI in .env before running MongoDB integration tests");
const databaseName = process.env.MONGODB_DB_NAME || "clinicflow";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
const repo = new MongoAppointmentRepository(client, databaseName);
const doctor = { id: randomUUID(), name: "Integration Fictional Doctor", specialty: "Demo only" };
const service = new AppointmentService(repo, [doctor], "Asia/Colombo");
const ids = new Set<string>();
let day = DateTime.now().setZone("Asia/Colombo").plus({ days: 1 }).startOf("day");
while (day.weekday > 5) day = day.plus({ days: 1 });
const input = (hour: number) => ({ patientName: "Integration Fictional Patient", doctorId: doctor.id,
  appointmentType: "consultation", startAt: day.set({ hour }).toISO() });
beforeAll(async () => { await repo.ready(); });
afterAll(async () => {
  try {
    const db = client.db(databaseName);
    const appointments = await db.collection("appointments").find({ doctorId: doctor.id }).toArray();
    for (const a of appointments) ids.add(a.id);
    await db.collection("appointments").deleteMany({ doctorId: doctor.id });
    await db.collection("appointment_events").deleteMany({ appointmentId: { $in: [...ids] } });
  } finally { await client.close(); }
});

it("persists BSON dates and reads bookings from a fresh database connection", async () => {
  const a = await service.create(input(9)); ids.add(a.id);
  const stored = await client.db(databaseName).collection("appointments").findOne({ id: a.id });
  expect(stored?.startAt).toBeInstanceOf(Date);
  const other = new MongoClient(uri!);
  try {
    const fresh = new AppointmentService(new MongoAppointmentRepository(other, databaseName), [doctor], "Asia/Colombo");
    expect(await fresh.get(a.id)).toEqual(a);
    expect((await fresh.activity(a.id))[0].action).toBe("created");
  } finally { await other.close(); }
});

it("allows only one of six competing MongoDB bookings", async () => {
  const other = new MongoClient(uri!);
  try {
    const independent = new AppointmentService(new MongoAppointmentRepository(other, databaseName), [doctor], "Asia/Colombo");
    await independent.ready();
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => (i % 2 ? independent : service).create(input(10))));
    for (const r of results) if (r.status === "fulfilled") ids.add(r.value.id);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "SCHEDULE_CONFLICT" });
  } finally { await other.close(); }
});

it("checks versions, rolls back failed edits, and persists status and delete events", async () => {
  const a = await service.create(input(13)); ids.add(a.id);
  const b = await service.create(input(14)); ids.add(b.id);
  await expect(service.update(a.id, { durationMinutes: 90, expectedVersion: 1 })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
  expect((await service.get(a.id)).version).toBe(1);
  expect(await service.activity(a.id)).toHaveLength(1);
  const edited = await service.update(a.id, { patientName: "Updated Fictional Patient", expectedVersion: 1 });
  expect(edited.version).toBe(2);
  await expect(service.delete(a.id, 1)).rejects.toMatchObject({ code: "STALE_VERSION" });
  await service.changeStatus(a.id, { status: "cancelled", expectedVersion: 2 });
  const replacement = await service.create(input(13)); ids.add(replacement.id);
  await service.delete(a.id, 3);
  await expect(service.get(a.id)).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  expect((await service.activity(a.id))[0].action).toBe("deleted");
  expect((await service.list({ doctorId: doctor.id, q: "Fictional" })).total).toBeGreaterThan(0);
});

it("aborts the transaction when a callback fails after modifying a draft", async () => {
  const a = await service.create(input(15)); ids.add(a.id);
  await expect(repo.write((state) => {
    state.appointments[0].patientName = "Must not persist";
    state.appointments[0].version++;
    throw new AppError("TEST_ABORT", "Intentional rollback test");
  }, { id: a.id })).rejects.toMatchObject({ code: "TEST_ABORT" });
  expect(await service.get(a.id)).toEqual(a);
});
