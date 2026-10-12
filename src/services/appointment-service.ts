import { randomUUID } from "node:crypto";
import { AppError } from "@/domain/errors";
import {
  appointmentTypes, isTerminal, transitions,
  type Appointment, type Doctor, type Slot,
} from "@/domain/models";
import {
  createSchema, updateSchema, statusSchema, listSchema, slotSchema, idSchema, dateSchema,
} from "@/domain/validation";
import { assertBookable, conflictsWith, dayBounds, suggestSlots, validateZone } from "@/domain/scheduling";
import type { AppointmentRepository, AppointmentSnapshot } from "@/repositories/appointment-repository";

export class AppointmentService {
  constructor(
    private readonly repository: AppointmentRepository,
    readonly doctors: readonly Doctor[],
    readonly timezone: string,
    private readonly clock: () => Date = () => new Date(),
  ) { validateZone(timezone); }

  private doctor(id: string) {
    const doctor = this.doctors.find((d) => d.id === id);
    if (!doctor) throw new AppError("DOCTOR_NOT_FOUND", "Doctor does not exist", 404);
    return doctor;
  }

  private find(state: AppointmentSnapshot, id: string) {
    const appointment = state.appointments.find((a) => a.id === id);
    if (!appointment) throw new AppError("APPOINTMENT_NOT_FOUND", "Appointment does not exist", 404);
    return appointment;
  }

  private version(appointment: Appointment, expected: number) {
    if (appointment.version !== expected) throw new AppError(
      "STALE_VERSION", "This appointment changed. Refresh it before saving again.", 409,
      { currentVersion: appointment.version },
    );
  }

