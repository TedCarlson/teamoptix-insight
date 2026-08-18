# ITG Donor Conversion Plan

## Operating posture

The ITG donor is frozen for conversion in concept. It remains live and receives only production-critical security, data-correctness, and continuity fixes. New platform architecture is built in commercial Insight.

Every migration event is independently approved. Local preparation does not authorize staging, production, deployment, data access, or donor writes.

## Non-disruption rules

1. Work begins on a local `codex/` branch from a clean target baseline.
2. Schema work is additive before it is adopted by application code.
3. Donor data and donor Auth remain unchanged until a specific cutover event.
4. Each workflow has exactly one system of record at a time.
5. Dual writes are prohibited unless a later event supplies an idempotent outbox, replay rules, reconciliation, and rollback.
6. Cross-project reads use a narrow server adapter; browser clients never receive donor privileged credentials.
7. Local and staging verification precede any production approval.
8. Unrelated-company isolation, relationship-party access, delegated access, and private-versus-shared data are regression-tested.
9. Every event states its rollback before execution.
10. Production application is a separate approval from code review.

## Migration events

### Event 1 — Dormant tenancy foundation

Deliverables:

- tenant relationship and engagement decision record;
- separate industry and line-of-business foundation;
- company and engagement capability entitlements;
- contractor-owned roster assignments with client-safe shared fields and on-behalf provenance;
- one-workspace People and Workforce experience contract with a single management overlay;
- explicit delegated-access grant and session audit structures;
- legacy identity-link contract without deduplication;
- transaction-local SQL isolation regression;
- no application adoption and no database application.

Rollback: discard the local branch. No running system has changed.

### Event 2 — Server-resolved workspace context

Replace the global client-owned access shell with a server-resolved context for one non-production route. The context must include identity, direct memberships, active company, entitled capabilities, user grants, engagement scope, and any active delegated session.

No ITG data is connected. Existing production routes remain on their current resolver.

Rollback: remove the isolated route and context adapter.

### Event 3 — Company onboarding and relationship acceptance

Build commercial registration for a company owner, company creation, ITG contractor invitation, provider acceptance, and roster ownership. Add narrow audited mutation commands for relationships and engagements.

The on-behalf roster command must create the person under the contractor company's ownership and the ITG engagement assignment in one transaction. It must not grant ITG access to `core.company_roster` as a whole. Contractor users manage their full roster; ITG users receive only the assignment-safe projection for the ITG engagement.

Rollback: disable the feature flag and retain dormant records for audit.

### Event 4 — Entitlement administration

Enable included KPI and roster-management capabilities and controlled upgrades such as payroll and asset management. Billing may supply entitlement facts, but payment-provider state does not directly authorize workspace access.

Rollback: disable entitlement issuance; existing commercial billing records remain intact.

### Event 5 — Donor identity pilot

Pilot a small internal group. Create or select commercial profiles, establish explicit legacy links, provision memberships separately, and verify sign-in and workspace selection. Do not reuse donor sessions or JWTs.

Rollback: retire pilot links and grants; users continue in the donor.

### Event 6 — Read-only ITG migration adapter

Introduce a server-only, allowlisted adapter for one donor dataset. Copy or read data into a quarantined target staging area and produce reconciliation without exposing it as authoritative application data.

Rollback: disable the adapter and delete only the event-owned staging copy under an approved cleanup plan.

### Event 7 — Contractor roster and ISP workforce pilot

Create selected contractor companies and reconcile known ITG workers to their roster owners. Import each worker as a contractor-owned roster row with immutable donor provenance, then create only the ITG engagement assignments authorized for the pilot.

Build the single People overlay, the ITG ISP selector, the small source signal, and the client-safe/internal report projections against pilot data. The import and assignment write must be atomic and idempotent.

Rollback: disable the pilot route and retire event-owned target assignments. The donor remains authoritative and unchanged.

### Event 8 and onward — One workflow at a time

For each ITG workflow:

1. document donor behavior and data authority;
2. classify every field as company-private, engagement-shared, or platform governance;
3. build the target workflow natively;
4. rehearse import and reconciliation;
5. shadow-test with named users and companies;
6. approve a cutover window;
7. switch authority once;
8. monitor and retain a tested rollback path.

Candidate ordering should favor a narrow, high-value, low-write workflow before payroll, identity administration, or broad roster migration.

## Completion condition

The donor is retired only after every required workflow has a named target authority, reconciled data, accepted tenant-isolation evidence, and an approved retention/archive outcome. Visual similarity or feature count alone is not completion.
