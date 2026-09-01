# Collection Supabase redesign and cutover plan

Status: proposed implementation plan; no production schema changes authorized by this document
Date: 2026-09-01
Production state: collection schedules paused, runner stopped and disabled, legacy data remains readable

## Outcome

Replace the file-and-event-heavy collection warehouse with a compact current-state model while preserving every application contract through the transition. Build additively, validate end to end, switch one read surface at a time, operate a controlled canary, and then remove every temporary and legacy object according to an explicit cleanup manifest.

The cutover is not complete when new ingestion works. It is complete only when:

- all application surfaces read the canonical model;
- payroll, scorecard, mileage, route-health, history, and corrective-action dependencies are verified;
- the runner uses the normalized outbox and atomic commit path;
- production has passed a defined operating-period gate;
- legacy tables, functions, triggers, crons, storage objects, compatibility helpers, and feature flags are removed;
- database size, write volume, query plans, RLS, grants, and generated types are re-verified.

## Non-negotiable design rules

1. **No destructive first move.** New structures are additive until contract parity is proven.
2. **No UI-first migration.** Existing API response shapes remain stable while database sources change underneath them.
3. **No raw successful-file warehouse.** Raw carrier files are transient runner material; only failed files enter a short quarantine.
4. **No row-by-row trigger fanout.** One normalized bundle causes one short atomic commit and explicit downstream rebuild decisions.
5. **No source-artifact churn on unchanged children.** Lineage belongs on the scope/change receipt; a child row records only the commit that last changed it.
6. **No indefinite compatibility layer.** Every temporary object has an owner, removal gate, and cleanup migration before it is introduced.
7. **No hidden tenant bypass.** New core tables have RLS; public views are security-invoker; ingestion functions are service-role only with explicit revocation from public roles.
8. **No simultaneous writer storm.** Company runners retain normalized bundles locally until the database admission path accepts them.
9. **No parser drift.** Every bundle includes parser and projection versions; incompatible versions are rejected before mutation.
10. **No production restart before full-flow acceptance.** A one-route canary precedes one-company always-on recovery.

## Live dependency inventory

### Current write-amplification centers

| Relation | Current size | Live rows | Lifetime updates/inserts observed |
|---|---:|---:|---:|
| `core.operations_collection_runtime_event` | 255 MB | 400,381 | 400,414 inserts + 57,261 updates |
| `core.operations_report_raw_row` | 135 MB | 87,969 | 148,723 inserts + 17,297 updates + 64,470 deletes |
| `core.operations_collection_artifact` | 121 MB | 41,886 | 42,043 inserts + 471,733 updates |
| `core.operations_delivery_manifest_package` | 50 MB | 89,919 | 91,888 inserts + 3,327,490 updates |
| `core.operations_delivery_manifest_stop` | 26 MB | 58,759 | 135,497 inserts + 1,552,604 updates |
| `core.operations_collection_request` | 26 MB | 3,190 | 3,211 inserts + 12,813 updates |

The row counts themselves are not the primary problem. The repeated updates, trigger-generated events, raw-plus-normalized duplication, and source-artifact rewrites are the problem.

### Current trigger chain

Collection mutations currently activate:

- request runtime insert/update event triggers;
- artifact runtime insert/update event triggers;
- terminal-receipt event persistence;
- continuous-runner liveness updates;
- request transition and historical-sweep guards;
- manifest artifact runtime updates;
- DSW pickup-reliability hydration;
- automatic mileage policy application;
- per-row driver-scorecard fact materialization.

The target writer replaces implicit trigger fanout with one explicit transaction result: scope freshness, changed projections, one change receipt, and a bounded list of downstream rebuild jobs.

### Deep functional dependencies

DSW batch/raw/summary relations currently feed:

- current DSW routes;
- FCC current rows;
- manifest route inventory;
- daily operations summary and calendar;
- service snapshots and report history;
- payroll activity rebuilds;
- driver scorecard route/day/week facts;
- mileage audit and correction evidence;
- pickup reliability and corrective-action evidence;
- analytics history and intelligence feeds.

