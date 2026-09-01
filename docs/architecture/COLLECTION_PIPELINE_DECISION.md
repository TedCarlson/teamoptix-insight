# Collection and ingestion operating model

Status: proposed decision for implementation
Date: 2026-09-01
Production safety state: collection runner stopped; schedule lanes paused

Detailed Supabase implementation, compatibility, cutover, acceptance, and cleanup planning is maintained in [COLLECTION_SUPABASE_CUTOVER_PLAN.md](./COLLECTION_SUPABASE_CUTOVER_PLAN.md).

## Decision

Use one isolated dedicated collection runner per company, one platform-owned support runner, one shared control plane, and logical work lanes inside each company runner. Do not run an independent always-on browser process for every report family.

The parser engine remains the authoritative boundary between disposable FedEx downloads and durable Insight data. Each parser owns validation, interpretation, normalization, business identity, and a canonical content hash. A single atomic ingestion operation then updates typed, tenant-scoped current-state tables only when normalized business data changed.

“Always on” means that a company runner immediately starts its next eligible item while useful work exists. It does not mean repeatedly sweeping every route on a fixed timer, and it does not mean allowing the same company, route, day, and collection family to have duplicate pending work. A shared admission layer prevents company runners from colliding at the database boundary.

## Runner identity and naming

Name each dedicated runner for the company it serves, not for its hosting vendor, IP address, or an implementation that may change. The governed identities are:

| Role | Canonical key | Display name | Service unit |
|---|---|---|---|
| Team Optix support runner (current machine) | `r-teamoptix-support-prod` | Team Optix · Production Support Runner | `insight-collector@teamoptix-support.service` |
| Beacon Point dedicated runner (clean clone) | `r-beacon-point-ventures-prod` | Beacon Point Ventures · Production Collector | `insight-collector@beacon-point-ventures.service` |

Use `r-<company-slug>-<environment>` for later dedicated company runners. Platform-operated support capacity uses `r-teamoptix-support-<environment>`.

The key is a human-readable identifier, not the primary identity. A stable UUID identifies the runner. A separate governed assignment binds that runner to a company, worksite, credential version, schedule, and permitted work lanes. The assignment must be validated on every bootstrap and bundle submission; changing a string cannot move a runner to another tenant.

The current key, `vps-laravel-runner-001`, is already present in historical requests, artifacts, manifests, health incidents, and logs. Those rows remain unchanged. A durable, non-authenticating alias maps the retired key to the Team Optix support runner UUID for historical display and audit lookup. Its historical assignment records that it performed Beacon Point work during that period. Only canonical keys operating under an active assignment may claim new work or submit new bundles after cutover.

Runner identity must come from deployment configuration. Application and runner code must not silently default to a production runner key. Startup fails closed when the key, company binding, environment, or credential version is absent or inconsistent.

## Clone and assign provisioning model

The current runner becomes the source for a reusable runner image only after it is converted into a clean template. Clone the runtime, not its live identity or customer state.

The reusable image includes:

- pinned operating-system and browser dependencies;
- the versioned runner, parser, and lifecycle services;
- resource limits, monitoring, log rotation, and empty inbox/outbox directories;
- a disabled templated service that cannot open Chrome until enrollment succeeds.

It must not include:

- FedEx cookies, browser profiles, saved passwords, or customer credentials;
- Supabase secrets, runner tokens, environment files, or host SSH identity;
- pending inbox/outbox payloads, local SQLite state, MySQL customer data, logs, or diagnostics;
- the source host's machine identity, runner UUID, company, worksite, or canonical key.

On first boot, the clone receives a short-lived, single-use enrollment token. The control plane creates or activates its runner UUID and returns a signed assignment containing the canonical key, company ID, permitted worksite identity, environment, work lanes, configuration version, and credential reference. Only then may the service open Chrome. The token expires immediately after enrollment.

The Beacon Point clone receives the persistent production assignment. The Team Optix support runner remains unassigned and browser-off by default. A support job is time-bounded, limited to one company/worksite and explicit work lanes, and automatically returns the runner to an unassigned disabled state when complete. It never competes with a healthy dedicated runner for ordinary always-on work.

## Why this is the best fit

### What the supplied files prove

