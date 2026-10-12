"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  appointmentTypes,
  statuses,
  type Appointment,
  type Doctor,
} from "@/domain/models";
import { api } from "@/lib/client-api";
import { ClinicScene } from "./clinic-scene";
import { Icon } from "./icons";
import { AppointmentDialog, statusLabels } from "./appointment-dialog";

type Clinic = { timezone: string; doctors: Doctor[] };
type Summary = {
  total: number;
  counts: Record<string, number>;
  needsAttention: { appointmentId: string; reasons: string[] }[];
  doctors: (Doctor & { appointments: Appointment[] })[];
};
const attentionLabels: Record<string, string> = {
  unconfirmed: "Needs confirmation",
  late_arrival: "Arrival overdue",
  waiting: "Checked in & waiting",
  running_over: "Visit running over",
  schedule_conflict: "Scheduling conflict",
};
const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

export default function ClinicDashboard() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [date, setDate] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<"overview" | "appointments" | "team">(
    "overview",
  );
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [query, setQuery] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [modal, setModal] = useState<{
    appointment: Appointment | null;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState<DateTime | null>(null);
  const [connected, setConnected] = useState(false);
  const [allDates, setAllDates] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    items: Appointment[];
    total: number;
    totalPages: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    let active = true;
    api<Clinic>("/clinic")
      .then((c) => {
        if (!active) return;
        setClinic(c);
        setDate(DateTime.now().setZone(c.timezone).toISODate()!);
      })
      .catch(() => {
        if (active) {
          setError("Couldn’t load the clinic. Refresh to try again.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!clinic) return;
    const tick = () => setNow(DateTime.now().setZone(clinic.timezone));
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [clinic]);
  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Summary>(`/dashboard?date=${date}`),
      api<{ persistent: boolean }>("/ready"),
    ])
      .then(([data, ready]) => {
        if (active) {
          setSummary(data);
          setConnected(ready.persistent);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "The schedule couldn’t be loaded. Check your connection and try again.",
          );
          setConnected(false);
          setSummary(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, revision]);
  useEffect(() => {
    if (tab !== "appointments" || !date) return;
    let active = true;
    setSearchLoading(true);
    setSearchError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "12",
      });
      if (!allDates) params.set("date", date);
      if (query) params.set("q", query);
      if (doctorFilter) params.set("doctorId", doctorFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("appointmentType", typeFilter);
      api<{ items: Appointment[]; total: number; totalPages: number }>(
        `/appointments?${params}`,
      )
        .then((data) => {
          if (active) setSearchResult(data);
        })
        .catch(() => {
          if (active) {
            setSearchError("Couldn’t load appointments. Please try again.");
            setSearchResult(null);
          }
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    tab,
    date,
    allDates,
    query,
    doctorFilter,
    statusFilter,
    typeFilter,
    page,
    revision,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setPaused(media.matches);
  }, []);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const appointments = useMemo(
    () =>
      summary?.doctors
        .flatMap((d) => d.appointments)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)) || [],
    [summary],
  );
  const filtered = appointments.filter(
    (a) =>
      (!query || a.patientName.toLowerCase().includes(query.toLowerCase())) &&
      (!doctorFilter || a.doctorId === doctorFilter) &&
      (!statusFilter || a.status === statusFilter) &&
      (!typeFilter || a.appointmentType === typeFilter),
  );
  const dateTime = DateTime.fromISO(date || "2000-01-01");
  const isToday = date === now?.toISODate();
  const timezone = clinic?.timezone || "Asia/Colombo";
  const time = (iso: string) =>
    DateTime.fromISO(iso, { zone: timezone }).toFormat("h:mm a");
  const changeDate = (days: number) => {
    setDate(dateTime.plus({ days }).toISODate()!);
    setPage(1);
  };
  const selectTab = (next: typeof tab) => {
    setTab(next);
    setPage(1);
    setQuery("");
    setDoctorFilter("");
    setStatusFilter("");
    setTypeFilter("");
  };
  const openNew = () => {
    if (clinic) setModal({ appointment: null });
  };
  const completed = summary?.counts.completed || 0;
  const waiting =
    (summary?.counts.checked_in || 0) + (summary?.counts.in_progress || 0);
  const upcoming = appointments.find(
    (a) =>
      !["cancelled", "completed", "no_show"].includes(a.status) &&
      Date.parse(a.startAt) > (now?.toMillis() || 0),
  );
  const hasFilters =
    !!query || !!doctorFilter || !!statusFilter || !!typeFilter;

  function rows(items: Appointment[]) {
    return (
      <div className="appointment-table">
        <div className="table-header">
          <span>Patient / visit</span>
          <span>Doctor</span>
          <span>When</span>
          <span>Status</span>
          <span />
        </div>
        {items.map((a) => (
          <button
            className="appointment-row"
            key={a.id}
            onClick={() => setModal({ appointment: a })}
          >
            <span className="patient-cell">
              <span className="patient-avatar">{initials(a.patientName)}</span>
              <span>
                <strong>{a.patientName}</strong>
                <small>
                  {appointmentTypes[a.appointmentType].label} ·{" "}
                  {a.durationMinutes} min
                </small>
              </span>
            </span>
            <span className="row-doctor">
              {clinic?.doctors.find((d) => d.id === a.doctorId)?.name}
            </span>
            <span>
              <strong className="row-time">{time(a.startAt)}</strong>
              <small>
                {DateTime.fromISO(a.startAt, { zone: timezone }).toFormat(
                  "d LLL yyyy",
                )}
              </small>
            </span>
            <span>
              <span className={`status ${a.status}`}>
                {statusLabels[a.status]}
              </span>
            </span>
            <Icon name="arrow" size={17} />
          </button>
        ))}
      </div>
    );
  }
  const empty = (
    <div className="empty-state">
      <div className="empty-calendar">
        <Icon name={hasFilters ? "search" : "calendar"} size={29} />
        <span>✦</span>
      </div>
      <h3>
        {hasFilters ? "No visits match just yet." : "A little breathing room."}
      </h3>
      <p>
        {hasFilters
          ? "Try a different name, doctor or status."
          : "Your schedule is clear. Let’s make space for the first visit."}
      </p>
      <button
        className="secondary-button"
        onClick={
          hasFilters
            ? () => {
                setQuery("");
                setDoctorFilter("");
                setStatusFilter("");
                setTypeFilter("");
              }
            : openNew
        }
      >
        {hasFilters ? "Clear filters" : "Book the first appointment"}
        <Icon name={hasFilters ? "refresh" : "plus"} size={16} />
      </button>
    </div>
  );
  return (
    <div className={`app-shell ${paused ? "motion-paused" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to schedule
      </a>
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="ClinicFlow home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            clinic<span className="brand-light">flow</span>
            <b>ROOM FOR BETTER DAYS</b>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-mark">C</span>
          <div>
            <strong>The care studio</strong>
            <small>Fictional demo clinic</small>
          </div>
          <span className="workspace-dots">•••</span>
        </div>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => selectTab("overview")}
          >
            <Icon name="grid" />
            Overview
            <span className="nav-active-dot" />
          </button>
          <button
            className={tab === "appointments" ? "active" : ""}
            onClick={() => selectTab("appointments")}
          >
            <Icon name="calendar" />
            Appointments
            <span className="nav-count">{summary?.total ?? "–"}</span>
          </button>
          <button
            className={tab === "team" ? "active" : ""}
            onClick={() => selectTab("team")}
          >
            <Icon name="people" />
            Care team
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span className="note-spark">✳</span>
            <h3>
              Good care starts
              <br />
              with a little flow.
            </h3>
            <p>
              A calmer desk.
              <br />A better day for everyone.
            </p>
            <div className="note-line" />
          </div>
          <div className="operator">
            <span>FD</span>
            <div>
              <strong>Front desk</strong>
              <small>Clinic workspace</small>
            </div>
            <Icon name="pulse" size={18} />
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {tab === "overview"
                ? "Overview"
                : tab === "appointments"
                  ? "Appointments"
                  : "Care team"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <i />
              FICTIONAL DATA ONLY
            </span>
            <span className="topbar-date">
              {now?.toFormat("ccc, d LLL") || "ClinicFlow"}
            </span>
            <span className="profile-avatar">FD</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-line" /> YOUR CLINIC, IN HARMONY
              </div>
              <h1>
                {tab === "overview" ? (
                  <>
                    A little more <em>flow.</em>
                  </>
                ) : tab === "appointments" ? (
                  <>
                    Every visit, <em>in place.</em>
                  </>
                ) : (
                  <>
                    The people behind <em>the care.</em>
                  </>
                )}
              </h1>
              <p>
                {tab === "overview"
                  ? "Less juggling. More time for the people who matter."
                  : tab === "appointments"
                    ? "Find a patient, fine-tune a visit, keep the day moving."
                    : "Three friendly faces. One thoughtfully planned day."}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={openNew}
              disabled={!clinic}
            >
              <Icon name="plus" size={18} /> New appointment
            </button>
          </div>
          {tab === "overview" && (
            <section className="welcome-card" aria-label="Your day with Flo">
              <div className="welcome-copy">
                <div className="pill-label">
                  <span /> MEET YOUR FRONT-DESK SIDEKICK
                </div>
                <h2>
                  Big care.
                  <br />
                  Small moments.
                  <br />
                  <span>Beautifully in sync.</span>
                </h2>
                <p>
                  I’m Flo. I’ll help you find the gaps,
                  <br className="desktop-break" /> spot the overlaps, and keep
                  things moving.
                </p>
                <button
                  className="welcome-link"
                  onClick={() =>
                    document.getElementById("schedule")?.scrollIntoView({
                      behavior: paused ? "instant" : "smooth",
                      block: "start",
                    })
                  }
                >
                  Let’s look at your day{" "}
                  <span>
                    <Icon name="arrow" size={18} />
                  </span>
                </button>
                <div className="welcome-caption">
                  <span className="small-orbit">✳</span> A little intelligence.
                  A lot of breathing room.
                </div>
              </div>
              <div className="scene-area">
                <div className="scene-tag">
                  <span className="live-dot" /> FLO IS ON DESK DUTY
                </div>
                <ClinicScene celebrating={!!toast} />
                <div className="scene-speech">
                  <Icon name="check" size={14} />
                  {toast
                    ? "Nice work. That’s taken care of!"
                    : "One appointment at a time. We’ve got this."}
                </div>
                <button
                  className="motion-toggle"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? "Play animations" : "Pause animations"}
                  aria-pressed={paused}
                >
                  <Icon name={paused ? "play" : "pause"} size={13} />
                  {paused ? "Play" : "Pause"} motion
                </button>
              </div>
            </section>
          )}
          <section className="metrics" aria-label="Selected day at a glance">
            <div className="metric">
              <span className="metric-icon peach">
                <Icon name="calendar" />
              </span>
              <div>
                <span>Total appointments</span>
                <strong>
                  {loading ? "–" : (summary?.total ?? "–")}
                  <small>
                    {isToday ? "on the board today" : "on the selected day"}
                  </small>
                </strong>
              </div>
            </div>
            <div className="metric">
              <span className="metric-icon lilac">
                <Icon name="people" />
              </span>
              <div>
                <span>In the clinic</span>
                <strong>
                  {loading ? "–" : summary ? waiting : "–"}
                  <small>checked in + in progress</small>
                </strong>
              </div>
            </div>
            <div className="metric">
              <span className="metric-icon sage">
                <Icon name="check" />
              </span>
              <div>
                <span>Visits completed</span>
                <strong>
                  {loading ? "–" : summary ? completed : "–"}
                  <small>
                    {summary?.total
                      ? `${Math.round((completed / summary.total) * 100)}% of the day’s visits`
                      : "Every little step counts"}
                  </small>
                </strong>
              </div>
            </div>
          </section>
          <div
            className={`dashboard-grid ${tab !== "overview" ? "full-width" : ""}`}
          >
            <section id="schedule" className="schedule-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE DAY, AT A GLANCE</span>
                  <h2>
                    {tab === "team"
                      ? "Your care team"
                      : tab === "appointments"
                        ? "Appointments"
                        : "The daily rhythm"}
                    <span className="count-bubble">
                      {tab === "appointments"
                        ? (searchResult?.total ?? "–")
                        : (summary?.total ?? "–")}
                    </span>
                  </h2>
                </div>
                <button
                  className="icon-button"
                  onClick={refresh}
                  disabled={loading}
                  aria-label="Refresh appointments"
                >
                  <Icon name="refresh" size={18} />
                </button>
              </div>
              <div className="schedule-toolbar">
                <div className="date-control">
                  <button
                    className="icon-button"
                    onClick={() => changeDate(-1)}
                    disabled={!date}
                    aria-label="Previous day"
                  >
                    <Icon
                      name="chevron"
                      size={16}
                      style={{ transform: "rotate(180deg)" }}
                    />
                  </button>
                  <label className="date-input-label">
                    <Icon name="calendar" size={16} />
                    <input
                      type="date"
                      aria-label="Schedule date"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) {
                          setDate(e.target.value);
                          setPage(1);
                        }
                      }}
                    />
                  </label>
                  <button
                    className="icon-button"
                    onClick={() => changeDate(1)}
                    disabled={!date}
                    aria-label="Next day"
                  >
                    <Icon name="chevron" size={16} />
                  </button>
                  <button
                    className="today-button"
                    onClick={() => {
                      if (now) {
                        setDate(now.toISODate()!);
                        setPage(1);
                      }
                    }}
                  >
                    Today
                  </button>
                </div>
                {tab === "overview" && (
                  <div className="view-toggle" aria-label="Schedule view">
                    <button
                      aria-label="Timeline view"
                      aria-pressed={view === "timeline"}
                      className={view === "timeline" ? "selected" : ""}
                      onClick={() => setView("timeline")}
                    >
                      <Icon name="grid" size={15} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={view === "list"}
                      className={view === "list" ? "selected" : ""}
                      onClick={() => setView("list")}
                    >
                      <Icon name="list" size={17} />
                    </button>
                  </div>
                )}
                {tab === "appointments" && (
                  <label className="all-dates">
                    <input
                      type="checkbox"
                      checked={allDates}
                      onChange={(e) => {
                        setAllDates(e.target.checked);
                        setPage(1);
                      }}
                    />
                    All dates
                  </label>
                )}
              </div>
              {tab !== "team" && (
                <div className="filters">
                  <label className="search-field">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Search patients"
                      placeholder="Find a patient…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filter by doctor"
                    value={doctorFilter}
                    onChange={(e) => {
                      setDoctorFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All doctors</option>
                    {clinic?.doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    {statuses.map((s) => (
                      <option value={s} key={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                  {tab === "appointments" && (
                    <select
                      aria-label="Filter by visit type"
                      value={typeFilter}
                      onChange={(e) => {
                        setTypeFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All visit types</option>
                      {Object.entries(appointmentTypes).map(([id, t]) => (
                        <option value={id} key={id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {error ? (
                <div className="panel-error" role="alert">
                  <Icon name="pulse" size={28} />
                  <h3>Let’s get back in sync.</h3>
                  <p>{error}</p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      clinic ? refresh() : window.location.reload()
                    }
                  >
                    Try again
                  </button>
                </div>
              ) : loading ? (
                <div
                  className="schedule-skeleton"
                  aria-label="Loading schedule"
                  role="status"
                >
                  <div />
                  <div />
                  <div />
                  <span>Getting your day in order…</span>
                </div>
              ) : tab === "team" ? (
                <div className="team-grid">
                  {clinic?.doctors.map((d, i) => (
                    <article className={`team-card doctor-${i}`} key={d.id}>
                      <span className={`doctor-avatar doctor-${i}`}>
                        {initials(d.name)}
                      </span>
                      <h3>{d.name}</h3>
                      <p>{d.specialty}</p>
                      <div>
                        <strong>
                          {
                            appointments.filter((a) => a.doctorId === d.id)
                              .length
                          }
                        </strong>{" "}
                        visits on {dateTime.toFormat("d LLL")}
                      </div>
                      <small>
                        Mon–Fri 9–12 & 13–17
                        <br />
                        Saturday 9–13 · Sunday closed
                      </small>
                      <button
                        className="text-button"
                        onClick={() => {
                          setTab("appointments");
                          setDoctorFilter(d.id);
                          setPage(1);
                        }}
                      >
                        View appointments <Icon name="arrow" size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : tab === "appointments" ? (
                <>
                  {searchError ? (
                    <div className="error-banner" role="alert">
                      {searchError}
                      <button onClick={refresh}>Retry</button>
                    </div>
                  ) : searchLoading ? (
                    <div className="list-loading" role="status">
                      Finding your appointments…
                    </div>
                  ) : searchResult?.items.length ? (
                    rows(searchResult.items)
                  ) : (
                    empty
                  )}
                  {searchResult && searchResult.totalPages > 1 && (
                    <div className="pagination">
                      <button
                        className="secondary-button"
                        disabled={page <= 1 || searchLoading}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {page} of {searchResult.totalPages}
                      </span>
                      <button
                        className="secondary-button"
                        disabled={
                          page >= searchResult.totalPages || searchLoading
                        }
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : view === "list" ? (
                filtered.length ? (
                  rows(filtered)
                ) : (
                  empty
                )
              ) : (
                <div className="timeline-scroll">
                  <div className="timeline">
                    <div className="timeline-head">
                      <div className="time-zone">
                        {now?.offsetNameShort || "Clinic time"}
                      </div>
                      {clinic?.doctors
                        .filter((d) => !doctorFilter || d.id === doctorFilter)
                        .map((d) => (
                          <div className="doctor-heading" key={d.id}>
                            <span
                              className={`doctor-avatar doctor-${clinic.doctors.indexOf(d)}`}
                            >
                              {initials(d.name)}
                            </span>
                            <div>
                              <strong>{d.name}</strong>
                              <small>
                                {
                                  appointments.filter(
                                    (a) => a.doctorId === d.id,
                                  ).length
                                }{" "}
                                appointments
                              </small>
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="timeline-body">
                      <div className="time-labels">
                        {Array.from({ length: 9 }, (_, i) => (
                          <span key={i}>
                            {String(i + 9).padStart(2, "0")}
                            <small>:00</small>
                          </span>
                        ))}
                      </div>
                      <div className="doctor-columns">
                        {clinic?.doctors
                          .filter((d) => !doctorFilter || d.id === doctorFilter)
                          .map((d) => (
                            <div className="doctor-column" key={d.id}>
                              {Array.from({ length: 8 }, (_, i) => (
                                <div className="hour-cell" key={i} />
                              ))}
                              <div
                                className="lunch-block"
                                style={
                                  dateTime.weekday === 7
                                    ? { top: 0, height: 832 }
                                    : dateTime.weekday === 6
                                      ? { top: 416, height: 416 }
                                      : undefined
                                }
                              >
                                {dateTime.weekday === 7
                                  ? "Sunday"
                                  : dateTime.weekday === 6
                                    ? "13:00 — 17:00"
                                    : "12:00 — 13:00"}
                                <span>
                                  {dateTime.weekday >= 6
                                    ? "Clinic closed"
                                    : "Lunch & reset"}
                                </span>
                              </div>
                              {filtered
                                .filter((a) => a.doctorId === d.id)
                                .map((a) => {
                                  const start = DateTime.fromISO(a.startAt, {
                                    zone: timezone,
                                  });
                                  return (
                                    <button
                                      key={a.id}
                                      className={`timeline-appointment doctor-${clinic.doctors.indexOf(d)} ${a.status === "cancelled" || a.status === "no_show" ? "inactive-visit" : ""}`}
                                      style={{
                                        top:
                                          (start.hour - 9 + start.minute / 60) *
                                          104,
                                        height: Math.max(
                                          (a.durationMinutes / 60) * 104 - 4,
                                          23,
                                        ),
                                      }}
                                      onClick={() =>
                                        setModal({ appointment: a })
                                      }
                                      title={`${a.patientName} · ${time(a.startAt)} · ${statusLabels[a.status]}`}
                                    >
                                      <strong>{a.patientName}</strong>
                                      {a.durationMinutes >= 30 && (
                                        <span>
                                          {time(a.startAt)} ·{" "}
                                          {
                                            appointmentTypes[a.appointmentType]
                                              .label
                                          }
                                        </span>
                                      )}
                                      {a.durationMinutes >= 45 && (
                                        <span className={`status ${a.status}`}>
                                          {statusLabels[a.status]}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                            </div>
                          ))}
                        {isToday && now && now.hour >= 9 && now.hour < 17 && (
                          <div
                            className="now-line"
                            style={{
                              top: (now.hour - 9 + now.minute / 60) * 104,
                            }}
                          >
                            <span>{now.toFormat("HH:mm")}</span>
                          </div>
                        )}
                      </div>
                      {filtered.length === 0 && (
                        <div className="timeline-empty">
                          <span>✳</span>
                          <strong>
                            {hasFilters
                              ? "No matching visits"
                              : "The day is yours to shape."}
                          </strong>
                          <button
                            onClick={
                              hasFilters
                                ? () => {
                                    setQuery("");
                                    setDoctorFilter("");
                                    setStatusFilter("");
                                  }
                                : openNew
                            }
                          >
                            {hasFilters
                              ? "Clear filters"
                              : "Add your first visit"}{" "}
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <footer className="schedule-footer">
                <span>
                  <i className="legend-dot peach-dot" />
                  Consultations & care
                </span>
                <span>
                  <Icon name="clock" size={13} />{" "}
                  {timezone.replaceAll("_", " ")}
                </span>
              </footer>
            </section>
            {tab === "overview" && (
              <aside className="right-column">
                <section className="attention-panel">
                  <div className="attention-heading">
                    <span className="attention-icon">
                      <Icon name="spark" size={19} />
                    </span>
                    <h2>A little attention</h2>
                    <span>{summary?.needsAttention.length || 0}</span>
                  </div>
                  <p>Small things to keep the day flowing.</p>
                  {loading ? (
                    <p className="muted">Checking your day…</p>
                  ) : error ? (
                    <p className="muted">
                      Available when the schedule reconnects.
                    </p>
                  ) : summary?.needsAttention.length ? (
                    <div className="attention-list">
                      {summary.needsAttention.map((item) => {
                        const a = appointments.find(
                          (a) => a.id === item.appointmentId,
                        );
                        return a ? (
                          <button
                            key={a.id}
                            onClick={() => setModal({ appointment: a })}
                          >
                            <span className="attention-dot" />
                            <span>
                              <strong>{a.patientName}</strong>
                              <small>
                                {
                                  attentionLabels[
                                    item.reasons[item.reasons.length - 1]
                                  ]
                                }{" "}
                                · {time(a.startAt)}
                              </small>
                            </span>
                            <Icon name="chevron" size={15} />
                          </button>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <div className="all-clear">
                      <span>
                        <Icon name="check" size={23} />
                      </span>
                      <h3>All clear, all calm.</h3>
                      <p>
                        No loose ends on this day.
                        <br />
                        Flo approves.
                      </p>
                      <div className="mini-wave">〰 〰 〰</div>
                    </div>
                  )}
                </section>
                <section className="next-card">
                  <span className="eyebrow">NEXT IN THE FLOW</span>
                  {upcoming ? (
                    <>
                      <h3>
                        {time(upcoming.startAt)} <span>↗</span>
                      </h3>
                      <strong>{upcoming.patientName}</strong>
                      <p>
                        {
                          clinic?.doctors.find(
                            (d) => d.id === upcoming.doctorId,
                          )?.name
                        }{" "}
                        · {upcoming.durationMinutes} min
                      </p>
                      <button
                        onClick={() => setModal({ appointment: upcoming })}
                      >
                        Open appointment <Icon name="arrow" size={17} />
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>
                        A moment
                        <br />
                        to reset. <span>✳</span>
                      </h3>
                      <p>
                        No upcoming visits on this day.
                        <br />A fresh start is a booking away.
                      </p>
                      <button onClick={openNew}>
                        Make a little room <Icon name="plus" size={17} />
                      </button>
                    </>
                  )}
                </section>
                <div className="daily-note">
                  <span>FRONT-DESK FIELD NOTES / 01</span>
                  <p>
                    “A well-planned day
                    <br />
                    leaves room for
                    <br />
                    <em>being human.</em>”
                  </p>
                  <i>✳</i>
                </div>
              </aside>
            )}
          </div>
          <footer className="page-footer">
            <span>
              Thoughtfully scheduled. <strong>Humanly cared for.</strong>
            </span>
            <span className="connection">
              <i className={connected ? "online" : ""} />
              {connected
                ? "Connected to your clinic"
                : loading
                  ? "Connecting…"
                  : "Connection unavailable"}
            </span>
          </footer>
        </main>
      </div>
      {modal && clinic && (
        <AppointmentDialog
          appointment={modal.appointment}
          doctors={clinic.doctors}
          timezone={timezone}
          date={date}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setToast(message);
            refresh();
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={18} />
          </span>
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
