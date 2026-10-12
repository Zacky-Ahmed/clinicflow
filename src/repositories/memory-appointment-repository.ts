import type { AppointmentRepository, AppointmentSnapshot } from "./appointment-repository";

/** Single-process, ephemeral development adapter; never a persistence substitute. */
export class MemoryAppointmentRepository implements AppointmentRepository {
  private state: AppointmentSnapshot = { appointments: [], activity: [] };
  private pending: Promise<unknown> = Promise.resolve();

  async read() { await this.pending; return structuredClone(this.state); }

  write<T>(operation: (state: AppointmentSnapshot) => T): Promise<T> {
    const result = this.pending.then(() => {
      const draft = structuredClone(this.state);
      const value = operation(draft);
      this.state = draft;
      return structuredClone(value);
    });
    this.pending = result.catch(() => undefined);
    return result;
  }
}