| Family | Natural scope | What changes | Recommended durable shape |
|---|---|---|---|
| DSW | Company + service date | A single day progresses from route/preload rows to driver and actual-delivery rows; a route may expand to multiple participants | Route current, participant current, day summary |
| FCC | Company + service date + work area | Work areas are discovered early; last transmission, pickup, and delivery facts fill in later | Work-area current |
| Delivery manifest | Route + service date | Stop and package facts change as the route progresses | Delivery stop current, delivery package current |
| Pickup manifest | Route + service date | Pickup-stop facts change as the route progresses | Pickup stop current |
| Combined manifest | Route + service date | Provides the union/order of delivery and pickup activity but less detail than the family-specific files | Derived view; do not store another copy |
| Combined GPX | Route + service date | Coordinates and route order may be corrected during the day | Route geometry current, stop-coordinate links |

The two DSW samples contain the same 27 work areas. The early file has 22 populated preload rows and no populated driver/actual-delivery rows. The later file has 31 data rows, 25 populated driver rows, 23 populated actual-delivery rows, and multiple participant rows for two work areas. This confirms that a new DSW is an updated snapshot, not a duplicate, and that its grain is not always one row per route.

The FCC sample has 27 unique work areas but its timing fields are still empty. It is useful as an early route-discovery and heartbeat source even before operational completion facts exist.

The Combined and Delivery manifest samples contain the same 40 stop identities in the same order. Delivery adds recipient, instructions, completion windows, and 46 package rows. Combined adds the delivery-versus-pickup classification and ready/close timing, so it is useful for navigation and GPX context but is not a better warehouse copy than the detailed delivery and pickup families.

The two GPX samples have the same 39 coordinates, order, and approximately 127.259 km route sequence. Their point labels differ because Combined encodes ready/close fields while Delivery encodes delivery-window fields. The evidence supports collecting Combined GPX during the same route-page visit, not running a separate GPX collector. This single sample does not prove that the geometry will always be identical, so GPX must still be treated as a renewable snapshot rather than a one-time asset.

No pickup workbook was supplied. The pickup recommendation is based on the existing parser contract and should be validated against a representative pickup export before the new sink is finalized.

### What production behavior proves

Before the route-closeout regression, the one-client system performed about 45–46 operations-pulse requests and consumed roughly 12 runner-hours per day. After the additional closeout loop, it reached 98–138 requests and roughly 16–22 runner-hours per day, with failures. The seven-day median operations pulse was about 13.75 minutes; the median closeout pass was about 5.1 minutes.

Splitting those families into independent always-on browser processes would multiply login sessions, browser memory, route navigation, race conditions, and simultaneous database writes. The company is the correct browser/session isolation boundary; report families remain logical work lanes within that runner.

The database also shows substantial write amplification. The current path stores successful raw exports, creates lifecycle records and events, and updates child rows even when their business data is unchanged. Byte-level file hashes do not solve this because generated export timestamps change the bytes of otherwise equivalent workbooks.

## Target flow

```text
company-specific FedEx portal session
    |
    v
company runner
    |
    +-- company/day discovery bundle: DSW + FCC
    |
    +-- route bundle: Delivery + Pickup + Combined GPX
    |
    v
local temporary inbox -> parser -> durable normalized outbox
    |
    v
shared database-admission gateway
    |
    +-- unchanged: update one freshness/check record
    |
    +-- changed: one atomic typed-state transaction + one change record
    |
    +-- busy/unavailable: leave bundle safely in the company outbox and back off
    |
    +-- failed: never displace good current data
    v
tenant-isolated current projections used directly by the app
```

## Work lanes and scheduling

1. **Discovery lane** — collect DSW and FCC for each active company/day. Use these results to maintain the known route-day inventory.
2. **Route-bundle lane** — visit a route once and collect Delivery, Pickup, and Combined GPX together. A missing family is recorded explicitly; it does not force another full route visit immediately.
3. **Finalization lane** — perform prior-day/final DSW processing and dependent payroll/accounting work once the day is final.
4. **Recovery lane** — low-priority retries and intentional backfills, isolated from live collection.

Use one mutable work-ledger row per company, service date, scope, and family/bundle. The company runner claims its own eligible work; the shared control plane retains company-level pause, health, and database-admission authority. Each row carries priority, state, attempt count, last checked/changed times, and `next_eligible_at`.

Fairness rules:

