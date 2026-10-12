import { MongoClient, type ClientSession, type Db, type Filter } from "mongodb";
import { AppError } from "@/domain/errors";
import type { Activity, Appointment } from "@/domain/models";
import type { AppointmentRepository, AppointmentSnapshot, RepositoryScope } from "./appointment-repository";

type StoredAppointment = Omit<Appointment, "startAt" | "endAt" | "createdAt" | "updatedAt"> & {
  _id: string; startAt: Date; endAt: Date; createdAt: Date; updatedAt: Date;
};
type StoredActivity = Omit<Activity, "at"> & { _id: string; at: Date };

function store(a: Appointment): StoredAppointment {
  return { ...a, _id: a.id, startAt: new Date(a.startAt), endAt: new Date(a.endAt),
    createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt) };
}
function restore({ _id: _id, ...a }: StoredAppointment): Appointment {
  return { ...a, startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(),
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() };
}

/** Durable adapter. A database lock serializes clinic writes across server instances. */
export class MongoAppointmentRepository implements AppointmentRepository {
  private initialization?: Promise<Db>;

  constructor(private readonly client: MongoClient, private readonly databaseName: string) {}

  private async database() {
    this.initialization ??= (async () => {
      await this.client.connect();
      const db = this.client.db(this.databaseName);
      await db.collection<StoredAppointment>("appointments").createIndexes([
        { key: { doctorId: 1, startAt: 1 }, name: "doctor_schedule" },
        { key: { startAt: 1 }, name: "daily_schedule" },
        { key: { status: 1, startAt: 1 }, name: "status_schedule" },
      ]);
      await db.collection<StoredActivity>("appointment_events").createIndex(
        { appointmentId: 1, version: 1 }, { unique: true, name: "appointment_event_version" },
      );
      // Only initializes our named lock; never changes another project's collections.
      await db.collection<{ _id: string; revision: number }>("schedule_locks").updateOne(
        { _id: "clinic" }, { $setOnInsert: { revision: 0 } }, { upsert: true },
      );
      return db;
    })().catch((error) => { this.initialization = undefined; throw error; });
    return this.initialization;
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof AppError) throw error;
      // Driver errors may include connection information: never send them to clients.
      throw new AppError("DATABASE_UNAVAILABLE", "The database is unavailable. Please try again shortly.", 503);
    }
  }

  async ready() {
    await this.guard(async () => { await (await this.database()).command({ ping: 1 }); });
  }

  private async snapshot(db: Db, scope?: RepositoryScope, session?: ClientSession): Promise<AppointmentSnapshot> {
    const clauses: Filter<StoredAppointment>[] = [];
    if (scope?.id) clauses.push({ _id: scope.id });
    if (scope?.doctorIds?.length) clauses.push({ doctorId: { $in: scope.doctorIds } });
    const filter: Filter<StoredAppointment> = clauses.length ? { $or: clauses } : {};
    const appointments = await db.collection<StoredAppointment>("appointments").find(filter, { session }).toArray();
    // Normal appointment requests never load the entire activity collection.
    const events = scope?.activityId
      ? await db.collection<StoredActivity>("appointment_events")
        .find({ appointmentId: scope.activityId }, { session }).sort({ version: -1 }).limit(50).toArray()
      : [];
    return { appointments: appointments.map(restore), activity: events.reverse().map(({ _id: _id, at, ...e }) => ({ ...e, at: at.toISOString() })) };
  }

  async read(scope?: RepositoryScope) {
    return this.guard(async () => this.snapshot(await this.database(), scope));
  }

  async write<T>(operation: (state: AppointmentSnapshot) => T, scope?: RepositoryScope): Promise<T> {
    return this.guard(async () => {
      const db = await this.database();
      const session = this.client.startSession();
      try {
        return await session.withTransaction(async () => {
          // This write must precede the snapshot read. Competing transactions retry
          // from a fresh snapshot, including when two initially empty slots collide.
          await db.collection<{ _id: string; revision: number }>("schedule_locks").updateOne(
            { _id: "clinic" }, { $inc: { revision: 1 } }, { session },
          );
          const before = await this.snapshot(db, scope, session);
          const draft = structuredClone(before);
          const result = operation(draft);
          const collection = db.collection<StoredAppointment>("appointments");
          const previous = new Map(before.appointments.map((a) => [a.id, a]));
          const nextIds = new Set(draft.appointments.map((a) => a.id));
          for (const a of draft.appointments) {
            const old = previous.get(a.id);
            if (!old) await collection.insertOne(store(a), { session });
            else if (old.version !== a.version) {
              const updated = await collection.replaceOne({ _id: a.id, version: old.version }, store(a), { session });
              if (updated.matchedCount !== 1) throw new AppError("STALE_VERSION", "Refresh this appointment before saving", 409);
            }
          }
          for (const a of before.appointments) {
            if (!nextIds.has(a.id)) {
              const deleted = await collection.deleteOne({ _id: a.id, version: a.version }, { session });
              if (deleted.deletedCount !== 1) throw new AppError("STALE_VERSION", "Refresh this appointment before deleting", 409);
            }
          }
          const priorEvents = new Set(before.activity.map((e) => e.id));
          const added = draft.activity.filter((e) => !priorEvents.has(e.id));
          if (added.length) await db.collection<StoredActivity>("appointment_events").insertMany(
            added.map((e) => ({ ...e, _id: e.id, at: new Date(e.at) })), { session },
          );
          return result;
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
          readPreference: "primary", maxCommitTimeMS: 10000, timeoutMS: 20000 }) as T;
      } finally { await session.endSession(); }
    });
  }
}
