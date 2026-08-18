# ADR-002: Tenant Relationships, Entitlements, and Delegated Access

## Status

Proposed in Migration Event 1. No production migration or application cutover is authorized by this document.

## Context

Insight must support one person participating in several companies without turning identity, employment, access, and billing into one overloaded role.

The required user journey is:

1. A person signs in once and lands on their global profile.
2. The profile lists companies in which that person has a direct membership.
3. Selecting a company establishes the active company workspace.
4. The company workspace exposes only the industries, lines of business, modules, and data authorized for that company and person.
5. A company such as ITG may invite an independent contractor company into a relationship.
6. The contractor company owns and manages its own roster and may work with several principals.
7. ITG sees only the people and operational facts deliberately assigned to an ITG engagement.
8. Team Optix may enter a customer workspace for support or development only through explicit, time-bounded, audited delegated access.

Separate email addresses used in the donor and commercial applications are intentional independent identities. Migration must not infer that two accounts are the same person from names, email similarity, or other heuristics.

## Decision

### 1. The commercial Insight application is the destination authority

The commercial Supabase project will become the eventual authority for:

- authentication;
- global profiles;
- companies;
- company memberships;
- company relationships;
- engagements;
- module entitlements;
- delegated access and its audit trail.

The ITG donor remains operational and authoritative for each legacy workflow until that workflow completes a separately approved cutover event.

### 2. Identity is global; authority is contextual

The access chain is:

```text
Auth user
  -> global profile
  -> direct company membership
  -> active company context
  -> company entitlement
  -> user workspace grant
  -> optional engagement scope
```

A role or job title cannot substitute for this chain. A title may describe a person, but it cannot grant access.

### 3. Company relationships are first-class records

A subcontractor is not an ITG department and its people are not automatically ITG employees. A directional company relationship connects a principal company to a provider company.

The relationship may be exclusive, but exclusivity is an attribute of that one relationship. It does not prevent the provider from maintaining other relationships unless an explicit business rule is introduced later.

### 4. Engagements carry operational scope

An engagement belongs to one company relationship and identifies:

- the industry;
- the line of business;
- the operating period;
- the shared work context.

Industry and line of business are separate concepts. A company may participate in several of each, and one company relationship may contain several engagements.

### 5. Capabilities and user grants answer different questions

A company capability entitlement answers:

> Has this company been enabled to use this module in this scope?

A company user grant answers:

> May this person enter this enabled workspace for this company?

Both checks are required for ordinary members. Company administration and tightly controlled platform operations remain separate governance concerns.

Entitlements may be company-wide or limited to one engagement. Their source may be:

- included;
- trial;
- subscription;
- sponsored;
- contract.

This supports free basic access without coupling access decisions directly to Stripe. For example:

- a contractor may receive engagement-scoped KPI and roster-management capabilities as included access for its ITG work;
- the contractor may independently purchase payroll or asset-management for its own company;
- ITG does not gain visibility into those company-private upgrades merely because an ITG relationship exists.

### 6. A roster is company-owned; client visibility comes from assignments

The contractor company's roster is its private business record. ITG being a client, prime contractor, relationship principal, or initial data-entry helper does not make ITG an owner or global viewer of that roster.

`core.engagement_roster_assignment` is the deliberate sharing boundary. It associates one company-owned roster record with one engagement and carries only the operational identity needed in that engagement:

- shared display name;
- engagement role;
- optional client worker reference;
- assignment status and dates;
- who recorded the assignment and for which company.

An ITG user may initially load a person on behalf of a contractor through a later, narrow command. That command must atomically:

1. create or select the roster record under the contractor's `company_id`;
2. create the ITG engagement assignment;
3. record ITG as the company acting on behalf of the contractor;
4. expose only the assignment projection to ITG.

The contractor may maintain additional roster members who are internal, unassigned, or assigned to other clients. Those people have no ITG engagement assignment and are therefore not visible to ITG.

No relationship-wide policy may be added to `core.company_roster`. Shared KPIs and future client-facing operational facts should reference the engagement assignment, not use the private roster as their authorization boundary.

The user-facing operating model is defined in `docs/architecture/PeopleWorkforceOperatingModel.md`: one People workspace, one roster-management overlay, an ISP-filtered ITG engagement directory, and separate client-safe and internal reporting projections.

### 7. Data ownership is explicit

Every migrated or newly built domain record must be classified before implementation.

| Classification | Owner | Example | Visibility |
|---|---|---|---|
| Company-private | One company | Full roster, internal assignments, HR facts, payroll configuration | Owning company only |
| Engagement-shared | An engagement | Explicit worker assignments, shared KPIs, work evidence | Authorized parties to that engagement |
| Platform governance | Team Optix | Provisioning, support authorization, access audit | Team Optix governance and required customer approvers |

An engagement does not create blanket access to either company database. Each domain table adopted later must carry an enforceable company and/or engagement boundary.

### 8. Team Optix customer access is delegation, not impersonation

Delegated access records the real actor, the operator company, the target company, the approved workspace grants, the purpose, and the allowed period.

Entering a customer workspace requires an active delegated session. The interface must visibly indicate the target company and provide an obvious exit. Customer-domain APIs and row policies must opt into the delegated-access helper per grant; this migration does not silently add delegation to existing company access.

The existing platform-owner power is treated as break-glass governance. It is not the normal support or development workflow.

### 9. Mutation paths remain closed during foundation work

Migration Event 1 grants authenticated users read access only where row-level policies establish a legitimate relationship. It intentionally creates no authenticated insert, update, or delete paths for relationships, engagements, entitlements, delegation, or identity links.

Later events must introduce narrow server-side commands or database functions with explicit validation, acceptance, audit, and idempotency rules.

## Consequences

- A person can have several company memberships without switching authentication systems.
- Independent contractor companies retain their own identity and private roster.
- ITG may help administer an ITG assignment without gaining visibility into the contractor's other workers or clients.
- Free and paid product capabilities can coexist without being encoded as user roles.
- Industry and line-of-business routing can grow without hard-coded global defaults.
- Team Optix access to a customer becomes visible and auditable.
- Existing application routes do not consume this model until separately approved.
- Existing `access_context()` remains unchanged in Event 1; a later event must replace the client-owned shell with a server-resolved workspace context.

## Rejected alternatives

### Share one broad service-role bridge between Supabase projects

Rejected as a permanent architecture because it bypasses tenant row policies, makes audit attribution difficult, and couples two authentication universes.

### Treat subcontractors as ITG members

Rejected because it erases company ownership, fails multi-principal relationships, and risks exposing company-private data.

### Put paid features into a person's role

Rejected because product availability belongs to a company or engagement, while a user grant controls an individual person's access.

### Automatically merge identities

Rejected because independent accounts and emails are intentional. Any donor link must be explicit and verifiable.

## Event boundary

This ADR authorizes no deployment, production migration, donor write, route change, authentication change, user import, or data synchronization.