Manifest and GPX relations currently feed:

- route-health summaries and detail drawers;
- Express package and route reports;
- Delivery and Pickup manifest history;
- last-delivery and stop-cluster facts;
- route geometry maps;
- watchlist signals;
- de-identified package and route-day facts;
- DSW package-status reconciliation.

Collection-control relations currently feed:

- company automation configuration;
- TeamOptix command center and overview;
- internal collection request details;
- Operations workspace freshness status;
- three browser Realtime subscriptions directly on `core.operations_collection_request`.

### Important compatibility conclusion

`core.operations_collection_request` should remain the application-facing collection-run summary and Realtime signal during the final design. It is not the largest cost center. Its trigger/event fanout and update frequency must change, but replacing its identity would create avoidable UI churn.

## Final canonical Supabase model

The names below are final names, not temporary `_v2` names.

### Control and admission

#### Add: `core.operations_runner`

This is the stable runner registry. One row represents a runner instance, independent of its current company/worksite assignment, host IP address, browser engine, or deployment unit name:

- immutable `id` UUID;
- canonical `runner_key`;
- human `display_name`;
- role (`DEDICATED` or `SUPPORT`);
- environment (`prod`, `staging`, or `dev`);
- lifecycle state (`PROVISIONING`, `DISABLED`, `ACTIVE`, `DRAINING`, or `RETIRED`);
- accepted credential and software versions;
- last bootstrap, heartbeat, and acknowledged-commit times;
- compact capability and deployment metadata without secrets;
- `retired_at` and retirement reason.

Canonical dedicated naming is `r-<company-slug>-<environment>`. The clean Beacon Point Ventures clone is `r-beacon-point-ventures-prod`, displayed as `Beacon Point Ventures · Production Collector`. The current machine becomes `r-teamoptix-support-prod`, displayed as `Team Optix · Production Support Runner`.

Use the UUID as the foreign-key identity in new control, receipt, change, and health records. Enforce a unique canonical key. Bootstrap and ingestion must prove the key, runner UUID, active assignment, company, worksite, environment, credential version, and envelope tenant all agree.

#### Add: `core.operations_runner_assignment`

This is the governed job/worksite handoff. It separates the machine from the customer work it is allowed to perform:

- immutable assignment ID and runner ID;
- company ID and stable worksite/terminal identity;
- assignment kind (`DEDICATED` or `SUPPORT`);
- permitted collection lanes and service-date scope;
- credential/configuration versions, not secret values;
- status (`PENDING`, `ACTIVE`, `DRAINING`, `COMPLETED`, `REVOKED`, or `EXPIRED`);
- effective, expiry, completion, and revocation times;
- assignment reason and platform operator audit identity.

Permit only one active assignment per runner. Initially permit only one active dedicated production assignment per company. A dedicated assignment has no routine expiry; a support assignment must expire and must name its allowed lanes. Every new request, receipt, change record, and outbox envelope carries `runner_id` and `assignment_id`. The gateway rejects a valid runner whose assignment does not match the envelope company and worksite.

#### Add: `core.operations_runner_alias`

This is durable lineage, not a temporary compatibility object. It maps a prior key to the immutable runner UUID and records when and why that key was retired. Aliases may resolve historical evidence for display and audit, but cannot bootstrap, claim work, acknowledge schedules, or submit bundles.

The existing `vps-laravel-runner-001` key becomes a retired alias for the Team Optix support runner. Its historical assignment records that this runner collected Beacon Point data before dedicated runners were introduced. Do not mass-update historical requests, artifacts, manifests, incidents, or logs. The production inventory on 2026-09-01 includes 57,465 log events, 41,886 collection artifacts, 3,188 claimed requests, 1,252 manifest artifacts, and 29 health incidents under that key. Preserving it avoids audit damage and a risky rewrite; the log table also currently has a non-cascading foreign key to the schedule key.

#### Keep: `core.operations_runner_schedule`

