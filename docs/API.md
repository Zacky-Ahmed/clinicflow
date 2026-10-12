# API contract — backend phase

Base URL: `http://127.0.0.1:3001/api`. No authentication in this **localhost-only phase**. With MONGODB_URI configured, appointment APIs use durable MongoDB storage, including in a production build. Do not expose publicly until access controls are implemented. All examples use fictional information.

Success: `{ "data": ... }`. Error: `{ "error": { "code", "message", "requestId", "details"? } }`. Validation errors return field paths/messages. JSON bodies are capped at 16 KB. Unknown fields, duplicate query parameters, invalid IDs, and timezone-free timestamps are rejected. Cross-origin writes are rejected when an Origin header is present; this is not authentication.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/clinic` | Fictional doctors, hours, timezone, types, transitions |
| GET | `/appointments` | Search/filter/paginate |
| POST | `/appointments` | Create; returns 201 |
| GET | `/appointments/:id` | Read one |
| PATCH | `/appointments/:id` | Edit fields, with expectedVersion |
| DELETE | `/appointments/:id?expectedVersion=1` | Delete; returns 204 |
| PATCH | `/appointments/:id/status` | Change workflow status |
| GET | `/appointments/:id/activity` | Latest 50 events, newest first; accessible after deletion |
| GET | `/availability` | Up to three available slots |
| GET | `/dashboard?date=YYYY-MM-DD` | Daily counts, attention flags and doctor timelines |
| GET | `/health` | Process liveness and configured storage mode; does not ping the database |
| GET | `/ready` | Checks MongoDB connection/index initialization; 503 if unavailable or production is unconfigured |

## Create

```json
{
  "patientName": "Demo Taylor",
  "doctorId": "11111111-1111-4111-8111-111111111111",
  "appointmentType": "consultation",
  "startAt": "2026-10-13T09:00:00+05:30",
  "durationMinutes": 30,
  "status": "scheduled"
}
```

Choose a future weekday/time when trying this example. Duration is optional and defaults from type; status defaults to scheduled and may initially be scheduled or confirmed. The response adds UUID id, derived UTC endAt, version=1, and creation/update timestamps. The patient field is a display name; there is no real patient registry or identity matching.

## Edit and status

```json
{ "startAt": "2026-10-13T10:00:00+05:30", "expectedVersion": 1 }
```

Editable fields: patientName, doctorId, appointmentType, startAt, durationMinutes. The API calculates endAt. Changing type applies its default duration unless duration is supplied. A no-op returns the current version. Status changes use the separate status endpoint:

```json
{ "status": "confirmed", "expectedVersion": 2 }
```

| From | Allowed next statuses |
| --- | --- |
| scheduled | confirmed, checked_in, cancelled, no_show |
| confirmed | checked_in, cancelled, no_show |
| checked_in | in_progress, cancelled |
| in_progress | completed |
| completed / cancelled / no_show | none |

Repeating the current status with the current version is a no-op. A stale expectedVersion returns STALE_VERSION (409), including on delete. Refresh and resolve the intended change; do not blindly retry with a newer version.

## Search and availability

`GET /appointments?q=demo&doctorId=...&status=confirmed&appointmentType=consultation&date=2026-10-13&page=1&pageSize=20`

All filters are optional and combine with AND. q is a case-insensitive literal patient-name substring (not regex). Date uses clinic time. Optional from/to are offset-bearing instants applied to start time as `[from, to)`. Page defaults to 1, pageSize to 20 (max 100). Sort: startAt then ID. Result: items, total, page, pageSize, totalPages.

`GET /availability?doctorId=...&from=2026-10-13T03%3A30%3A00Z&durationMinutes=30`

Use URLSearchParams to encode timestamps (a literal + must be %2B). Optional excludeAppointmentId excludes the booking being rescheduled. Results contain slots with UTC startAt/endAt, timezone, searchDays=14. Zero slots means no candidate in that window, not no future availability.

## Conflicts and activity

SCHEDULE_CONFLICT returns 409 with details.conflicts (IDs/time ranges) and details.suggestions (up to three slots). Patient names are omitted from conflict details. Submit the user's chosen alternative through normal create/edit; another booking may have taken it meanwhile.

Activity records action, timestamp, version, changed field names, and status transitions. MongoDB writes events atomically with appointment changes. It omits old/new patient names and has no authenticated actor yet, so it is an operational history rather than a compliance audit trail. Memory-mode history is temporary.

The dashboard groups appointments by doctor with status counts and derived needsAttention entries. It does not move appointments, notify patients, or infer medical urgency.
