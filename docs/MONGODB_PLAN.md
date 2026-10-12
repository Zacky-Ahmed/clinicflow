# MongoDB implementation plan — next phase

MongoDB is selected but **not connected**. The current memory repository is only a local development/test adapter.

## Connection

Use a dedicated ClinicFlow database/user. Do not reuse the existing application's collections, credentials, or volumes. Put the URI in ignored `.env.local` and later in isolated deployment secrets; do not paste credentials into chat or GitHub.

Establish whether MongoDB is Atlas or self-hosted and whether transactions are supported. Multi-document transactions require a replica set or sharded cluster. A standalone server needs a deliberate alternate design or replica-set configuration; do not silently remove atomic checks.

## Model and indexes

- appointments: UUID public IDs, patientName, doctorId, appointmentType, UTC BSON Date startAt/endAt, durationMinutes, status, version, timestamps.
- doctors: initially seed the fictional catalog; clinic settings stay explicit.
- appointment_events: append in the same transaction as writes; index appointmentId/event order. Add authenticated actor IDs when auth exists.
- doctor_schedule_locks: one document per doctor with a revision incremented in scheduling transactions.
- Candidate indexes: doctorId/startAt, startAt, status/startAt, appointmentId/version for events. Confirm with explain plans. Literal substring search is adequate for this small fictional demo; scalable search is a later concern.

## Avoid double-booking races

A query followed by insert is insufficient: two requests can both observe an empty slot. A unique doctor/startAt index prevents identical starts, not partial overlap.

Use a transaction that updates the doctor's lock/revision, checks overlap against blocking statuses, and writes appointment/event atomically. Retry retryable transaction conflicts with a bounded policy. Moving doctors acquires both records in deterministic ID order. Match expectedVersion during edit/delete. Verify using simultaneous integration clients against a real replica set.

The current snapshot contract exposes atomic writes for small demo correctness. A database adapter must not load/rewrite all appointments for every request. Refine it to targeted queries/transactions while preserving tested service behavior.

## Integration checks

Persistence across restart; concurrent creates/reschedules; stale edit/delete; rollback including events; cancelled/no-show slot reuse; timezone ranges; database-unavailable readiness; isolated fictional seed/reset.

## Deployment boundary

Production remains disabled until persistence and access controls are implemented. Validate ARM64 image support, an isolated Compose project, a verified unused loopback port, and new hostname. Inspect the Pi before changes. The private infrastructure handoff stays outside this public repo.
