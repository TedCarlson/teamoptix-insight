# Insight Database Workflow

This directory is the governed database source of truth for Insight.

## Structure

### `migrations/`

Executable, ordered database migrations.

- `20260712123222_baseline_live_schema.sql` is the authoritative production baseline.
- Every schema change after the baseline must be represented by a new timestamped migration.
- Existing migrations must never be edited after they have been applied remotely.

### `sql/artifacts/legacy-applied/`

Historical SQL scripts that were applied before Supabase CLI migration tracking was established.

These files are retained for audit and reference only.

They must not be moved back into `migrations/` or replayed automatically.

### `sql/artifacts/functions/`

Reusable or developmental function definitions.

### `sql/artifacts/policies/`

Reusable or developmental RLS policy definitions.

### `sql/artifacts/views/`

Reusable or developmental view definitions.

### `sql/artifacts/verification/`

Read-only SQL used to verify schema, permissions, policies, functions, and data behavior.

### `sql/baseline/`

Optional supporting baseline documentation or manually captured reference material.

## Governed Change Process

1. Inspect the current production implementation.
2. Design the exact SQL change and acceptance criteria.
3. Apply and verify the SQL in the governed production SQL workflow.
4. Create a new migration file representing the finalized change:

   `supabase migration new descriptive_change_name`

5. Place the finalized SQL in the generated migration.
6. Confirm migration alignment:

   `supabase migration list`

7. Commit the migration and any supporting artifacts.
8. Never use `supabase db push` against production without a dedicated reviewed deployment step.

## Rules

- Production remains the operational database.
- The migration library remains the durable record of schema evolution.
- The baseline must never be replayed against the existing production database.
- Applied migrations are immutable.
- Verification SQL must be read-only.
- Secrets, database passwords, generated temp files, and local runtime state must never be committed.
