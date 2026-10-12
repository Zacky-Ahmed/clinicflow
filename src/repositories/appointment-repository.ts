import type { Activity, Appointment } from "@/domain/models";

export interface AppointmentSnapshot { appointments: Appointment[]; activity: Activity[] }

/**
 * A write callback must atomically check and modify a consistent snapshot.
 * Adapters must roll back on failure and serialize conflicting doctor bookings.
 * MongoDB will need transaction + doctor-lock/version semantics, not find-then-insert.
 */
export interface AppointmentRepository {
  read(): Promise<AppointmentSnapshot>;
  write<T>(operation: (state: AppointmentSnapshot) => T): Promise<T>;
}
