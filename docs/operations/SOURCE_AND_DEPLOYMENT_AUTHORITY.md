# Source and Deployment Authority

## Canonical source

The Insight GitHub repository is the only production source authority. Its
`main` branch owns:

- the Insight web application;
- the Mobile Companion application;
- the automation worker;
- the DigitalOcean report runner;
- Supabase migrations and regression SQL;
- deployment and alignment checks.

Canonical GitHub remote:

```text
git@github.com:TedCarlson/teamoptix-insight.git
```

Production code must not be edited directly in Vercel, Supabase, or on the
DigitalOcean droplet. Runtime secrets, downloaded evidence, browser profiles,
and controller journals remain outside Git, but their expected locations and
contracts belong in Git.

## Working model

1. Create a branch from an aligned `main`.
2. Commit and push the branch to GitHub for backup and review.
3. Run the complete repository and database contract checks.
4. Apply backward-compatible Supabase migrations before dependent application
   code is promoted.
5. Merge the reviewed branch into GitHub `main`.
6. Deploy web, worker, and report-runner artifacts from that exact main commit.
7. Verify Supabase migration head, Vercel commit, worker commit, runner commit,
   systemd health, and runner schedule acknowledgment.

No multi-system deployment is literally simultaneous. Safety comes from
backward-compatible changes, strict ordering, revision evidence, health checks,
and stopping promotion when any destination disagrees.

## Git protection

The tracked `.githooks/pre-push` hook allows feature-branch pushes but blocks a
push to `main` when repository and linked Supabase migration ledgers differ.
Install it once per clone with:

```bash
pnpm setup:git-hooks
pnpm source:check
```

Use the same commands on the MacBook and Mac mini. Each machine should have one
primary clone at `~/Developer/TeamOptix/insight`. Additional Codex worktrees are
temporary branch workspaces belonging to that same repository; they are not
separate source authorities.

GitHub's `Supabase migration alignment` workflow performs the same comparison
on main changes and once daily. It requires these repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

The GitHub check must be configured as a required protection for `main`.

## Report-runner cutover

The old `teamoptix-donor-fcms-archive` repository is a temporary rollback
source. Do not archive or delete it until all of the following are true:

1. the live systemd unit runs
   `apps/report-runner/runner/continuous-controller.py` from the Insight clone;
2. the runner acknowledges the exact Insight Git commit;
3. Team Optix's signed schedule controls RUN/REST, Prior Day, DRO AM, and the
   Operations Pulse window;
4. a controlled restart and one complete collection cycle pass;
5. rollback to the previous release has been tested.

After cutover, the old repository becomes read-only and receives no production
changes.
