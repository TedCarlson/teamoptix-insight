# Insight Mobile Companion — MC-0 / MC-1 Implementation

**Implemented:** August 9, 2026
**Activation status:** Implemented, not active
**Expo build status:** Not created

The database migrations and SQL regression were validated against an isolated,
schema-only copy of the linked Supabase schema. No production write or Expo/EAS
build was performed. The separate
`SUPABASE_MIGRATION_ALIGNMENT_AUDIT_2026-08-09.md` records the exact repository,
local Docker, and linked Supabase states plus the historical clean-replay gaps.

## Governed boundary

The Platform Switchboard now defines `core.driver_tracking_session`,
`core.driver_breadcrumb_batch`, and the extended
`core.driver_breadcrumb_point`. The implementation preserves the source as
either `DRIVER_WEB` or `MOBILE_COMPANION` at the server-owned write boundary.

Mobile tracking is valid only inside an explicit duty session. The resulting
records are device-location observations. They do not automatically establish
payroll time, an assigned vehicle, carrier activity, delivery completion, or
odometer-actual mileage.

The Switchboard records remain `IMPLEMENTED`, not `ACTIVE`, until device parity,
privacy, retention, and rollout gates are accepted.

## MC-1 vertical slice

`apps/mobile-companion` is an Expo SDK 57 React Native application for iOS and
Android. It reuses Supabase authentication plus Insight's existing
`ensure_access_context` and `access_context` authority. There is no separate
mobile identity or roster source.

The outbox uses:

- one SQLCipher database per authenticated user;
- a random 256-bit database key held in the operating-system secure store;
- device-generated UUIDs for sessions, points, and immutable batches;
- WAL transactions for sealing batches and applying acknowledgments;
- company identifiers on every local query and mutation;
- retry scheduling that never deletes unacknowledged evidence;
- server-persisted acknowledgments for exact duplicate batch submissions.

Expo Go is intentionally rejected because it does not contain SQLCipher. A
development build will be needed for on-device testing, but no build has been
created by this implementation.

Only user-initiated foreground location or development-only synthetic points
exist in MC-1. Both iOS and Android background-location settings are explicitly
disabled.

## Acceptance criteria

MC-0 is accepted when:

1. All three objects exist in the Platform Switchboard before their schema is
   activated.
2. `DRIVER_WEB` and `MOBILE_COMPANION` provenance cannot be selected by an
   authenticated client.
3. A mobile point requires the caller's active company membership, exactly one
   eligible internal roster record, a governed duty session, and an immutable
   batch.
4. Warehouse comments and payloads identify location as observation-only.
5. Legacy browser breadcrumb reads remain restricted to `DRIVER_WEB` evidence.

MC-1 is accepted when:

1. Existing Insight credentials authenticate and active company access is
   loaded from `access_context`.
2. The outbox refuses to run without SQLCipher and survives process termination
   and device restart with unchanged identifiers and payloads.
3. Starting and stopping duty is explicit; points cannot be captured outside an
   open session.
4. Foreground permission behavior and UI are equivalent on supported iOS and
   Android versions; background permission is absent.
5. Exact duplicate batches return their persisted acknowledgment; changed
   content under an existing batch ID fails.
6. Partial acknowledgments retain a per-point accepted, duplicate, or rejected
   disposition.
7. Offline and transient failures retain all pending rows and back off safely.
8. A signed-in user cannot read, seal, apply, or synchronize another company's
   outbox rows or another user's encrypted database.

## Verification matrix before activation

| Scenario | Automated contract check | Required device check |
| --- | --- | --- |
| Offline persistence | Immutable persisted-payload recovery | Capture in airplane mode, force quit, relaunch |
| Restart recovery | Stored point/batch IDs survive hydration | Reboot each platform before sync |
| Partial failure | Per-point disposition test | Submit a test batch containing one invalid point |
| Duplicate batch | Duplicate acknowledgment test | Replay identical payload after a lost response |
| Tenant isolation | Cross-tenant application rejection test | Switch companies and inspect independent counts |
| Background permission | Expo configuration test | Confirm OS settings show only while-in-use access |
| Platform parity | Shared TypeScript implementation | Complete the same script on current iOS and Android |

The device checks require the first development builds and test accounts. They
remain a release gate; this repository change does not claim they have run.

## Smallest safe rollout sequence

1. Apply and inspect the MC-0 Switchboard migration.
2. Apply the schema/RPC migration in a non-production Supabase environment and
   run tenant/idempotency SQL scenarios.
3. Link the existing Expo project locally and set environment secrets without
   committing them.
4. Create one iOS and one Android development build; do not distribute them.
5. Run the verification matrix with synthetic points, then foreground points.
6. Review retention, privacy notice, support, and incident handling.
7. Mark Switchboard entries `ACTIVE` only after explicit approval.

## Later roadmap — not built

Adaptive background telemetry, terminal BOD/EOD inference,
`observed_path_miles`, Delivery Location/access-point observations, governed
TeamOptix geocode batches, low-cost mobile geocoding, and Green Sheet
contingency evidence remain parked. Green Sheet evidence will not simulate a
carrier scanner or become a carrier system of record. Delivery Location work
continues to require company scoping, no bulk customer-location export, and the
explicit DPA/privacy/retention gates recorded in
`DELIVERY_LOCATION_DPA_UPDATE_PLAN.md`.
