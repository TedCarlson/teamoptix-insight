# Supabase Migration Alignment Audit — August 9, 2026

## Outcome

The repository does not have migration files stored in a second hidden source
tree. The canonical migration source is `supabase/migrations` in the Insight Git
repository. The apparent lag came from two different conditions:

1. the local Docker database volume had last recorded migration
   `20260722220000`; starting Docker does not automatically replay newer files;
2. a clean replay of the full repository history is not currently reproducible
   without production-derived state.

No production migrations were applied during this audit.

## Location-by-location state

| Location | State observed | Meaning |
| --- | --- | --- |
| MC worktree | Contains the existing history plus `20260809150000`, MC-0 `20260809160000`, and MC-1 `20260809161000` | Proposed source state; changes are not yet committed or merged |
| Main checkout | Contains `20260809150000` after the last production-applied migration | Existing pending repository migration |
| Linked Supabase | Applied through `20260809123000` | Production is unchanged; `20260809150000` and the two MC migrations are not deployed |
| Local Docker ledger after audit | Applied through `20260801160000` | The authorized clean rebuild stopped at the first production-data assertion |
| Isolated validation database | Production schema snapshot plus `20260809150000`, MC-0, and MC-1 | Disposable schema-only proof environment, not an application runtime |

## Clean-replay findings

The authorized local `supabase db reset` exposed historical assumptions before
it reached the Mobile Companion migrations:

- `20260722223000_register_fcc_work_area_summary_shape.sql` assumes the
  `FCC` operations report family reference row already exists.
- `20260726210000_restrict_anonymous_view_access.sql` expects three manifest
  route-detail views that a clean history does not create. The earlier
  `20260715004500_manifest_route_detail_public_views.sql` file is empty.
- `20260731104500_platform_switchboard.sql` inventories local-only Supabase
  infrastructure when replayed locally, including `_realtime` objects that are
  not valid Platform library entries.
- `20260801170000_align_live_stripe_billing_posture.sql` intentionally asserts
  live Stripe tier, customer, payment-method, and subscription state. A new
  empty local database cannot satisfy those production-data assertions.

These are reproducibility gaps in historical migrations. They are not failures
in MC-0 or MC-1, and adding retroactive migration files in the middle of an
already-applied production ledger would create a new alignment problem.

Four temporary local-only diagnostic migrations were tried while locating the
gaps. Their files were deleted and their local ledger records were explicitly
reverted during this audit:

- `20260717012500`
- `20260722222500`
- `20260731104400`
- `20260731104600`

They were never committed and never applied to linked Supabase.

## MC validation evidence

A schema-only dump of linked Supabase was loaded into a separate local database.
It contained no `COPY` or `INSERT` customer data. The following migrations then
applied successfully in real deployment order:

1. `20260809150000_unify_continuous_runner_daily_package.sql`
2. `20260809160000_mobile_companion_switchboard_contract.sql`
3. `20260809161000_mobile_companion_edge_outbox.sql`

`supabase/sql/mobile_companion_edge_outbox_regression.sql` completed all
assertions and rolled back its fixtures. The resulting contract check confirmed:

- all three governed objects are `IMPLEMENTED` with `PLATFORM` authority;
- session, batch, and extended breadcrumb-point tables exist;
- session and batch synchronization use security-definer RPC gateways;
- authenticated clients cannot insert breadcrumb points directly;
- duty scope, observation-only provenance, partial acknowledgments, exact
  duplicate replay, and changed-payload batch conflicts behave as designed.

## Alignment decision required before production

Source alignment and deployment alignment are separate actions:

1. commit and review the MC branch;
2. merge it into the main checkout so every checkout sees the same migration
   source;
3. review the operational effect of pending migration `20260809150000` before
   any remote push because it changes runner behavior and cancels legacy queued
   requests;
4. deploy `20260809150000`, MC-0, and MC-1 together only after that review;
5. create a governed local-development baseline or seed strategy so future
   resets do not require live Stripe data or invisible reference state.

Until steps 3–5 are explicitly completed, it would be inaccurate to describe
all database locations as aligned. The repository and validation evidence are
ready; production remains intentionally untouched and the standard local Docker
database remains a partial clean rebuild.