Continue to own master pause, operating calendar, work-lane policy, and configuration version. Add `assignment_id` as the governed relationship. Retain the legacy `runner_key` only through the comparison and rollback window, then remove it after all functions and UI consumers use runner/assignment identity. Remove customer-facing fixed cadence fields after the new UI cutover; retain only fields required for compatibility until cleanup.

#### Add: `core.operations_runner_command`

This is the durable, company-scoped control acknowledgement ledger used by the Team Optix workspace:

- immutable command ID and idempotency key;
- runner, assignment, company, and worksite identities;
- command (`PAUSE`, `DRAIN_STOP`, `EMERGENCY_STOP`, or `RESUME`);
- expected assignment and configuration versions;
- state (`REQUESTED`, `DELIVERED`, `ACKNOWLEDGED`, `SUCCEEDED`, `FAILED`, `EXPIRED`, or `CANCELLED`);
- platform-owner profile that requested it and a required reason for emergency/support actions;
- requested, expiry, delivered, acknowledged, completed, and failed times;
- compact non-PII result/error and supervisor version.

Unique key: `idempotency_key`. Only one non-terminal control command may exist per runner. A new emergency stop may supersede a pending pause or drain; other overlapping commands are rejected. Commands expire instead of executing later against a changed assignment.

The browser never receives service-role credentials and never writes this table directly. A Team Optix server endpoint verifies the signed-in session and current `is_platform_owner` authorization, resolves the selected company to its active assignment, and calls a narrowly granted command function. The runner supervisor fetches only commands matching its immutable runner ID and active assignment. Public/anon access is revoked; any public read view is `security_invoker` and restricted to platform owners.

#### Keep and simplify: `core.operations_collection_request`

One row represents a meaningful company cycle, manual request, recovery, or route bundle—not every downloaded file. Preserve existing IDs, statuses, Realtime publication, public view, and API shape during cutover.

Allowed mutations are bounded:

- create/queue;
- claim/start;
- terminal complete/fail/cancel.

Runtime detail lives in a compact JSON receipt or bounded failure log rather than many event rows.

#### Add: `core.operations_collection_scope`

One row per current natural scope:

- `company_id`;
- `service_date`;
- `family_key` (`DSW`, `FCC`, `ROUTE_BUNDLE`, `GPX`, or later family);
- `scope_kind` (`COMPANY_DAY` or `ROUTE_DAY`);
- `scope_key` (normalized company-day or route key);
- current canonical hash;
- parser and projection versions;
- current changed-commit ID;
- last checked, changed, successful, and source-generated times;
- snapshot state (`IN_DAY`, `FINAL`, `FAILED`, `STALE`);
- compact row counts and validation summary.

Unique key: `(company_id, service_date, family_key, scope_kind, scope_key)`.

This is the primary freshness lookup. An unchanged collection updates only this row.

#### Add: `core.operations_collection_commit_receipt`

A small, retention-bounded receipt for each normalized outbox envelope:

- deterministic idempotency key;
- company/scope identity;
- canonical hash and versions;
- request ID, immutable runner ID, assignment ID, and canonical runner key captured at commit time;
- accepted/unchanged/changed/rejected result;
- duration and compact counts;
- error class without raw payload or customer PII.

Unique key: `idempotency_key`. Proposed retention: 30 operating days after metrics aggregation, except receipts referenced by durable change records.

#### Add: `core.operations_collection_change`

Durable lineage only when canonical business state changes:

- prior and new canonical hash;
- changed commit ID;
- changed table/count summary;
- parser/projection version;
- source-reported creation time;
- validation and provenance summary.

Do not store full raw files or a duplicate copy of every child record here.

#### Add: `core.operations_projection_rebuild`

One deduplicated work item per company/date/projection for explicit derived-fact work such as payroll, scorecards, mileage policy, stop clusters, and de-identified route facts.

Unique pending key: `(company_id, service_date, projection_key)` for rows in a pending/running state. Workers claim rows in deterministic order with short transactions. Final DSW changes enqueue payroll/scorecard work once; unchanged pulses enqueue nothing.

### Shared route identity

#### Add: `core.operations_route_day`

One canonical route/day identity shared by DSW, FCC, manifests, GPX, dispatch evidence, and derived facts:

- `company_id`, `service_date`, normalized `route_key`;
- route baseline ID when matched;
- work-area number and label;
- current driver/vehicle references where supplied;
- first discovered, last observed, and closed times;
- discovery sources;
- last changed commit ID.

Unique key: `(company_id, service_date, route_key)`. All child foreign-key columns are indexed.

### Typed current projections

“Current” means the latest valid state for that service date. Prior dates remain queryable as daily history; same-day pulses update that date’s state only when business fields differ.

#### DSW

- `core.operations_dsw_route_day`
- `core.operations_dsw_participant_day`
- `core.operations_dsw_summary_day`

The participant relation supports continuation rows and multiple drivers on one route. Indexed typed columns carry operational measures. A normalized compatibility JSON column may remain temporarily to reproduce existing API shapes, then is removed or reduced after all consumers use typed columns.

Final DSW state is immutable except through a deliberate corrected-final workflow. Finalization schedules explicit payroll, scorecard, and mileage projections.

#### FCC

- `core.operations_fcc_work_area_day`

One row per route/work area/day with typed transmission, pickup, delivery, completion, driver, and matching fields. Early incomplete FCC snapshots are valid current state and can later be replaced.

#### Manifests

- `core.operations_delivery_stop_day`
- `core.operations_delivery_package_day`
- `core.operations_pickup_stop_day`

Natural keys use route-day plus stable parser identities. Conditional upserts update only rows whose business columns changed. Rows absent from a complete valid replacement snapshot are removed in the same transaction.

Transient identifiable package evidence retains the existing privacy expiry. Durable package/route facts continue to use non-reversible references and aggregates.

Combined manifest activity is a view over delivery and pickup state. There is no Combined child table.

#### GPX

- `core.operations_route_geometry_day`
- `core.operations_route_geometry_point_day`

Store one current PostGIS route geometry and stable stop-coordinate associations per route/day. The JSON geometry RPC remains the public/server contract. Unchanged canonical geometry produces no point rewrite.

## Atomic commit contract

Add one service-role-only RPC: `public.commit_operations_collection_bundle`.

The runner never calls this function directly. The authenticated Insight ingestion gateway validates the runner token and envelope schema, then uses its server-side service client.

The function:

1. validates company, request, scope, parser version, projection version, and idempotency key;
2. obtains a transaction advisory lock keyed by the natural scope;
3. returns the persisted receipt immediately for an existing idempotency key;
4. compares the incoming canonical hash to `operations_collection_scope`;
5. on unchanged state, updates scope freshness and inserts one compact receipt;
6. on changed state, locks rows in consistent parent-to-child order;
7. conditionally upserts changed typed rows only;
8. removes rows missing from a complete valid replacement snapshot;
9. updates route-day and scope state;
10. inserts one durable change record;
11. creates deduplicated downstream rebuild jobs only when required;
12. returns one receipt and commits.

No parsing, external network call, raw-file upload, or long-running analytics build occurs inside this transaction. Set a conservative local statement timeout and measure the execution plan with production-like data.

## Read-contract preservation

The UI should initially receive the same JSON it receives today. Existing API routes are the compatibility boundary.

