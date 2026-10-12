import { beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { doctors } from "@/config/doctors";
import { AppError } from "@/domain/errors";
import { dayBounds, suggestSlots } from "@/domain/scheduling";
import { MemoryAppointmentRepository } from "@/repositories/memory-appointment-repository";
import { AppointmentService } from "@/services/appointment-service";

const doctorId = doctors[0].id;
const input = (startAt = "2026-10-12T09:00:00+05:30", extra = {}) => ({
  patientName: "Demo Taylor", doctorId, appointmentType: "consultation", startAt, ...extra,
});
let now: Date;
let repository: MemoryAppointmentRepository;
let service: AppointmentService;
beforeEach(() => {
  now = new Date("2026-10-12T02:00:00Z");
  repository = new MemoryAppointmentRepository();
  service = new AppointmentService(repository, doctors, "Asia/Colombo", () => now);
});

describe("appointments and scheduling", () => {
  it("normalizes timestamps, trims names, and applies type duration defaults", async () => {
    const a = await service.create(input(undefined, { patientName: "  Demo Taylor  " }));
    expect(a).toMatchObject({ patientName: "Demo Taylor", startAt: "2026-10-12T03:30:00.000Z",
      endAt: "2026-10-12T04:00:00.000Z", durationMinutes: 30, version: 1, status: "scheduled" });
    expect(await service.get(a.id)).toEqual(a);
  });

  it("rejects overlaps and returns three usable alternatives", async () => {
    await service.create(input());
    try {
      await service.create(input("2026-10-12T09:15:00+05:30"));
      expect.fail("Expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const details = (error as AppError).details as { suggestions: { startAt: string }[] };
      expect((error as AppError).code).toBe("SCHEDULE_CONFLICT");
      expect(details.suggestions).toHaveLength(3);
      expect(details.suggestions[0].startAt).toBe("2026-10-12T04:00:00.000Z");
      await expect(service.create(input(details.suggestions[0].startAt))).resolves.toBeDefined();
    }
  });

  it("allows adjacent visits and simultaneous visits for different doctors", async () => {
    await service.create(input());
    await expect(service.create(input("2026-10-12T09:30:00+05:30"))).resolves.toBeDefined();
    await expect(service.create(input(undefined, { doctorId: doctors[1].id }))).resolves.toBeDefined();
  });

  it("serializes concurrent attempts at the same slot", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.create(input())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await service.list({})).total).toBe(1);
  });

  it.each([
    ["2026-10-12T07:00:00+05:30", "PAST_APPOINTMENT"],
    ["2026-10-12T09:05:00+05:30", "INVALID_START_TIME"],
    ["2026-10-12T09:00:01+05:30", "INVALID_START_TIME"],
    ["2026-10-12T11:45:00+05:30", "OUTSIDE_CLINIC_HOURS"],
    ["2026-10-12T16:45:00+05:30", "OUTSIDE_CLINIC_HOURS"],
    ["2026-10-18T09:00:00+05:30", "OUTSIDE_CLINIC_HOURS"],
    ["2028-10-12T09:00:00+05:30", "BOOKING_HORIZON"],
  ])("rejects unavailable time %s", async (start, code) => {
    await expect(service.create(input(start))).rejects.toMatchObject({ code });
  });

  it.each([
    { startAt: "2026-10-12T09:00:00" }, { startAt: "2026-02-30T09:00:00Z" },
    { durationMinutes: 16 }, { durationMinutes: 0 }, { durationMinutes: 135 },
    { patientName: " " }, { patientName: "Demo\nTaylor" }, { status: "completed" },
    { doctorId: "missing" }, { unexpectedField: true },
  ])("validates invalid payload %j", async (changes) => {
    await expect(service.create(input(undefined, changes))).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects an unknown doctor", async () => {
    await expect(service.create(input(undefined, { doctorId: "44444444-4444-4444-8444-444444444444" })))
      .rejects.toMatchObject({ code: "DOCTOR_NOT_FOUND" });
  });

  it("updates without conflicting with itself and rejects stale edits", async () => {
    const a = await service.create(input());
    const edited = await service.update(a.id, { durationMinutes: 45, expectedVersion: 1 });
    expect(edited).toMatchObject({ version: 2, durationMinutes: 45 });
    await expect(service.update(a.id, { patientName: "Another Demo", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("rolls back a failed edit and its activity", async () => {
    const a = await service.create(input());
    await service.create(input("2026-10-12T09:30:00+05:30"));
    await expect(service.update(a.id, { durationMinutes: 60, expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
    expect(await service.get(a.id)).toEqual(a);
    expect(await service.activity(a.id)).toHaveLength(1);
  });

  it("reconfirms rescheduled visits and applies new type duration", async () => {
    const a = await service.create(input(undefined, { status: "confirmed" }));
    expect(await service.update(a.id, { appointmentType: "follow_up", expectedVersion: 1 }))
      .toMatchObject({ status: "scheduled", durationMinutes: 15, version: 2 });
  });

  it("prevents lost updates under simultaneous writes", async () => {
    const a = await service.create(input());
    const result = await Promise.allSettled([
      service.update(a.id, { patientName: "Demo One", expectedVersion: 1 }),
      service.update(a.id, { patientName: "Demo Two", expectedVersion: 1 }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await service.get(a.id)).version).toBe(2);
  });

  it("releases cancelled slots and keeps deletion activity", async () => {
    const a = await service.create(input());
    const cancelled = await service.changeStatus(a.id, { status: "cancelled", expectedVersion: 1 });
    await expect(service.create(input())).resolves.toBeDefined();
    await expect(service.delete(a.id, 1)).rejects.toMatchObject({ code: "STALE_VERSION" });
    await service.delete(a.id, cancelled.version);
    await expect(service.get(a.id)).rejects.toMatchObject({ status: 404 });
    expect((await service.activity(a.id))[0].action).toBe("deleted");
  });

  it("enforces the visit lifecycle and closes completed visits", async () => {
    const a = await service.create(input());
    await expect(service.changeStatus(a.id, { status: "completed", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await expect(service.changeStatus(a.id, { status: "checked_in", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "TOO_EARLY_FOR_CHECK_IN" });
    now = new Date("2026-10-12T03:15:00Z");
    await service.changeStatus(a.id, { status: "checked_in", expectedVersion: 1 });
    await expect(service.update(a.id, { startAt: "2026-10-12T10:00:00+05:30", expectedVersion: 2 }))
      .rejects.toMatchObject({ code: "VISIT_ALREADY_STARTED" });
    await service.changeStatus(a.id, { status: "in_progress", expectedVersion: 2 });
    await service.changeStatus(a.id, { status: "completed", expectedVersion: 3 });
    await expect(service.update(a.id, { patientName: "New Demo", expectedVersion: 4 }))
      .rejects.toMatchObject({ code: "APPOINTMENT_CLOSED" });
    await expect(service.changeStatus(a.id, { status: "scheduled", expectedVersion: 4 }))
      .rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
  });

  it("allows no-show only after start time", async () => {
    const a = await service.create(input());
    await expect(service.changeStatus(a.id, { status: "no_show", expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "TOO_EARLY_FOR_NO_SHOW" });
    now = new Date("2026-10-12T03:30:00Z");
    expect(await service.changeStatus(a.id, { status: "no_show", expectedVersion: 1 })).toMatchObject({ status: "no_show" });
  });

  it("combines literal search, filters, and pagination", async () => {
    await service.create(input(undefined, { patientName: "Demo [One]", status: "confirmed" }));
    await service.create(input("2026-10-12T10:00:00+05:30", { patientName: "Demo Two" }));
    expect((await service.list({ q: "[one]", status: "confirmed", doctorId, appointmentType: "consultation", date: "2026-10-12" })).total).toBe(1);
    expect((await service.list({ page: 2, pageSize: 1 })).items[0].patientName).toBe("Demo Two");
    expect((await service.list({ from: "2026-10-12T04:00:00Z", to: "2026-10-12T05:00:00Z" })).total).toBe(1);
    await expect(service.list({ pageSize: 10000 })).rejects.toMatchObject({ name: "ZodError" });
    await expect(service.list({ from: "2026-10-13T00:00:00Z", to: "2026-10-12T00:00:00Z" })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("builds daily attention reasons without flagging cancelled visits", async () => {
    const a = await service.create(input());
    const b = await service.create(input("2026-10-12T10:00:00+05:30"));
    await service.changeStatus(b.id, { status: "cancelled", expectedVersion: 1 });
    now = new Date("2026-10-12T04:00:00Z");
    const summary = await service.dailySummary("2026-10-12");
    expect(summary.total).toBe(2);
    expect(summary.counts.cancelled).toBe(1);
    expect(summary.needsAttention).toEqual([{ appointmentId: a.id, reasons: ["unconfirmed", "late_arrival"] }]);
  });

  it("finds slots after lunch and skips Sundays", async () => {
    const lunch = await service.slots({ doctorId, from: "2026-10-12T11:45:00+05:30", durationMinutes: 30 });
    expect(lunch.slots[0].startAt).toBe("2026-10-12T07:30:00.000Z");
    const weekend = await service.slots({ doctorId, from: "2026-10-17T13:00:00+05:30" });
    expect(weekend.slots[0].startAt).toBe("2026-10-19T03:30:00.000Z");
    expect((await service.slots({ doctorId, from: "2028-10-12T00:00:00Z" })).slots).toEqual([]);
  });

  it("does not leak mutable references from repository reads or writes", async () => {
    const a = await service.create(input());
    a.patientName = "Mutated";
    const state = await repository.read();
    state.appointments.length = 0;
    expect((await service.get(a.id)).patientName).toBe("Demo Taylor");
  });
});

describe("timezone behavior", () => {
  it("uses calendar days across Australian daylight saving boundaries", () => {
    const spring = dayBounds("2026-10-04", "Australia/Sydney");
    expect((spring.end - spring.start) / 3600000).toBe(23);
    const autumn = dayBounds("2026-04-05", "Australia/Sydney");
    expect((autumn.end - autumn.start) / 3600000).toBe(25);
  });

  it("returns slots at local opening time after a DST change", () => {
    const slots = suggestSlots([], doctorId, "2026-10-03T23:00:00Z", 30, "Australia/Sydney", new Date("2026-10-01T00:00:00Z"));
    expect(DateTime.fromISO(slots[0].startAt, { zone: "Australia/Sydney" }).toFormat("yyyy-MM-dd HH:mm"))
      .toBe("2026-10-05 09:00");
  });

  it("filters by clinic date rather than UTC date", async () => {
    const sydney = new AppointmentService(repository, doctors, "Australia/Sydney", () => new Date("2026-10-11T00:00:00Z"));
    await sydney.create(input("2026-10-12T09:00:00+11:00"));
    expect((await sydney.list({ date: "2026-10-12" })).total).toBe(1);
    expect((await sydney.list({ date: "2026-10-11" })).total).toBe(0);
  });
});
