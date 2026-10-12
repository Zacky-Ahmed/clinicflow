import { doctors } from "@/config/doctors";
import { AppError } from "@/domain/errors";
import { MemoryAppointmentRepository } from "@/repositories/memory-appointment-repository";
import { AppointmentService } from "@/services/appointment-service";

const scope = globalThis as typeof globalThis & { clinicflowService?: AppointmentService };

export function getService() {
  // Fail closed: this phase must not silently run an ephemeral public deployment.
  if (process.env.NODE_ENV === "production") {
    throw new AppError("DATABASE_NOT_CONFIGURED", "MongoDB persistence must be configured before deployment", 503);
  }
  return scope.clinicflowService ??= new AppointmentService(
    new MemoryAppointmentRepository(), doctors, process.env.CLINIC_TIMEZONE || "Asia/Colombo",
  );
}