| Application surface | Existing database dependency | Canonical source after cutover | Compatibility action |
|---|---|---|---|
| Delivery Window DSW | `get_operations_dsw_current_rows` over report batch/raw rows | DSW route + participant day | Replace function body; preserve result columns |
| Delivery Window FCC | `get_operations_fcc_current_rows` over report batch/raw rows | FCC work-area day | Replace function body; preserve result columns/JSON |
| DSW service snapshot | batch + summary rows | DSW summary day + scope | Replace function body |
| Daily summary/calendar | report batch/raw/summary | DSW day relations + scope finality | Replace function bodies |
| Route inventory | DSW report rows | route-day plus DSW/FCC discovery | Replace function body |
| Route Health | delivery/pickup views, Express views, GPX RPC, status evidence | typed route-day projections | Repoint canonical views and GPX RPC |
| Manifest History | manifest route summary, FCC, stops/packages, clusters | typed route-day projections + existing durable clusters | Preserve endpoint result shape |
| Express report/watchlist | manifest and package-status views | typed package/stop state + current package status | Repoint views |
| Mileage audit | raw DSW row IDs | DSW participant-day evidence IDs | Compatibility alias during UI transition |
| Payroll/scorecards | final DSW trigger chain | explicit final-DSW rebuild work | Keep output fact-table contracts |
| Report history/feed | report batches and summary counts | scope/change/final-day catalog | Preserve RPC result contracts |
| Collection status | collection request/artifact/runtime views | simplified request + receipt/scope aggregates | Preserve request view; replace expensive runtime aggregation |
| Realtime refresh | direct `core.operations_collection_request` subscription | same table | Keep publication and tenant RLS |
| Artifact inspector | Storage-backed successful raw files | normalized commit/change receipt; failed quarantine only | Update inspector presentation after read cutover |

### Compatibility implementation

- Temporary shadow RPCs use a `_next` suffix only in the test/cutover window.
- Contract tests call legacy and shadow RPCs with the same company/date and compare normalized responses.
- When parity passes, `CREATE OR REPLACE` installs the canonical implementation under the existing function name.
- Temporary `_next` functions are dropped in the same release or its immediately following cleanup migration.
- Existing public view names remain. Their definitions are repointed atomically to canonical tables and use `security_invoker = true`.
- Newly exposed objects receive explicit grants because Supabase is moving to non-automatic Data API exposure. RLS and grants are tested separately.

## Downstream projection migration

### Payroll

Keep `core.payroll_activity_fact` as the application output. Replace `rebuild_payroll_activity_fact` internals to read final DSW route/participant relations. A final DSW canonical change enqueues one rebuild; in-day pulses do not rebuild payroll.

### Driver scorecards

Keep scorecard day/week/snapshot outputs. Stop materializing scorecard facts from every inserted raw row. Add typed DSW evidence linkage, backfill it, compare scorecard outputs, then remove raw-row foreign-key dependence.

### Mileage audit and correction

Introduce a typed DSW evidence reference beside the legacy raw-row reference. Backfill and dual-read during comparison. Preserve the current API field name temporarily, migrate the UI to a neutral `evidence_row_id`, then remove the legacy reference and compatibility alias.

### Pickup reliability and corrective actions

Rebuild evidence queries from typed DSW fields. Verify weekly analytics totals, flagged days, route evidence, and corrective-action generation against the same finalized dates.

### Route health, Express, and privacy retention

Repoint the existing public route/Express views to new typed current tables. Preserve transient tracking-evidence expiry and durable de-identified facts. Retention is an explicit projection job, not a broad file-history cron.

## Security model

- All canonical tables live in `core`, have RLS enabled, and include `company_id` in natural keys and tenant indexes.
- Authenticated read policies use the existing platform-owner/company-access predicates.
- Runner/inbox data is never directly exposed to authenticated clients.
- `commit_operations_collection_bundle` is `SECURITY DEFINER` only if required, fixes its `search_path`, validates all identities, revokes execute from `PUBLIC`, `anon`, and `authenticated`, and grants execute only to `service_role`.
- Public views use `security_invoker = true`; their base tables have correct select policies.
- Every new public view/table/RPC receives explicit grants. RLS does not replace grants.
- Cross-tenant tests use at least two authenticated tenant contexts plus platform-owner and unauthenticated contexts.
- The Supabase security advisor is run before every branch acceptance and again after production cleanup.

## Index design

Create only indexes required by measured access patterns:

- every child foreign key;
- tenant/date/route natural keys;
- tenant/date current-scope lookup;
- receipt idempotency key;
- partial index for pending projection rebuilds;
- typed fields used by route-health and current-state filters;
- GiST index only for actual spatial predicates, not merely because geometry exists.

Use `EXPLAIN (ANALYZE, BUFFERS)` with sanitized production-scale fixtures for each canonical API query. Do not copy all legacy indexes. After cutover, identify unused and duplicate legacy indexes before cleanup.

## Implementation and cutover phases

