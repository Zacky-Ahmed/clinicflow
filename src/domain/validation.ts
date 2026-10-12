import { z } from "zod";
import { statuses } from "./models";

export const idSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: true }).refine(
  (value) => Number.isFinite(Date.parse(value)), "Invalid date and time",
);
export const dateSchema = z.iso.date();
export const durationSchema = z.number().int().min(15).max(120).multipleOf(15);
const patientName = z.string().trim().min(2).max(100).refine(
  (name) => !Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
  "Name cannot contain control characters",
);
export const typeSchema = z.enum(["consultation", "follow_up", "procedure"]);
const fields = {
  patientName, doctorId: idSchema, appointmentType: typeSchema,
  startAt: instantSchema, durationMinutes: durationSchema.optional(),
};
export const createSchema = z.strictObject({
  ...fields, status: z.enum(["scheduled", "confirmed"]).default("scheduled"),
});
export const updateSchema = z.strictObject({
  patientName: patientName.optional(), doctorId: idSchema.optional(),
  appointmentType: typeSchema.optional(), startAt: instantSchema.optional(),
  durationMinutes: durationSchema.optional(), expectedVersion: z.number().int().positive(),
}).refine((value) => Object.keys(value).length > 1, "Provide at least one field to update");
export const statusSchema = z.strictObject({
  status: z.enum(statuses), expectedVersion: z.number().int().positive(),
});
export const listSchema = z.strictObject({
  q: z.string().trim().max(100).optional(), doctorId: idSchema.optional(),
  status: z.enum(statuses).optional(), appointmentType: typeSchema.optional(),
  date: dateSchema.optional(), from: instantSchema.optional(), to: instantSchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).refine((value) => !value.from || !value.to || Date.parse(value.from) < Date.parse(value.to),
  "from must be earlier than to");
export const slotSchema = z.strictObject({
  doctorId: idSchema, from: instantSchema,
  durationMinutes: z.coerce.number().pipe(durationSchema).default(30),
  excludeAppointmentId: idSchema.optional(),
});
export const deleteSchema = z.strictObject({ expectedVersion: z.coerce.number().int().positive() });
export const daySchema = z.strictObject({ date: dateSchema });
export type CreateInput = z.infer<typeof createSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type ListInput = z.infer<typeof listSchema>;
