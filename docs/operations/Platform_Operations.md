# Platform Operations

This document is the operational reference for the Insight platform.

It captures architecture, security boundaries, automation dependencies, deployment notes, and production incidents.

---

# Security

## Authentication

- Supabase Auth
- Cloudflare Turnstile
- Password recovery
- Magic links

## Roles

### Authenticated Users

- Subject to RLS
- Company-scoped access

### Service Role

- Used by server automation
- Bypasses RLS
- Still requires explicit GRANT permissions

---

# Automation

## Daily Collection Control

The Vercel application is the sole run/rest authority. It persists the daily
package, resolves the effective gate, obtains the governed bootstrap payload,
and signs that payload to the VPS control endpoint.

The daily package contains:

- Prior Day — one governed close collection when active.
- DRO AM — one governed morning collection when active.
- Operations Pulse — starts inside its operating window and starts the next
  cycle immediately after each successful cycle until the window closes.

Operations Pulse has no minute cadence. `PREVIOUS_SUCCESS` is its only repeat
trigger. A dated `OPERATING` override such as Collect today is part of the
signed schedule and releases the VPS immediately when it is already inside the
window.

The current control authority is `MANUAL`: the Team Optix workspace chooses
RUN or REST for each client. A future billing authority may resolve the same
effective gate from verified payment and subscription state. It must not create
a second scheduling path.

Signed control path:

1. Vercel saves the schedule or calendar override.
2. `get_operations_runner_bootstrap` produces one schedule payload.
3. Vercel signs and posts it to the VPS control endpoint.
4. The VPS acknowledges the applied configuration version.

The Vercel cron route
`/api/cron/operations/generate-collection-requests` remains responsible for
historical sweep and other ticket-owned work. For a company with an enabled
continuous-runner schedule it must delegate the daily package and must not
create queued Prior Day or Operations Pulse requests.

---

## VPS Runner

Runs on the DigitalOcean worker.

Canonical source: `apps/report-runner` in the Insight GitHub repository. The
legacy standalone runner repository is retained only as a temporary rollback
reference during monorepo cutover.

Responsibilities

- Obeys the signed daily-package RUN/REST gate.
- Owns report-collection mechanics and serial donor execution.
- Executes Prior Day, DRO AM, and the Operations Pulse success chain.
- Submits a terminal receipt after each runner-owned cycle; the receipt becomes
  the audit request and registers its artifacts.
- Claims queued requests only for ticket-owned work such as historical sweep
  and targeted recovery.
- Never performs ingest.

Systemd service

`teamoptix-continuous-controller.service`

---

## Artifact Ingest

Runs from Vercel Cron.

Route

/api/cron/operations/artifact-ingest

Responsibilities

- Detect new artifacts
- Download from Storage
- Parse
- Populate warehouse
- Mark request complete

---

# Production Incident Log

## 2026-07-08

Issue

Automation appeared stalled after approximately 9:25 AM EDT.

Observed

VPS healthy.

Queue healthy.

No new requests created.

Root Cause

During the RLS security hardening, service_role lost SELECT permission on required scheduler objects.

Observed errors

permission denied for table companies

permission denied for table operations_collection_request

Resolution

GRANT SELECT restored for service_role.

Result

Scheduler immediately resumed creating requests.

Lesson

Service Role bypasses RLS.

Service Role DOES NOT bypass object permissions.

Future RLS cleanup must verify service-role grants before deployment.

---

# Smoke Tests

Scheduler

curl -sS https://teamoptix.io/api/cron/operations/generate-collection-requests

Healthy response for a continuous-runner company includes `ok: true` and a
`delegated` daily-package result. `created` remains valid for ticket-owned work.