### Phase 0 — freeze and contract capture

Production remains paused.

Deliverables:

- inventory of tables, views, functions, triggers, crons, Storage buckets, Realtime publications, and code consumers;
- API response fixtures for representative early-day, active-day, final-day, incomplete, multi-driver, missing-GPX, and failed-collection states;
- generated TypeScript database types checkpoint;
- production relation-size and query baseline;
- temporary-object cleanup manifest created before any temporary object.

Exit gate: every known consumer appears in the dependency matrix and has an owner/test.

### Phase 1 — extract and version parser contracts

- move DSW, FCC, manifest, pickup, and GPX normalization into a shared versioned parser package;
- produce deterministic canonical envelopes and hashes;
- use the same package for droplet automation and manual uploads;
- create sanitized fixtures from supplied representative files;
- prove repeat parsing yields byte-stable canonical JSON/hash.

Temporary objects: none in production.

Exit gate: parser fixture suite passes and current normalized outputs are characterized.

### Phase 2 — additive canonical schema

- create the runner registry, governed assignment, and historical alias mapping while the existing runner remains disabled;
- register the current machine as `r-teamoptix-support-prod`, add the non-authenticating `vps-laravel-runner-001` lineage alias, and record its historical Beacon Point assignment;
- register the future clean clone as `r-beacon-point-ventures-prod` with a dedicated Beacon Point production assignment;
- create canonical control/catalog/route-day/typed projection tables;
- add RLS, policies, grants, foreign-key indexes, natural-key constraints, and comments;
- add commit and projection-rebuild functions;
- add temporary `_next` read functions/views for comparison only;
- generate new database types.

Production writer remains disabled.

Exit gate: migrations apply from a clean database, advisors pass for new objects, and destructive rollback is not required to return to the legacy read path.

### Phase 3 — backfill and shadow comparison

- backfill latest valid state per company/date/scope from legacy data;
- backfill route-day identity before children in deterministic key order;
- record backfill provenance without creating artificial change history;
- compare legacy and canonical API results for selected dates;
- compare payroll, scorecards, mileage, pickup reliability, route health, Express, history, and geometry;
- reconcile every variance as intended semantic correction or defect.

Temporary objects: backfill checkpoints and `_next` functions only. All have drop statements prepared.

Exit gate: signed parity report; zero unexplained differences.

### Phase 4 — application adapter cutover

Switch existing API contracts in this order:

1. DSW current and FCC current;
2. route inventory and service snapshots;
3. manifests, route health, Express, and GPX;
4. daily summary/calendar/history;
5. mileage, corrective-action, and analytics evidence;
6. payroll and scorecard rebuild sources;
7. collection status/runtime summaries and artifact inspection.

UI components remain unchanged until their existing endpoint is proven against the canonical source. Direct Realtime subscriptions stay on `operations_collection_request`.

Add the Team Optix runner fleet control after runner/assignment reads are canonical:

1. list one company card per active dedicated assignment plus the separate support runner;
2. show Requested versus Acknowledged state explicitly;
3. issue Pause, Drain and stop, Emergency stop, and Resume through the platform-owner server endpoint;
4. assign or revoke a time-bounded support job from the same workspace;
5. never expose these controls in a customer company workspace.

Exit gate per surface: contract tests, browser verification, tenant isolation, empty/error/loading states, and rollback toggle proven.

### Phase 5 — droplet outbox and gateway writer

- promote the existing cycle spool to temporary inbox + SQLite normalized outbox;
- deploy the same parser version as the gateway accepts;
- prepare a sanitized, disabled runner image containing runtime and controls but no host, runner, customer, credential, browser, queue, or database identity;
- while the service remains disabled, rename the original runner to `r-teamoptix-support-prod` and its unit to `insight-collector@teamoptix-support.service`;
- clone the sanitized image, enroll it once as `r-beacon-point-ventures-prod`, and activate `insight-collector@beacon-point-ventures.service` only after its signed assignment validates;
- remove application and runner fallbacks to `vps-laravel-runner-001`; fail startup when governed identity configuration is missing;
- verify bootstrap resolves the canonical key to the expected immutable runner ID, active assignment, company, and worksite before opening Chrome;
- keep a lightweight supervisor available while Chrome is off so company-scoped commands can be acknowledged without browser idle cost;
- implement safe checkpoints and command acknowledgements; an incomplete bundle is never committed by Emergency stop;
- submit one route or discovery bundle at a time;
- implement admission/backoff and one atomic Supabase commit;
- keep legacy artifact processing and cron writers disabled;
- return durable idempotent receipts before deleting local sources.

