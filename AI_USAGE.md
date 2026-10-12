# AI usage and review log

## Backend phase — 2026-10-12

Tool: OpenAI Codex. The user selected the product concept, MongoDB, public repository, and backend-first sequence. Codex generated the Next.js structure, domain/service/repository layers, HTTP endpoints, tests, and documentation. MongoDB, the frontend application, authentication, and deployment are not claimed complete.

### Review and corrections by Codex

- Reviewed overlap boundaries: adjacent visits are allowed, contained/partial overlaps rejected.
- Serialized memory writes against a cloned draft so failed writes cannot partly save appointments or activity. Tests exercise ten competing bookings and competing edits.
- Added expectedVersion checks for edits, status changes, and deletion to prevent lost changes.
- Normalized UTC timestamps and used clinic-calendar filters. Tests cover Sydney's 23/25-hour DST days and a local date starting on the previous UTC date.
- Kept slot suggestions advisory and revalidated on booking.
- Made temporary storage explicit and refused production readiness before MongoDB integration.
- Dependency review found the newest TypeScript major incompatible with lint tooling. Selected a supported version. Replaced the Next-specific lint preset's vulnerable transitive glob chain with standard TypeScript linting for this backend phase, without downgrading Next.js.
- Tested malformed/oversized JSON, duplicate/unknown parameters, content types, HTTP codes, cross-origin writes, and sanitized errors.

### Verification

`npm run check` runs types, lint, tests, and compilation. `npm run test:smoke` exercises real HTTP against the local development server and cleans up its fictional appointment. GitHub Actions runs standard checks on pushes/pull requests.

These are AI-performed implementation/review steps. The applicant should review the code, run the demo, and add their own findings before submission. Do not represent AI review as independent human review.

## MongoDB integration — 2026-10-12

Codex configured the user-authorized local .env and connected Atlas without committing credentials. Added the official driver adapter with BSON dates, indexes, pooled connections, transactional activity, and a shared clinic revision lock. Scoped write snapshots avoid rewriting unaffected appointments. The global clinic lock intentionally favors correctness over high write throughput.

Validation: the existing 45 tests plus four opt-in Atlas integration tests passed. The Atlas tests cover independent-connection persistence, six simultaneous bookings, rollback, stale edits/deletes, cancellation slot reuse, and stored activity. The real HTTP smoke workflow passed against MongoDB in development and production mode. A separately saved fictional appointment was retrieved after stopping the development server and starting the production server, then cleaned up. Authentication and the final frontend remain future work.