  private ensureAvailable(state: AppointmentSnapshot, doctorId: string, slot: Slot, now: Date, excludeId?: string) {
    this.doctor(doctorId);
    assertBookable(slot, this.timezone, now);
    const conflicts = conflictsWith(state.appointments, doctorId, slot, excludeId);
    if (conflicts.length) {
      const duration = (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000;
      throw new AppError("SCHEDULE_CONFLICT", "This doctor already has an appointment during that time", 409, {
        conflicts: conflicts.map(({ id, startAt, endAt }) => ({ id, startAt, endAt })),
        suggestions: suggestSlots(state.appointments, doctorId, slot.startAt, duration, this.timezone, now, excludeId),
      });
    }
  }

  async create(raw: unknown) {
    const input = createSchema.parse(raw);
    return this.repository.write((state) => {
      const now = this.clock();
      const duration = input.durationMinutes ?? appointmentTypes[input.appointmentType].durationMinutes;
      const startAt = new Date(input.startAt).toISOString();
      const endAt = new Date(Date.parse(startAt) + duration * 60000).toISOString();
      this.ensureAvailable(state, input.doctorId, { startAt, endAt }, now);
      const appointment: Appointment = {
        ...input, id: randomUUID(), startAt, endAt, durationMinutes: duration,
        version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      state.appointments.push(appointment);
      state.activity.push({ id: randomUUID(), appointmentId: appointment.id, action: "created",
        at: now.toISOString(), version: 1, changedFields: [], toStatus: appointment.status });
      return appointment;
    });
  }

  async get(id: string) { idSchema.parse(id); return this.find(await this.repository.read(), id); }

  async update(id: string, raw: unknown) {
    idSchema.parse(id);
    const input = updateSchema.parse(raw);
    return this.repository.write((state) => {
      const current = this.find(state, id);
      this.version(current, input.expectedVersion);
      if (isTerminal(current.status)) throw new AppError("APPOINTMENT_CLOSED", "Closed appointments cannot be edited", 409);
      const { expectedVersion: _version, ...changes } = input;
      const next = { ...current, ...changes };
      // Changing type picks its default duration unless explicitly overridden.
      next.durationMinutes = input.durationMinutes ?? (input.appointmentType && input.appointmentType !== current.appointmentType
        ? appointmentTypes[input.appointmentType].durationMinutes : current.durationMinutes);
      next.startAt = new Date(next.startAt).toISOString();
      next.endAt = new Date(Date.parse(next.startAt) + next.durationMinutes * 60000).toISOString();
      const changedFields = (Object.keys(next) as (keyof Appointment)[]).filter((key) => next[key] !== current[key]);
      if (changedFields.length === 0) return current;
      const scheduleChanged = ["doctorId", "startAt", "durationMinutes", "appointmentType"].some((key) => changedFields.includes(key as keyof Appointment));
      const now = this.clock();
      if (scheduleChanged) {
        if (["checked_in", "in_progress"].includes(current.status)) {
          throw new AppError("VISIT_ALREADY_STARTED", "Checked-in or in-progress visits cannot be rescheduled", 409);
        }
        this.ensureAvailable(state, next.doctorId, next, now, id);
        // A rescheduled confirmed booking needs confirmation of its new details.
        if (next.status === "confirmed") { next.status = "scheduled"; changedFields.push("status"); }
      }
      next.version++;
      next.updatedAt = now.toISOString();
      state.appointments[state.appointments.findIndex((a) => a.id === id)] = next;
      state.activity.push({ id: randomUUID(), appointmentId: id, action: "updated", at: next.updatedAt,
        version: next.version, changedFields, fromStatus: current.status, toStatus: next.status });
      return next;
    });
  }

  async changeStatus(id: string, raw: unknown) {
    idSchema.parse(id);
    const input = statusSchema.parse(raw);
    return this.repository.write((state) => {
      const appointment = this.find(state, id);
      this.version(appointment, input.expectedVersion);
      if (input.status === appointment.status) return appointment;
      if (!transitions[appointment.status].includes(input.status)) {
        throw new AppError("INVALID_STATUS_TRANSITION", `Cannot change ${appointment.status} to ${input.status}`, 409,
          { allowedStatuses: transitions[appointment.status] });
      }
      const now = this.clock();
      if (input.status === "no_show" && now.getTime() < Date.parse(appointment.startAt)) {
        throw new AppError("TOO_EARLY_FOR_NO_SHOW", "Mark no-show only after the appointment starts", 409);
      }
      if (input.status === "checked_in" && now.getTime() < Date.parse(appointment.startAt) - 30 * 60000) {
        throw new AppError("TOO_EARLY_FOR_CHECK_IN", "Check-in opens 30 minutes before the appointment", 409);
      }
      const previous = appointment.status;
      appointment.status = input.status;
      appointment.version++;
      appointment.updatedAt = now.toISOString();
      state.activity.push({ id: randomUUID(), appointmentId: id, action: "status_changed", at: appointment.updatedAt,
        version: appointment.version, changedFields: ["status"], fromStatus: previous, toStatus: input.status });
      return appointment;
    });
  }

  async delete(id: string, expectedVersion: number) {
    idSchema.parse(id);
    // Validate direct service callers too, not only HTTP query parameters.
    statusSchema.shape.expectedVersion.parse(expectedVersion);
    return this.repository.write((state) => {
      const appointment = this.find(state, id);
      this.version(appointment, expectedVersion);
      state.appointments = state.appointments.filter((a) => a.id !== id);
      state.activity.push({ id: randomUUID(), appointmentId: id, action: "deleted", at: this.clock().toISOString(),
        version: appointment.version + 1, changedFields: [] });
    });
  }

  async list(raw: unknown) {
    const query = listSchema.parse(raw);
    if (query.doctorId) this.doctor(query.doctorId);
    const { appointments } = await this.repository.read();
    const bounds = query.date ? dayBounds(query.date, this.timezone) : undefined;
    const matches = appointments.filter((a) => {
      const start = Date.parse(a.startAt);
      return (!query.q || a.patientName.toLocaleLowerCase("en").includes(query.q.toLocaleLowerCase("en")))
        && (!query.doctorId || a.doctorId === query.doctorId)
        && (!query.status || a.status === query.status)
        && (!query.appointmentType || a.appointmentType === query.appointmentType)
        && (!bounds || start >= bounds.start && start < bounds.end)
        && (!query.from || start >= Date.parse(query.from)) && (!query.to || start < Date.parse(query.to));
    }).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
    const start = (query.page - 1) * query.pageSize;
    return { items: matches.slice(start, start + query.pageSize), total: matches.length,
      page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(matches.length / query.pageSize) };
  }

  async slots(raw: unknown) {
    const input = slotSchema.parse(raw);
    this.doctor(input.doctorId);
    const state = await this.repository.read();
    if (input.excludeAppointmentId) this.find(state, input.excludeAppointmentId);
    return { slots: suggestSlots(state.appointments, input.doctorId, input.from, input.durationMinutes,
      this.timezone, this.clock(), input.excludeAppointmentId), timezone: this.timezone, searchDays: 14 };
  }

  async activity(id: string) {
    idSchema.parse(id);
    const state = await this.repository.read();
    const events = state.activity.filter((event) => event.appointmentId === id);
    if (!events.length) this.find(state, id);
    return events.slice(-50).reverse();
  }

  async dailySummary(date: string) {
    dateSchema.parse(date);
    const bounds = dayBounds(date, this.timezone);
    const state = await this.repository.read();
    const now = this.clock().getTime();
    const appointments = state.appointments.filter((a) => Date.parse(a.startAt) >= bounds.start && Date.parse(a.startAt) < bounds.end)
      .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
    const needsAttention = appointments.flatMap((a) => {
      if (isTerminal(a.status)) return [];
      const reasons: string[] = [];
      if (a.status === "scheduled") reasons.push("unconfirmed");
      if (["scheduled", "confirmed"].includes(a.status) && Date.parse(a.startAt) <= now) reasons.push("late_arrival");
      if (a.status === "in_progress" && Date.parse(a.endAt) <= now) reasons.push("running_over");
      if (a.status === "checked_in" && Date.parse(a.startAt) <= now) reasons.push("waiting");
      if (conflictsWith(appointments, a.doctorId, a, a.id).length) reasons.push("schedule_conflict");
      return reasons.length ? [{ appointmentId: a.id, reasons }] : [];
    });
    return {
      date, timezone: this.timezone, total: appointments.length,
      counts: Object.fromEntries(Object.keys(transitions).map((status) => [status, appointments.filter((a) => a.status === status).length])),
      needsAttention,
      doctors: this.doctors.map((doctor) => ({ ...doctor, appointments: appointments.filter((a) => a.doctorId === doctor.id) })),
    };
  }
}