Exit gate: unavailable gateway, duplicate submission, changed submission, parser mismatch, partial bundle, and disk-cap tests pass.

### Phase 6 — controlled production canary

1. Prove the legacy alias cannot authenticate, claim, acknowledge, or ingest.
2. Prove the support runner remains browser-off without an active, unexpired support assignment.
3. Prove each canonical key resolves to the expected runner UUID, role, assignment, company/worksite, environment, and credential version.
4. One company, one route, one route bundle on the dedicated Beacon Point clone.
5. Repeat unchanged; verify one scope-freshness update and no child updates.
6. Submit a controlled changed snapshot; verify only expected rows change.
7. Run DSW and FCC discovery bundle.
8. Verify all app surfaces and downstream outputs.
9. Observe CPU, disk I/O, connections, locks, query latency, errors, and write counts for two hours.
10. Expand to one full company for an operating day.

Exit gate: the acceptance matrix below passes and platform owner approves always-on recovery.

### Phase 7 — always-on recovery

- enable one company runner;
- enable discovery, then route bundles, then finalization;
- keep recovery/backfill lane last and lowest priority;
- observe at least seven operating days, including one finalization/payroll cycle;
- do not enable another company until the first is stable.

Exit gate: seven-day stability report and rollback unused.

### Phase 8 — legacy quarantine

- stop all legacy writes permanently;
- move legacy collection relations into a documented non-exposed quarantine schema or retain them read-only only when object dependencies require it;
- revoke application/service writes;
- retain for the bounded rollback window;
- export only the minimum compliant audit checkpoint needed for disaster recovery;
- prove no code, view, function, trigger, cron, publication, or foreign key depends on quarantine objects.

Exit gate: dependency query returns zero live dependencies and rollback window expires.

### Phase 9 — mandatory cleanup and final acceptance

With explicit destructive-action approval:

- drop the legacy quarantine schema and tables;
- drop `operations_collection_runtime_event` after required aggregate metrics are preserved;
- drop old artifact/manifest plan/artifact tables after all consumers use canonical scope/receipt/change models;
- drop raw report batch/row/summary tables after payroll, scorecard, mileage, history, and correction references are migrated;
- remove old runtime, raw-row, artifact, and manifest triggers;
- remove obsolete stage/update/promote/claim functions;
- remove `_next`, `_v2`, temporary compatibility database objects, dual-read branches, and cutover feature flags;
- retire the old runner key for all operational use while retaining its non-authenticating lineage alias; remove legacy `runner_key` schedule/config dependencies and hard-coded defaults;
- remove `operations_runner_log_event` after its bounded diagnostic evidence and required aggregate metrics are preserved; new compact receipts reference the immutable runner UUID;
- remove obsolete cron routes and Vercel cron entries;
- remove successful raw objects from `automation-artifacts` and `direct-ingestion`; retain only policy-authorized quarantine/audit objects, then remove empty buckets if unused;
- remove legacy runner paths, local MySQL collection tables, stale browser profiles, and obsolete deployment units after dependency verification;
- remove unused indexes and run `ANALYZE`; avoid blocking rewrite operations unless separately planned;
- regenerate TypeScript types and architecture documentation;
- run Supabase security/performance advisors;
- remeasure table sizes, write counts, connections, API latency, and app behavior.

Final exit gate: no temporary schema, `_next`/`_v2` objects, compatibility union, dual-write path, obsolete cron, orphan Storage object, or unowned cleanup ticket remains.

## Acceptance matrix

### Data correctness

