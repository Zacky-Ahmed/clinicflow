# ClinicFlow

A receptionist-focused appointment manager that explains scheduling conflicts and suggests available alternatives. Built with **Next.js, TypeScript, and MongoDB (connection pending)**.

## Current phase: backend foundation

Implemented: create/view/edit/delete appointments, combined search and filters, pagination, appointment lifecycle, doctor conflict prevention, three next-slot suggestions, daily doctor timelines, attention flags, and appointment activity history.

**Storage is currently in memory, for local development only.** It is empty at startup and resets on process restart. No MongoDB connection or production authentication is implemented yet. Production API readiness deliberately returns 503 until persistence is added. The homepage is a placeholder, not the final receptionist interface. Use fictional information only.

## Run locally

Use Node.js **24+** and npm. From this repository:

```sh
npm ci
# Optional: copy .env.example to .env.local and set CLINIC_TIMEZONE.
npm run dev
```

Open http://127.0.0.1:3001. Port 3001 is a development default; availability on the Raspberry Pi must be checked before deployment. The development server binds only to localhost.

```sh
npm run check       # TypeScript, ESLint, unit/API tests, and production compilation
npm run test:smoke  # With npm run dev running: real HTTP workflow, then cleanup
```

`npm run build` verifies compilation. `npm start` serves that build but appointment endpoints intentionally return 503 in production mode in this phase. Use `npm run dev` to explore the temporary backend.

## Scheduling behavior

- Clinic timezone defaults to **Asia/Colombo**, independently of the computer's timezone. Set an IANA timezone through `CLINIC_TIMEZONE`, then restart. This is a demo default, not an inferred clinic location.
- Fictional doctors share Monday–Friday 09:00–12:00 and 13:00–17:00; Saturday 09:00–13:00; Sunday closed. Hours live in `src/domain/scheduling.ts`.
- Consultation: 30 minutes; follow-up: 15; procedure: 60. Override with 15–120 minutes in 15-minute increments.
- Starts align to 15-minute boundaries in clinic time; bookings must be future and within 365 days. The whole visit must fit one opening interval.
- Store UTC instants; accept ISO timestamps with a timezone offset. Date filters use the clinic's calendar day, including daylight-saving boundaries.
- Overlap rule: `newStart < existingEnd && newEnd > existingStart`. Back-to-back visits are valid; different doctors can work simultaneously. Cancelled/no-show visits do not block slots.
- A conflict returns 409 with IDs/times and up to three alternatives. Suggestions search 14 calendar dates, are advisory, and are rechecked when booking.
- Edits/deletes require `expectedVersion`. A stale version returns 409. A rescheduled confirmed visit returns to scheduled for reconfirmation.
- Closed appointments cannot be edited or reopened. Checked-in/in-progress visits cannot be rescheduled. Check-in opens 30 minutes before start; no-show opens at start.
- Attention reasons: unconfirmed, late arrival, waiting, running over, and schedule conflict. These are derived indicators, not automatic status changes or patient messages.

## Structure

```text
src/domain/          Models, validation, pure scheduling rules
src/services/        Application workflows and invariants
src/repositories/    Storage contract and temporary memory adapter
src/server/          Dependency wiring and HTTP error/body handling
src/app/api/         Thin Next.js route handlers
src/config/          Fictional doctor catalog
tests/               Scheduling, concurrency, timezone, and HTTP tests
docs/                API contract and database implementation plan
```

See [API documentation](docs/API.md), [MongoDB next phase](docs/MONGODB_PLAN.md), and [AI usage and review log](AI_USAGE.md).

## Next phases

1. Connect a dedicated MongoDB database; implement durable atomic writes, indexes, and integration tests.
2. Build the receptionist dashboard, timeline, forms, rescheduling choices, and loading/error states.
3. Add the access model and request controls for a public demo, then deploy and verify ARM64 Docker on the Pi.

The infrastructure handoff describes an existing production service. Deployment needs isolated resources and a verified free localhost port. Its documented 00:00–06:00 Asia/Colombo shutdown affects demo availability. No Pi or Cloudflare changes have been made.

## Implementation references

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Zod schemas](https://zod.dev/api)

The lockfile records exact dependency resolution. Never commit `.env.local`, credentials, patient information, or the private infrastructure handoff.
