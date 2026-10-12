import type { Activity, Appointment } from "@/domain/models";

export interface AppointmentSnapshot { appointments: Appointment[]; activity: Activity[] }
export interface RepositoryScope { id?: string; doctorIds?: string[]; activityId?: string }

/**
 * A write callback must atomically check and modify a consistent snapshot.
 * Adapters must roll back on failure and serialize conflicting doctor bookings.
 * Scope limits loaded records. Writes must serialize conflicting bookings across processes.
 */
export interface AppointmentRepository {
  read(scope?: RepositoryScope): Promise<AppointmentSnapshot>;
  write<T>(operation: (state: AppointmentSnapshot) => T, scope?: RepositoryScope): Promise<T>;
  ready?(): Promise<void>;
}
