# MongoDB implementation

MongoDB is connected through the official Node.js driver. The adapter uses the named database from `.env`, connection pooling, BSON dates, indexed collections, and atomic transactions. The memory adapter remains available for offline tests and development without a URI.

## Connection

Use a dedicated ClinicFlow database/user. Do not reuse the existing application's collections or volumes. Put the URI in ignored `.env` and later in isolated deployment secrets. Restart the server after credential changes. The default database name is clinicflow.

Atlas supports the required transactions. A self-hosted alternative must be a replica set or sharded cluster; a standalone server is unsupported. The adapter never silently downgrades to non-transactional writes.

## Model and indexes

- appointments: UUID public IDs, patientName, doctorId, appointmentType, UTC BSON Date startAt/endAt, durationMinutes, status, version, timestamps.
- Doctors currently come from the fictional code catalog; clinic settings stay explicit. There is no doctors collection yet.
- appointment_events: append in the same transaction as writes; index appointmentId/event order. Add authenticated actor IDs when auth exists.
- schedule_locks: one clinic lock document with a revision incremented in every write transaction.
- Implemented indexes: doctorId/startAt, startAt, status/startAt, and unique appointmentId/version for events. UUID _id is the appointment identity. Literal substring search/filter pagination currently runs in the service over loaded appointments; push these into database queries before scaling beyond a small clinic demo.

## Avoid double-booking races

A query followed by insert is insufficient: two requests can both observe an empty slot. A unique doctor/startAt index prevents identical starts, not partial overlap.

Each transaction first increments a shared clinic lock, then reads the needed appointment snapshot, applies the tested rules, and writes only changed appointments and new events. MongoDB retries write conflicts from a fresh snapshot. A 20-second transaction timeout bounds retries; commits use majority write concern and a 10-second cap. Matching versions protects edit/delete. Six simultaneous requests through independent clients are covered by the integration suite.

The clinic lock is a deliberate small-app correctness tradeoff: it serializes all appointment writes, including different doctors. It also handles moving a visit between doctors without lock-order races. Higher write throughput would require per-doctor locks and integration tests for cross-doctor moves. Booking writes load the relevant doctor's appointments; status/deletion load only their target. Existing activity is loaded only for activity requests, capped at 50. Unchanged appointment documents are never rewritten.

## Integration checks

Run `npm run test:mongo` explicitly to use `.env`. Tests isolate records under a random fictional doctor ID and remove only those test records. They verify cross-connection persistence/BSON dates, concurrent creates, stale versions, failed-edit rollback, status changes, cancelled-slot reuse, deletion activity, and callback rollback. Unit/HTTP tests run without database credentials. The real HTTP smoke workflow can also run against the configured local server.

## Deployment boundary

Production builds can use MongoDB on localhost. Public deployment still needs authentication/access controls. Validate ARM64 image support, an isolated Compose project, a verified unused loopback port, and a new hostname. Inspect the Pi before changes. The private infrastructure handoff stays outside this public repo.