- At most one active route bundle per company initially.
- No duplicate pending item for the same natural scope.
- Rotate across companies before taking another low-priority item for the same company.
- New, changing, and active routes return to the front sooner.
- Repeatedly unchanged work backs off but stays in rotation.
- Closed/final work leaves the live queue unless a source signal reopens it.
- Recovery never outranks healthy live work.

Start with one browser process on the current company runner for the recovery canary. Add companies by provisioning isolated runner runtimes, normally one company per similarly sized droplet at the current stage. The shared ingestion gateway can later route a company to a different database cluster without changing that runner.

## DigitalOcean edge inbox and outbox

The current DigitalOcean runner is suitable for the first implementation if the pipeline remains serial and resource-bounded. Live inspection on 2026-09-01 found:

- 1 vCPU and 1.9 GiB RAM;
- 50 GB disk with approximately 31 GB free;
- approximately 72% average CPU idle on the prior active day;
- approximately 1.25 GB average memory available on that day;
- a browser/chromedriver group using roughly 470 MB even though the collection controller was stopped;
- local MySQL using roughly 310 MB and 1.9 GB of disk;
- an automation-worker container using about 6 MB, but with no explicit CPU or memory limit.

The repository already implements the beginning of the required inbox policy: isolated cycle spools, immediate deletion after an accepted terminal receipt, two-day acknowledged retention, a 512 MB acknowledged-artifact cap, a 256 MB diagnostic cap, and a fail-closed 1 GB ceiling for unacknowledged spools.

Promote that spool into a two-part edge buffer:

1. **Temporary inbox** — carrier files for the current cycle only. Parse, validate, and sanitize them locally.
2. **Durable normalized outbox** — compact, versioned envelopes waiting for database acknowledgement. Use a small SQLite WAL ledger and filesystem payloads rather than adding Redis, RabbitMQ, or another managed service.

Each envelope contains its tenant/scope identity, parser version, canonical hash, normalized typed records, attempt state, and deterministic idempotency key. Only one envelope may be in flight from a company runner. On a busy or unhealthy response, the runner keeps it locally and applies bounded exponential backoff. An accepted database receipt deletes the source and outbox payload.

Required host controls:

- one browser/parse job at a time;
- explicit systemd and container memory/CPU ceilings;
- replace the current indefinite persistent-browser detach with a warm-session lease: reuse Chrome while eligible work remains, persist session cookies after each bundle, and terminate the entire process group after a short idle timeout or any controller stop;
- pause new downloads before the existing 1 GB unacknowledged limit or a 10 GB disk-free low-water mark is crossed;
- no raw business records in the legacy MySQL staging database;
- dependency audit before retiring MySQL, which may recover approximately 310 MB RAM if it is no longer needed;
- parser packages deployed from the same versioned repository release, with the ingestion gateway rejecting incompatible parser versions.

This edge outbox absorbs short database interruptions without creating a new shared infrastructure bill. It does not by itself coordinate multiple companies, so the shared gateway must still issue admission/backpressure responses and cap global commit concurrency.

Keep headless Chrome for the first implementation. The FedEx automation and its session/challenge behavior are already qualified against Chrome, while another browser engine would introduce compatibility risk without necessarily reducing Chromium-class memory materially. The existing Node worker already closes its Playwright Chromium instance in `finally`; the legacy Selenium collector intentionally detaches Chrome for reuse. Governing that reuse with an idle lease is the near-term fix. Consolidating the legacy Selenium paths onto Playwright can be evaluated later for lifecycle simplicity, not assumed to be a capacity requirement.

## Parser contract

The parser is the system’s domain logic and must have a stable contract independent of the browser and database implementation.

Every parser must return:

- source family and parser/projection version;
- company, service date, route/work-area scope, and file-reported identity;
- validation result and actionable warnings;
- normalized typed records;
- stable natural keys for every record;
- a canonical snapshot hash computed from sorted normalized business fields, excluding export timestamps, filenames, workbook formatting, and other carrier noise;
- counts and a compact summary for operations visibility.

Parser rules remain centralized in the TypeScript application initially. Moving duplicate parser logic into the runner would make fixes and version governance harder. The browser should download and send a route bundle; the central parser should validate all members and commit them atomically.

## Warehouse model

### Collection catalog

Maintain one compact catalog/current-state row per tenant, service date, family, and scope:

- current canonical hash;
- parser and projection version;
- source-reported creation time;
- last checked, last changed, and last successful times;
- current status, row counts, and validation summary;
- optional pointer to a quarantined failure or intentionally retained audit source.

Append one history/change record only when the canonical state changes. An unchanged collection updates freshness on the catalog row and produces no child-row writes.

### Typed projections

- `route_day`
- `dsw_route_current`
- `dsw_participant_current`
- `dsw_day_summary_current`
- `fcc_work_area_current`
- `delivery_stop_current`
- `delivery_package_current`
- `pickup_stop_current`
- `route_geometry_current`
- `route_stop_coordinate_current`

Every key begins with `company_id` and includes service date plus the stable route/entity identity. Tenant isolation remains enforced with row-level security. Combined activity is a view over delivery and pickup projections rather than a third stored manifest.

Do not partition these tables merely because collection is frequent. Their present row counts are not large enough to justify the operational complexity. Reconsider partitioning only after measured query plans and retention volume establish a need.

### Change-only atomic writes

One route-bundle RPC must:

1. lock or validate the catalog version for that natural scope;
2. return immediately when the canonical hash is unchanged, updating only freshness;
3. upsert changed rows with a condition equivalent to `existing business values IS DISTINCT FROM incoming business values`;
4. remove current rows absent from the latest complete, valid snapshot;
5. update the catalog and append one change record;
6. commit all families in the bundle together or roll back all of them.

Lineage belongs on the snapshot/catalog and change record. It should not require rewriting every child row solely to attach a new artifact identifier.

## Raw-file policy

Successful raw FedEx downloads are working material, not the warehouse.

- Parse in memory or temporary encrypted local storage.
- Delete a successful raw source after the atomic receipt is acknowledged.
- Retain failed/unparseable sources in a restricted quarantine for a short policy window, proposed at 72 hours, so parser defects can be diagnosed.
- If regulatory or audit needs later require successful-source retention, retain a deliberately chosen final file per family/day—not every pulse—and define its retention separately.
- Never place raw artifact links in tenant-facing application responses.

## GPX policy

Remove the permanent “already collected today” decision. GPX is eligible whenever its route bundle is eligible. Canonical hashing ensures that an unchanged trace costs one freshness update rather than rewriting geometry.

Normalize route points into stable stop identities where the label supplies SID/PUID/sequence information. Keep one current route geometry (PostGIS `LineString`) and typed stop-coordinate links. Spatial indexes should be added only to spatial predicates used by the app; ordinary B-tree indexes remain appropriate for tenant/date/route lookup.

## Application and operator UI

Replace interval-oriented controls with a simple operational view:

- master **Always-on collection** on/off control;
- current overall state: Running, Paused, Recovering, or Needs attention;
- freshness by DSW, FCC, manifests, and GPX;
- current company/route and remaining eligible work;
- last successful check and last detected change;
- clear exception with a scoped Retry action;
- advanced worker/concurrency limits visible only to platform operators.

The UI should not ask a customer to select a universal cadence. Cadence is a result of route count, source activity, fair scheduling, and available worker capacity.

The platform-only runner screen shows each runner's role (Dedicated or Support), canonical name, current company/worksite assignment, software/configuration version, browser state, last heartbeat, outbox depth, and current job. Assigning the support runner requires an explicit company, worksite, allowed lanes, reason, and expiration. Customer-facing screens show collection health and freshness, not infrastructure identities.

Each company card is the Team Optix control surface for its assigned runner. It exposes four intentionally different actions:

- **Pause** — stop taking new work and become paused at the next safe checkpoint;
- **Drain and stop** — finish the current valid bundle, submit already-normalized outbox work as admission permits, close Chrome, and acknowledge stopped;
- **Emergency stop** — terminate the active browser/job without committing an incomplete bundle, retain bounded diagnostic state, and require an explicit restart;
- **Resume** — allowed only when the runner has a valid active assignment, matching configuration/credential versions, safe resource state, and no unresolved emergency stop.

Controls never call DigitalOcean or shell commands from the browser. A platform-owner-only server endpoint records a company-scoped, idempotent command. The lightweight runner supervisor receives it, validates that its runner and assignment IDs match, performs it, and returns an acknowledgement. The UI shows Requested until that acknowledgement arrives; a database update alone is never displayed as Running or Stopped.

