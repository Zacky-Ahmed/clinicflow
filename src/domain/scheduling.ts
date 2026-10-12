import { DateTime, IANAZone } from "luxon";
import { AppError } from "./errors";
import { isBlocking, type Appointment, type Slot } from "./models";

// Fictional clinic policy. Minutes after midnight; all doctors share these hours.
export const clinicHours: Record<number, readonly (readonly [number, number])[]> = {
  1: [[540, 720], [780, 1020]], 2: [[540, 720], [780, 1020]],
  3: [[540, 720], [780, 1020]], 4: [[540, 720], [780, 1020]],
  5: [[540, 720], [780, 1020]], 6: [[540, 780]], 7: [],
};

export function validateZone(zone: string) {
  if (!IANAZone.isValidZone(zone)) throw new Error("CLINIC_TIMEZONE must be a valid IANA timezone");
  return zone;
}

export function dayBounds(date: string, zone: string) {
  const start = DateTime.fromISO(date, { zone }).startOf("day");
  if (!start.isValid) throw new AppError("INVALID_DATE", "Invalid clinic date");
  return { start: start.toMillis(), end: start.plus({ days: 1 }).toMillis() };
}

export function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  // Half-open intervals allow one appointment to start exactly when another ends.
  return start < otherEnd && end > otherStart;
}

export function conflictsWith(appointments: Appointment[], doctorId: string, slot: Slot, excludeId?: string) {
  return appointments.filter((a) => a.id !== excludeId && a.doctorId === doctorId && isBlocking(a.status)
    && overlaps(Date.parse(slot.startAt), Date.parse(slot.endAt), Date.parse(a.startAt), Date.parse(a.endAt)));
}

function minuteOnDay(day: DateTime, minute: number) {
  return day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
}

export function assertBookable(slot: Slot, zone: string, now: Date) {
  const start = DateTime.fromISO(slot.startAt, { zone });
  const end = DateTime.fromISO(slot.endAt, { zone });
  if (start.toMillis() <= now.getTime()) throw new AppError("PAST_APPOINTMENT", "Choose a future appointment time");
  if (start.toMillis() > DateTime.fromJSDate(now).plus({ days: 365 }).toMillis()) {
    throw new AppError("BOOKING_HORIZON", "Appointments can be booked up to 365 days ahead");
  }
  if (start.minute % 15 !== 0 || start.second !== 0 || start.millisecond !== 0) {
    throw new AppError("INVALID_START_TIME", "Appointments start on a 15-minute boundary in clinic time");
  }
  const withinHours = clinicHours[start.weekday].some(([open, close]) =>
    start.toMillis() >= minuteOnDay(start, open).toMillis()
      && end.toMillis() <= minuteOnDay(start, close).toMillis());
  if (!withinHours) throw new AppError("OUTSIDE_CLINIC_HOURS", "Appointment must fit within clinic hours, excluding lunch");
}

export function suggestSlots(
  appointments: Appointment[], doctorId: string, from: string, duration: number,
  zone: string, now: Date, excludeId?: string,
): Slot[] {
  const earliest = Math.max(Date.parse(from), now.getTime() + 1);
  const firstDay = DateTime.fromMillis(earliest, { zone }).startOf("day");
  const horizon = DateTime.fromJSDate(now).plus({ days: 365 }).toMillis();
  const suggestions: Slot[] = [];
  // Bounded search: the starting clinic date plus the next 13 dates.
  for (let day = 0; day < 14; day++) {
    const date = firstDay.plus({ days: day });
    for (const [open, close] of clinicHours[date.weekday]) {
      for (let minute = open; minute + duration <= close; minute += 15) {
        const start = minuteOnDay(date, minute);
        const end = start.plus({ minutes: duration });
        if (start.toMillis() < earliest || start.toMillis() > horizon) continue;
        const slot = { startAt: start.toUTC().toISO()!, endAt: end.toUTC().toISO()! };
        if (conflictsWith(appointments, doctorId, slot, excludeId).length === 0) suggestions.push(slot);
        if (suggestions.length === 3) return suggestions;
      }
    }
  }
  return suggestions;
}
