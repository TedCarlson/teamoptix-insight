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
- Collects the GPX control adjacent to the Combined Manifest export control
  once per route and service date. The manifest workbook, not the GPX filename,
  remains route/date identity authority.
- Submits a terminal receipt after each runner-owned cycle; the receipt becomes
  the audit request and registers its artifacts.
- Claims queued requests only for ticket-owned work such as historical sweep
  and targeted recovery.
- Never performs ingest.

### Route GPX evidence

The first successful route-scoped Combined Manifest view may establish one
dispatch-baseline GPX artifact for that route and service date without
requiring the Combined Excel workbook. Later pulse
cycles do not download another local baseline. They refresh manifest and
package state against the fixed waypoint geometry so Service can render open,
attempted, and completed stops, including express and pickup distinctions.
The customer-scoped once-daily marker is committed only after the runner's
artifact handoff receipt is accepted, and it expires through bounded runner
retention. A marker failure never blocks the established Excel collection.

GPX ingestion is rejected until a sibling manifest workbook verifies the same
route and service date. Exact coordinates are service-role warehouse data and
are returned only through the company-authorized Service route-detail API.
They follow the existing seven-day identifiable FCC artifact retention window;
only privacy-safe derived cluster facts may survive that window. Insight does
not expose an artifact-download action for GPX evidence.

A bounded route-baseline backfill uses the existing governed historical queue
with an exact one-day range and this payload contract:

```json
{
  "runner_goal": "collect_historical_dsw_range",
  "collect_scope": "ROUTE_GPX_BASELINE",
  "route_gpx_only": true,
  "manifest_types": [],
  "skip_combined": true,
  "targets": [
    {
      "artifact_key": "ROUTE_GPX",
      "runner_section": "P_AND_D"
    }
  ]
}
```

The exact date is carried by `service_date_start` and `service_date_end`.
This invocation opens each route's Combined view, downloads only the GPX
artifact, skips previously acknowledged route/day baselines, and never
downloads Combined, Delivery, or Pickup Excel. A route-day GPX may use a
workbook verified in an earlier collection cycle for the same company, date,
and route; the collection request does not need to duplicate that workbook.

Runner concurrency remains a separate capacity decision. The current browser
profile, download directory, and donor lock are one serial attribution domain.
Capacity should scale first through customer-isolated runner environments with
bounded concurrency and measured donor latency, rather than uncoordinated tabs
sharing a session and download folder.

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