- Early DSW, later DSW, multi-driver continuation, and FINAL DSW behave correctly.
- Later same-day state replaces current state; unchanged state only refreshes freshness.
- FCC supports incomplete early state and later timing/completion updates.
- Delivery/Pickup/GPX route bundle commits atomically.
- Missing or failed family never removes last valid current state.
- Complete replacement removes records absent from the new valid snapshot.
- Combined behavior is derived correctly without a Combined table.
- GPX unchanged repeat performs no point rewrite.

### Downstream application

- Operations workspace and Delivery Window show expected routes and counts.
- Route Health, Express, manifest history, and GPX maps match approved fixtures.
- Daily calendar, summary, service snapshot, and history match.
- Payroll, scorecards, mileage, pickup reliability, watchlists, and corrective-action evidence match.
- TeamOptix automation and command-center status remain accurate.
- Manual upload uses the same parser/projection contracts.
- Realtime completion refresh still works under tenant RLS.
- Artifact inspector handles normalized receipts and failed quarantine without broken links.

### Performance and resilience

- One unchanged normalized bundle causes one scope update and one bounded receipt only.
- One changed bundle uses one short transaction and updates only changed rows.
- No per-child source-lineage rewrite occurs.
- Admission rejects/buffers concurrent collisions without failed retries against Supabase.
- Connection use stays within the measured pool budget.
- No API query regresses beyond agreed p95 threshold.
- No unexplained lock wait, deadlock, timeout, or trigger-generated event surge occurs.

### Security and tenancy

- Company A cannot read Company B through tables, views, RPCs, Realtime, or Storage.
- Authenticated users cannot call ingestion functions.
- Runner credentials never reach browser clients.
- A runner key cannot be rebound to another company, and a retired alias cannot authenticate or write.
- A platform-owner command for Company A cannot resolve, enqueue, deliver, or acknowledge against Company B's assignment.
- Stale commands and commands targeting a prior assignment/configuration version expire without execution.
- Public/anon grants are explicit and minimal.
- Successful raw sources are absent from Supabase Storage.
- Transient tracking and failed-file quarantine expire according to policy.

### Cleanup

- Temporary-object register is empty.
- Legacy dependency graph is empty before drop.
- Old tables/functions/triggers/crons/buckets are removed.
- Generated types and docs describe only the finished canonical system.
- Runner screens and telemetry show the company display name and canonical key; host-, vendor-, and framework-based identities are absent from active configuration.
- Post-cleanup advisors and size/write baselines are recorded.

## Rollback model

Rollback is a read/write-path decision, not an unplanned database restore.

- Before writer canary: disable canonical read flag and continue legacy reads.
- During one-route canary: pause runner, retain the last acknowledged outbox payload, switch APIs back to legacy reads, and inspect canonical rows. Legacy writer remains off unless explicitly reauthorized.
- After full read cutover but before cleanup: switch adapters back to legacy read functions while legacy quarantine remains intact.
- After destructive cleanup: rollback requires the approved database/audit checkpoint and a forward restoration migration. This is why cleanup happens only after the bounded stability window and explicit approval.

Every phase has a forward migration, verification query, rollback action, and paired cleanup migration reviewed before production execution.

## Temporary-object register requirements

Before creating any temporary object, record:

- exact schema/name and type;
- purpose;
- creating migration;
- owner;
- maximum lifetime;
- read/write dependencies;
- removal gate;
- cleanup migration;
- proof query showing it is unused.

The release cannot be marked complete while this register contains an open item.

## Current Supabase platform considerations

- New public tables/views may not be automatically exposed to the Data API; grants must be explicit.
- RLS and Data API grants are separate controls and must both be tested.
- Public security-definer functions receive `PUBLIC` execute by default unless explicitly revoked.
- Public views must use security-invoker behavior to preserve underlying tenant policies.
- Transaction pooling and bounded connection use remain required as company runners grow.

## Production authority

This plan does not authorize creating, altering, backfilling, dropping, or deleting production database or Storage objects. Production remains paused until the implementation artifacts, test environment, parity report, and canary checklist are ready for explicit approval.
