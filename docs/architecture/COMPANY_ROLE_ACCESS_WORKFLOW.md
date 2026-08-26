# Company Role, Leadership, and Access Workflow

## Decision

Identity, company membership, roster role, leadership responsibility, general Insight workspace grants, and product entitlements remain separate records. A single governed workflow coordinates the records when a company administrator changes a person's role.

Product-specific entry is not shown in the general company Access screen. Product entry resolves the signed-in user and company entitlement first, then evaluates product-scoped authorization.

## Role change workflow

From a roster person's drawer, **Role, leadership & access** performs one transaction that:

1. updates the roster role and job title;
2. updates the active company membership title when the roster record is linked to an app profile;
3. replaces that person's workforce leadership assignment;
4. replaces only general Insight workspace grants, preserving product-specific grants;
5. writes an audit record and roster timeline event.

Business Contact and Assistant BC allow multiple assignments. Authorized Operator, Fleet Manager, and HR default to one assignment. Company-specific limits are represented by `core.company_leadership_role_config`.

## Acceptance criteria

- A regular active driver with no management grants signs in to the company driver home.
- An active member with at least one general Insight workspace grant signs in to a tailored company workspace showing only granted tools.
- A company administrator changing a linked person to Assistant BC can review role, Assistant BC leadership, and the recommended operations grants, then save them in one action.
- The same change updates roster role, roster job title, membership title, leadership assignment, and grants atomically; a failed validation leaves all records unchanged.
- Existing active Assistant BC roster records are reconciled to the Assistant BC membership title and leadership assignment by the migration.
- A company can assign two or more Business Contacts or Assistant BCs without replacing the existing assignee.
- Duplicate assignments for the same person and leadership role are prevented.
- Direct navigation and dispatch API/RPC calls require the matching active company grant unless the user is a company administrator or platform owner.
- The general Access screen neither displays nor replaces the Insight Telecom Fulfillment product grant.
- A user with only a product-specific grant is not routed into a general Insight management workspace.
- Role and access changes are recorded with before/after state and the acting profile.

## Release verification

1. Apply the migration in a non-production Supabase environment.
2. Test a basic driver, a linked Assistant BC, an unlinked Assistant BC, a company administrator, and a user with multiple company memberships.
3. Confirm the reported promoted-driver record resolves to Assistant BC leadership and retains the seven operations grants.
4. Confirm a second Assistant BC can be added and removed without changing the first.
5. Confirm denied routes redirect to the tailored workspace and denied dispatch API/RPC requests return authorization errors.
6. Promote the migration and application together; do not deploy the application ahead of its RPCs.