Every command records who requested it, the company/worksite, runner and assignment, reason, expected configuration version, request/expiry/acknowledgement/completion times, and compact result. A stale browser tab cannot control a newly reassigned runner because the expected assignment and configuration versions must still match.

## Capacity truth

The redesign removes avoidable database and browser work, but FedEx page navigation remains a linear physical constraint. A company-specific runner prevents one customer from blocking another and makes collection capacity scale with revenue. Database capacity remains shared, so each runner prepares and holds normalized bundles locally while the central admission gateway meters atomic commits. Actual database demand then follows meaningful data changes rather than download frequency.

The commercial service-level objective should therefore be expressed as freshness by active route/company class, not as “every file every 15 minutes.”

## Implementation sequence

### Phase 0 — maintain recovery state

- Keep the production runner stopped and all collection lanes paused.
- Do not deploy the provisional fixed-interval UI as the target design.
- Keep database and authentication monitoring active.

### Phase 1 — remove the largest write amplification

- Add canonical normalized hashes per parser family.
- Stop storing every successful raw export.
- Change manifest and GPX ingestion to one atomic, change-only route-bundle write.
- Collapse success telemetry to one bundle/cycle summary plus exceptions.
- Add regression fixtures from sanitized representative files.

### Phase 2 — typed DSW and FCC projections

- Keep current parser rules but replace generic raw-plus-normalized JSON sinks with typed current tables.
- Preserve existing application contracts through compatibility views during migration.
- Verify multi-participant DSW routes and incomplete early-day snapshots.

### Phase 3 — work ledger and fair coordinator

- Replace duplicate pulse/closeout sweeps with discovery, route-bundle, finalization, and recovery work items.
- Add uniqueness, leasing, retry/backoff, and per-company fairness.
- Keep worker concurrency bounded and observable.

### Phase 4 — UI alignment

- Ship the simple always-on/freshness/exception view.
- Remove customer-facing interval configuration.
- Add the Team Optix company-specific runner fleet control with acknowledged Pause, Drain and stop, Emergency stop, and Resume actions.
- Add platform-only support-job assignment and revocation with company/worksite, lane, reason, and expiry requirements.

### Phase 5 — controlled recovery

1. Run parser and ingestion fixtures locally.
2. Canary one route for one company.
3. Confirm an unchanged repeat causes only a freshness write.
4. Confirm a changed file updates the expected typed rows atomically.
5. Observe database CPU, disk I/O, query latency, error rate, and runner memory for two hours.
6. Expand to one full company, then add companies one at a time.

Production collection restarts only with explicit platform-owner approval after the canary gates pass.

## Acceptance criteria

- An identical normalized snapshot is safe to process repeatedly and does not rewrite child rows.
- A later same-day snapshot replaces current state and records one meaningful change.
- A failed or partial snapshot never replaces the last valid current state.
- Delivery, Pickup, and Combined GPX require only one route-page visit per bundle attempt.
- Only one live work item exists per natural scope, even across process restarts.
- One tenant cannot consume all browser capacity.
- Pausing collection stops new claims without corrupting in-flight commits.
- The app reads typed current projections without scanning raw collection history.
- Successful raw files are deleted according to policy; failed sources expire from quarantine.
- Parser/projection versions make every stored shape reproducible and migratable.

## Meaning of idempotent in this system

Idempotent means “safe to repeat.” It does **not** mean “ignore every later file with the same name, route, or date.” A later DSW or manifest is parsed and compared with current normalized state. If its business facts changed, Insight applies the update. If nothing meaningful changed, Insight records that it checked successfully without rewriting the warehouse.

## References

- [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization)
- [Supabase database inspection](https://supabase.com/docs/guides/database/inspect)
- [Supabase indexes](https://supabase.com/docs/guides/database/postgres/indexes)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Queues](https://supabase.com/docs/guides/queues) — a future option; not selected for the initial priority/fairness ledger
- [PostgreSQL `SELECT`, including `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html)
- [PostgreSQL `INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)
- [PostgreSQL partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [PostGIS `ST_MakeLine`](https://postgis.net/docs/ST_MakeLine.html)
- [PostGIS spatial indexing](https://postgis.net/workshops/postgis-intro/indexing.html)
- [Kimball accumulating snapshot technique](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/accumulating-snapshot-fact-table/)
