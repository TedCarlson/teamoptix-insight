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

## Scheduler

Runs from Vercel Cron.

Route:

/api/cron/operations/generate-collection-requests

Responsibilities

- Reads automation schedules
- Creates OPERATIONS_PULSE requests
- Never downloads reports

Dependencies

Tables

- core.companies
- core.operations_collection_request

Views

- public.companies
- public.operations_collection_request_v

RPC

- get_operations_automation_schedule_config
- create_operations_collection_request

---

## VPS Runner

Runs on the DigitalOcean worker.

Container

teamoptix-automation-worker

Responsibilities

- Claims queued requests
- Downloads DSW/FCC
- Registers artifacts
- Never performs ingest

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

Healthy response

"ok": true

status = created

or

status = skipped

