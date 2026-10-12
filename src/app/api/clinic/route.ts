import { appointmentTypes, transitions } from "@/domain/models";
import { clinicHours } from "@/domain/scheduling";
import { getService } from "@/server/container";
import { endpoint, json } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = () => endpoint(() => {
  const service = getService();
  return json({ timezone: service.timezone, doctors: service.doctors, appointmentTypes, transitions,
    hours: clinicHours, slotIntervalMinutes: 15, bookingHorizonDays: 365, fictionalDataOnly: true });
});
