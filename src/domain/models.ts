export const statuses = [
  "scheduled", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show",
] as const;
export type Status = (typeof statuses)[number];

export const appointmentTypes = {
  consultation: { label: "Consultation", durationMinutes: 30 },
  follow_up: { label: "Follow-up", durationMinutes: 15 },
  procedure: { label: "Procedure", durationMinutes: 60 },
} as const;
export type AppointmentType = keyof typeof appointmentTypes;

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
}

export interface Appointment {
  id: string;
  patientName: string;
  doctorId: string;
  appointmentType: AppointmentType;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  appointmentId: string;
  action: "created" | "updated" | "status_changed" | "deleted";
  at: string;
  version: number;
  changedFields: string[];
  fromStatus?: Status;
  toStatus?: Status;
}

export interface Slot { startAt: string; endAt: string }

export const isBlocking = (status: Status) => status !== "cancelled" && status !== "no_show";
export const isTerminal = (status: Status) => ["completed", "cancelled", "no_show"].includes(status);

export const transitions: Record<Status, readonly Status[]> = {
  scheduled: ["confirmed", "checked_in", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [], cancelled: [], no_show: [],
};
