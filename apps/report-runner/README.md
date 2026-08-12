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

The runner performs collection and uploads terminal receipts. It does not own
warehouse ingest or create payroll, carrier, vehicle, or delivery truth.

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

Supabase Storage artifacts and terminal receipts are the authoritative evidence.
The VPS keeps only disposable working copies:

- each client cycle receives an isolated spool directory;
- an accepted terminal receipt deletes the entire cycle spool immediately;
- failed or abandoned spools have a 7-day hard maximum;
- scraper and runner diagnostic logs: 7 days;
- stale Chrome profiles: 48 hours;
- legacy MySQL extraction: disabled for canonical runner cycles;
- MySQL binary logging: disabled on the execution host.

The cycle enforces file/profile retention before launching Chrome. Override the
defaults only with `RUNNER_LOCAL_ARTIFACT_RETENTION_DAYS` and
`RUNNER_LOCAL_DIAGNOSTIC_RETENTION_DAYS` in the protected controller environment.
Install `ops/mysql-teamoptix-runner-retention.cnf` into
`/etc/mysql/mysql.conf.d/` and restart MySQL during a controlled runner pause.
The local `fcms` database is a donor staging cache; it is not the system of
record for uploaded operational evidence.
