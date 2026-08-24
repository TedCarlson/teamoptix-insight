# Insight Mobile Companion — MC-0 / MC-1 Implementation

**Implemented:** August 9, 2026

**Last verified:** August 10, 2026

**Activation status:** Implemented, not active

**Device build status:** Local iOS development build installed and tested; no
EAS cloud builds consumed; Android device parity remains pending

> **Superseded rollout boundary — August 24, 2026:** The original foreground-
> only MC-1 scope below is retained as implementation history. The approved
> 1.0 distribution scope now includes Face ID/device authentication and
> background GPS only inside an intent-confirmed duty session. See
> `MOBILE_COMPANION_1_0_DUTY_LOCATION_AND_DEVICE_AUTH.md` for the controlling
> launch contract.

The MC-0, MC-1, and driver-preflight migrations are committed to GitHub `main`,
applied to the linked Supabase project, and ledger-aligned through
`20260809162000`. GitHub CI, the Supabase alignment guard, and Vercel passed on
the merged implementation. A SQLCipher-enabled development build was installed
locally through Xcode on a physical iPhone using an Apple Personal Team. No EAS
cloud build was created.

The separate `SUPABASE_MIGRATION_ALIGNMENT_AUDIT_2026-08-09.md` preserves the
historical alignment investigation. It should not be read as the current
deployment state.

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
`ensure_access_context` profile bootstrap and the fail-closed
`mobile_companion_driver_access` preflight. There is no separate mobile identity
or roster source. Ordinary company membership does not enable duty tracking.

The outbox uses:

- one SQLCipher database per authenticated user;
- a random 256-bit database key held in the operating-system secure store;
- device-generated UUIDs for sessions, points, and immutable batches;
- WAL transactions for sealing batches and applying acknowledgments;
- company identifiers on every local query and mutation;
- retry scheduling that never deletes unacknowledged evidence;
- server-persisted acknowledgments for exact duplicate batch submissions.

Expo's exclusive transaction helper opens an isolated SQLite connection, while
SQLCipher keys are connection-specific. The outbox therefore opens and keys its
own transaction connection before `BEGIN IMMEDIATE`; a regression test protects
that device-discovered requirement.

Expo Go remains intentionally unsupported because it does not contain this
app's SQLCipher configuration. The installed native development build is the
supported MC-1 device-test shell.

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

## Verification evidence before activation

| Scenario | Automated evidence | Physical-device evidence | Status |
| --- | --- | --- | --- |
| Encrypted queue and batch sealing | SQLCipher connection-order regression | Repeated iPhone start/capture/stop cycles completed without plaintext fallback | Passed on iOS |
| Explicit acknowledgment | Acknowledgment parser and disposition tests | Eligible demo driver synchronized one session and one batch; pending counts returned to zero | Passed on iOS |
| Offline persistence | Immutable persisted-payload recovery | Airplane mode, force quit, and relaunch script still required | Pending device script |
| Restart recovery | Stored identifiers survive hydration | Full device reboot before synchronization still required | Pending device script |
| Partial failure | Per-point disposition test | Server retained one invalid point and acknowledged the valid session/batch | Passed on iOS |
| Stale foreground fix | Duty-window validation test | Historical iOS fix outside the session was diagnosed; later valid cycle added no rejection | Passed on iOS |
| Duplicate batch | Duplicate acknowledgment test | Replay after a deliberately lost response still required | Pending device script |
| Tenant/user isolation | Tenant assertions and user-specific encrypted database | Account switching preserved separate counts and evidence; multi-company switching remains to test | Partially passed on iOS |
| Driver preflight | Exact eligible-roster SQL contract | Eligible demo driver passed; explicit ineligible-account relaunch check remains | Partially passed on iOS |
| Background permission | Expo configuration test | Confirm iOS and Android settings expose no background permission | Pending settings review |
| Platform parity | Shared TypeScript implementation | iOS happy path passed; Android emulator and physical-device pass remain | Android pending |

Nine Mobile Companion Jest tests and the TypeScript check pass as of the last
verification date. These results prove the iOS happy path, but they do not mark
the Switchboard objects `ACTIVE`.

## Device-discovered failures resolved

1. The SQLCipher batch transaction originally failed with `file is not a
   database` because a helper opened an unkeyed connection. The transaction now
   explicitly opens, keys, verifies, commits, and closes its own connection.
2. A foreground iOS location fix could predate a newly opened duty session. The
   app now blocks that fix locally and asks the driver to capture again.
3. General company membership was too broad for duty preflight. The app now
   requires the same eligible INTERNAL Active/Trainee roster authority used by
   synchronization and fails closed if that preflight is unavailable.

## Remaining MC-1 closeout sequence

1. Run the iOS airplane-mode, force-quit, reboot, and duplicate-response-loss
   scripts without deleting the retained historical rejection.
2. Run the same happy-path and recovery scripts on Android, first in an emulator
   and then on one physical device before rollout.
3. Confirm OS settings expose only while-in-use location access on both
   platforms.
4. Complete a multi-company tenant-switch test and an explicit ineligible-user
   preflight test.
5. Approve retention, privacy notice, support, and incident-handling behavior.
6. Replace the development-focused Duty & Outbox presentation with the approved
   Driver Home surface while retaining diagnostics under Settings.
7. Mark Switchboard entries `ACTIVE` only after explicit product approval.

## Later roadmap — not built

Adaptive background telemetry, terminal BOD/EOD inference,
`observed_path_miles`, Delivery Location/access-point observations, governed
TeamOptix geocode batches, low-cost mobile geocoding, and Green Sheet
contingency evidence remain parked. Green Sheet evidence will not simulate a
carrier scanner or become a carrier system of record. Delivery Location work
continues to require company scoping, no bulk customer-location export, and the
explicit DPA/privacy/retention gates recorded in
`DELIVERY_LOCATION_DPA_UPDATE_PLAN.md`.
