# Team Optix Report Runner

This is the governed DigitalOcean collection runner for Insight. Its canonical
source lives in the Insight monorepo at `apps/report-runner`.

## Authority boundary

Team Optix owns the signed daily-package schedule. The controller must not
invent a second VPS-only schedule.

- `collection_enabled` controls RUN versus REST.
- `previous_day_close` controls the Prior Day collection.
- `dro_am` controls the morning DRO collection.
- `operations_pulse` controls the in-day operating window, operating dates,
  requested reports, and continuous success chain.
- Historical sweep and targeted recovery remain queue-owned work.

The runner performs collection and hands each file to application ingestion.
It does not validate workbook payloads or create payroll, carrier, vehicle, or
delivery truth. Ingestion owns file identity, validation, normalization, and
warehouse placement.

## Runner 2.0 handoff

Runner 2.0 is opt-in with `TEAMOPTIX_RUNNER_V2_ENABLED=1`. With the flag off,
the established batch upload and worker path remains unchanged.

For each completed download, Runner 2.0:

1. creates a deterministic artifact UUID;
2. preserves the provider filename as `source_download_filename`;
3. renames the working copy to
   `{company-slug}__{requested-date}__{source-lane}__{declared-file-type}__{artifact-id}.{actual-extension}`;
4. sends the bytes once to `/api/runner/v2/artifacts/ingest` with the company
   UUID, company slug, collection UUID, source lane, size, and SHA-256;
5. deletes the cycle spool only after the database accepts the terminal
   receipt.

The readable filename is trace context, not routing authority. The application
verifies that `company_id`, `company_slug`, `runner_key`, and the open cycle
agree before ingesting. The source lane and declared file type select a parser,
but the parser establishes the actual file type and database destination.
Manifest route, date, and type come only from the workbook Header.

Ingestion resolves identity in this order: workbook payload/Header signatures,
structured handoff metadata, then the convention filename as the last
reconciliation attempt. A convention company slug must agree with the database
company and open cycle; it cannot redirect an artifact. Warehouse metadata
retains both the generic provider filename and the convention transport name,
along with company slug, collection UUID, artifact UUID, source lane, and
declared file type.

Direct ingestion is limited to 4,000,000 bytes to remain below the Vercel
Function request-body ceiling. Oversized files, timeouts, and unsuccessful
ingestion receipts automatically use the existing Supabase Storage and worker
path for that file only. A repeated direct request uses the same artifact UUID
and returns the existing receipt rather than ingesting twice.

Safe rollout order:

1. deploy the database and web intake with the runner flag off;
2. deploy the runner code with the flag off;
3. enable Runner 2.0 for one governed runner;
4. watch direct-ingestion latency, Storage fallback count, failed receipts,
   collection duration, and local spool size;
5. disable the flag immediately to return to the legacy path.

## Source and deployment rule

GitHub `main` in the Insight repository is the only production source. Direct
edits on the droplet are prohibited. A deployment must identify the exact Git
commit, pass controller tests, preserve the shared runtime state and secrets,
restart the systemd service, and verify both service health and the reported
runner revision.

The legacy `teamoptix-donor-fcms-archive` repository remains available only as
a rollback reference until the monorepo deployment is proven. It must not
continue receiving production changes after cutover.

The governed systemd definitions live in `runner/`:

- `teamoptix-continuous-controller.service`
- `teamoptix-continuous-controller-production.conf`
- `teamoptix-continuous-controller-dro.conf`

The unit deliberately omits `TEAMOPTIX_RUNNER_VERSION`; the controller reports
the exact deployed Insight Git commit. Secrets and mutable runtime state remain
outside Git in the protected environment and runtime paths referenced by the
unit.

## Local checks

From the Insight repository root:

```bash
pnpm test:runner
```

The controller tests use only the Python standard library. Scraper integration
tests additionally require the production-compatible Selenium and data
processing environment and run as a separate deployment qualification step.

## Runtime state

Do not commit credentials, downloaded reports, browser profiles, logs, or
controller journal files. They remain outside Git and must survive deployments.

## Bounded local retention

Database ingestion receipts are the authoritative evidence. The VPS keeps only
disposable working copies:

- each client cycle receives an isolated spool directory;
- an accepted terminal receipt deletes the entire cycle spool immediately;
- acknowledged working artifacts and diagnostic logs: 2 days;
- acknowledged artifacts: 512 MB cap;
- diagnostic logs and runtime ledgers: 256 MB cap;
- unacknowledged spools are never deleted to satisfy a cap; collection stops
  safely and alerts when they exceed 1 GB;
- stale Chrome profiles: 48 hours;
- legacy MySQL extraction: disabled for canonical runner cycles;
- MySQL binary logging: disabled on the execution host.

The cycle enforces file/profile retention before launching Chrome. Override the
defaults only with `RUNNER_LOCAL_ARTIFACT_RETENTION_DAYS` and
`RUNNER_LOCAL_DIAGNOSTIC_RETENTION_DAYS`, or the corresponding
`RUNNER_LOCAL_ARTIFACT_MAX_BYTES`, `RUNNER_LOCAL_DIAGNOSTIC_MAX_BYTES`, and
`RUNNER_UNACKNOWLEDGED_SPOOL_MAX_BYTES` caps in the protected controller
environment.
Install `ops/mysql-teamoptix-runner-retention.cnf` into
`/etc/mysql/mysql.conf.d/` and restart MySQL during a controlled runner pause.
The local `fcms` database is a donor staging cache; it is not the system of
record for uploaded operational evidence.
