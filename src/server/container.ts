import { doctors } from "@/config/doctors";
import { AppError } from "@/domain/errors";
import { MemoryAppointmentRepository } from "@/repositories/memory-appointment-repository";
import { AppointmentService } from "@/services/appointment-service";
import { MongoClient } from "mongodb";
import { MongoAppointmentRepository } from "@/repositories/mongo-appointment-repository";

const scope = globalThis as typeof globalThis & { clinicflowService?: AppointmentService; clinicflowStorageKey?: string };

export const storageMode = () => process.env.MONGODB_URI ? "mongodb" : "memory";

export function getService() {
  const uri = process.env.MONGODB_URI;
  if (!uri && process.env.NODE_ENV === "production") {
    throw new AppError("DATABASE_NOT_CONFIGURED", "MongoDB persistence must be configured before deployment", 503);
  }
  const databaseName = process.env.MONGODB_DB_NAME || "clinicflow";
  if (!/^[a-zA-Z0-9_-]+$/.test(databaseName)) throw new AppError("INVALID_DATABASE_NAME", "Invalid database name", 503);
  const timezone = process.env.CLINIC_TIMEZONE || "Asia/Colombo";
  const key = `${storageMode()}:${databaseName}:${timezone}`;
  if (!scope.clinicflowService || scope.clinicflowStorageKey !== key) {
    const repository = uri ? new MongoAppointmentRepository(new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, maxPoolSize: 10,
    }), databaseName) : new MemoryAppointmentRepository();
    scope.clinicflowService = new AppointmentService(repository, doctors, timezone);
    scope.clinicflowStorageKey = key;
  }
  return scope.clinicflowService;
}
