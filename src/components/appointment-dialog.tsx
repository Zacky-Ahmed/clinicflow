"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DateTime } from "luxon";
import {
  appointmentTypes,
  isTerminal,
  transitions,
  type Activity,
  type Appointment,
  type AppointmentType,
  type Doctor,
  type Slot,
  type Status,
} from "@/domain/models";
import { api, ApiError } from "@/lib/client-api";
import { Icon } from "./icons";

export const statusLabels: Record<Status, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const actionLabels: Partial<Record<Status, string>> = {
  confirmed: "Confirm visit",
  checked_in: "Check in",
  in_progress: "Start visit",
  completed: "Complete visit",
  cancelled: "Cancel visit",
  no_show: "Mark no-show",
};

export function AppointmentDialog({
  appointment,
  doctors,
  timezone,
  date,
  onClose,
  onSaved,
}: {
  appointment: Appointment | null;
  doctors: Doctor[];
  timezone: string;
  date: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(appointment);
  const [name, setName] = useState(appointment?.patientName || "");
  const [doctorId, setDoctor] = useState(
    appointment?.doctorId || doctors[0]?.id || "",
  );
  const [type, setType] = useState<AppointmentType>(
    appointment?.appointmentType || "consultation",
  );
  const [duration, setDuration] = useState(appointment?.durationMinutes || 30);
  const [localTime, setTime] = useState(
    appointment
      ? DateTime.fromISO(appointment.startAt, { zone: timezone }).toFormat(
          "yyyy-MM-dd'T'HH:mm",
        )
      : `${date}T09:00`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotMessage, setSlotMessage] = useState("");
  const [events, setEvents] = useState<Activity[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!current) return;
    let active = true;
    api<Activity[]>(`/appointments/${current.id}/activity`)
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch(() => {
        if (active) setActivityError(true);
      });
    return () => {
      active = false;
    };
  }, [current]);
  const closed = current && isTerminal(current.status);
  const scheduleLocked =
    !!current && ["checked_in", "in_progress"].includes(current.status);
  function report(error: unknown) {
    if (error instanceof ApiError) {
      setError(
        Array.isArray(error.details)
          ? error.details.map((d) => d.message).join(". ")
          : error.message,
      );
      if (
        error.details &&
        !Array.isArray(error.details) &&
        error.details.suggestions
      ) {
        setSlots(error.details.suggestions);
        setSlotMessage(
          "That time overlaps another visit. Try one of these instead.",
        );
      }
      if (error.code === "STALE_VERSION") setStale(true);
    } else
      setError(
        "Couldn’t reach the clinic. Check your connection and try again.",
      );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const start = DateTime.fromISO(localTime, { zone: timezone });
      if (!start.isValid) throw new Error("Invalid time");
      const payload = {
        patientName: name,
        doctorId,
        appointmentType: type,
        durationMinutes: duration,
        startAt: start.toUTC().toISO(),
        ...(current ? { expectedVersion: current.version } : {}),
      };
      await api<Appointment>(
        current ? `/appointments/${current.id}` : "/appointments",
        { method: current ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      onSaved(
        current
          ? "Appointment updated. Everything is in place."
          : "Appointment booked. A little more flow in your day.",
      );
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: Status) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await api(`/appointments/${current.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, expectedVersion: current.version }),
      });
      onSaved(`Visit ${statusLabels[status].toLowerCase()}.`);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/appointments/${current.id}?expectedVersion=${current.version}`,
        { method: "DELETE" },
      );
      onSaved("Appointment deleted.");
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function findSlots() {
    setBusy(true);
    setError("");
    setSlots([]);
    setSlotMessage("");
    try {
      const from = DateTime.fromISO(localTime, { zone: timezone });
      if (!from.isValid) {
        setError("Choose a date and time first.");
        return;
      }
      const params = new URLSearchParams({
        doctorId,
        from: from.toUTC().toISO()!,
        durationMinutes: String(duration),
        ...(current ? { excludeAppointmentId: current.id } : {}),
      });
      const result = await api<{ slots: Slot[] }>(`/availability?${params}`);
      setSlots(result.slots);
      setSlotMessage(
        result.slots.length
          ? "A little room in the day. Choose a time:"
          : "No available times in the next 14 days. Try another date or doctor.",
      );
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (!current) return;
    setBusy(true);
    try {
      const fresh = await api<Appointment>(`/appointments/${current.id}`);
      setCurrent(fresh);
      setName(fresh.patientName);
      setDoctor(fresh.doctorId);
      setType(fresh.appointmentType);
      setDuration(fresh.durationMinutes);
      setTime(
        DateTime.fromISO(fresh.startAt, { zone: timezone }).toFormat(
          "yyyy-MM-dd'T'HH:mm",
        ),
      );
      setStale(false);
      setError("");
      setSlots([]);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="appointment-dialog"
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-top">
        <div>
          <span className="eyebrow">A LITTLE PLANNING, A BETTER DAY</span>
          <h2 id="dialog-title">
            {current ? "Appointment details" : "Make room for care."}
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close appointment panel"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-scroll">
        <div className="form-note">
          <Icon name="spark" size={16} /> Fictional patients only · Times in{" "}
          {timezone.replaceAll("_", " ")}
        </div>
        {current && (
          <div className="visit-state">
            <span className={`status ${current.status}`}>
              {statusLabels[current.status]}
            </span>
            <span>Visit #{current.id.slice(0, 6).toUpperCase()}</span>
          </div>
        )}
        <form id="appointment-form" onSubmit={save}>
          <fieldset disabled={busy || !!closed || stale}>
            <label>
              Patient name
              <input
                name="patientName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jamie Bennett (fictional)"
                required
                minLength={2}
                maxLength={100}
                autoComplete="off"
                autoFocus={!current}
              />
            </label>
            <div className="form-grid">
              <label>
                Doctor
                <select
                  value={doctorId}
                  onChange={(e) => {
                    setDoctor(e.target.value);
                    setSlots([]);
                  }}
                  disabled={scheduleLocked}
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visit type
                <select
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as AppointmentType;
                    setType(next);
                    setDuration(appointmentTypes[next].durationMinutes);
                    setSlots([]);
                  }}
                  disabled={scheduleLocked}
                >
                  {Object.entries(appointmentTypes).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Date & time
                <input
                  type="datetime-local"
                  step={900}
                  required
                  value={localTime}
                  onChange={(e) => {
                    setTime(e.target.value);
                    setSlots([]);
                  }}
                  disabled={scheduleLocked}
                />
              </label>
              <label>
                Duration
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setSlots([]);
                  }}
                  disabled={scheduleLocked}
                >
                  {[15, 30, 45, 60, 75, 90, 105, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!scheduleLocked && (
              <button
                type="button"
                className="availability-button"
                onClick={findSlots}
              >
                <Icon name="spark" size={17} /> Find an available time{" "}
                <Icon name="arrow" size={17} />
              </button>
            )}
          </fieldset>
        </form>
        {slotMessage && !closed && (
          <div className="slot-suggestions">
            <p>{slotMessage}</p>
            <div>
              {slots.map((s) => (
                <button
                  key={s.startAt}
                  disabled={busy}
                  onClick={() => {
                    setTime(
                      DateTime.fromISO(s.startAt, { zone: timezone }).toFormat(
                        "yyyy-MM-dd'T'HH:mm",
                      ),
                    );
                    setError("");
                    setSlots([]);
                    setSlotMessage(
                      "Time selected. Save the appointment to reserve it.",
                    );
                  }}
                >
                  {DateTime.fromISO(s.startAt, { zone: timezone }).toFormat(
                    "ccc d LLL · h:mm a",
                  )}
                  <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {scheduleLocked && (
          <p className="muted small">
            This visit has started. Its schedule is locked; you can still
            correct the patient name.
          </p>
        )}
        {closed && (
          <p className="muted small">
            This visit is closed. Its details are preserved for your records.
          </p>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            {stale && (
              <button onClick={reload} disabled={busy}>
                Reload latest appointment
              </button>
            )}
          </div>
        )}
        {current && (
          <section className="workflow">
            <h3>Move the visit forward</h3>
            <div>
              {transitions[current.status].length ? (
                transitions[current.status].map((s) => (
                  <button
                    key={s}
                    disabled={busy || stale}
                    className={`workflow-action ${s === "cancelled" || s === "no_show" ? "subtle" : ""}`}
                    onClick={() => changeStatus(s)}
                  >
                    {actionLabels[s]}
                    <Icon name="arrow" size={15} />
                  </button>
                ))
              ) : (
                <p className="muted small">
                  No further status changes for this visit.
                </p>
              )}
            </div>
          </section>
        )}
        {current && (
          <section className="activity">
            <h3>
              Visit story <span>{events.length} events</span>
            </h3>
            {activityError ? (
              <p className="muted small">
                Couldn’t load activity. Reopen this visit to retry.
              </p>
            ) : events.length ? (
              events.map((e) => (
                <div className="activity-event" key={e.id}>
                  <i />
                  <div>
                    <strong>
                      {e.action === "status_changed"
                        ? `Marked ${e.toStatus ? statusLabels[e.toStatus].toLowerCase() : "updated"}`
                        : e.action === "created"
                          ? "Appointment created"
                          : e.action === "updated"
                            ? "Appointment updated"
                            : "Appointment deleted"}
                    </strong>
                    <small>
                      {DateTime.fromISO(e.at, { zone: timezone }).toFormat(
                        "d LLL · h:mm a",
                      )}
                      {e.changedFields.length
                        ? ` · ${e.changedFields.join(", ").replaceAll("_", " ")}`
                        : ""}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small">Loading visit story…</p>
            )}
          </section>
        )}
        {deleteConfirm && (
          <div className="delete-confirm">
            <strong>Delete this appointment?</strong>
            <p>
              The appointment will be removed. Its activity history is retained.
            </p>
            <button className="danger-button" disabled={busy} onClick={remove}>
              Yes, delete appointment
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setDeleteConfirm(false)}
            >
              Keep appointment
            </button>
          </div>
        )}
      </div>
      <footer className="dialog-footer">
        {current ? (
          <button
            className="text-button danger"
            onClick={() => setDeleteConfirm(true)}
            disabled={busy || stale}
          >
            <Icon name="trash" size={17} /> Delete
          </button>
        ) : (
          <span className="small muted">We’ll check for overlaps.</span>
        )}
        {!closed && (
          <button
            className="primary-button"
            form="appointment-form"
            type="submit"
            disabled={busy || stale}
          >
            {busy ? "Working…" : current ? "Save changes" : "Book appointment"}
            <Icon name="arrow" size={17} />
          </button>
        )}
      </footer>
    </dialog>
  );
}
