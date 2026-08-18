# People and Workforce Operating Model

## Purpose

This document replaces the donor application's separate People, Workforce, roster, and onboarding mental models with one operating experience. It is an experience contract, not authorization to change production routes.

## The product model

One human should not feel like several records merely because they are moving through hiring, onboarding, training, field readiness, active work, or separation.

The system still preserves distinct facts underneath:

```text
Person
  -> company-owned roster record
  -> lifecycle stage
  -> readiness requirements
  -> role assignments
  -> engagement assignments
  -> optional application profile
```

The interface presents those facts through one People workspace and one roster-management overlay.

## Vocabulary

| Concept | Meaning | Not used for |
|---|---|---|
| Person | The human identity | Company ownership or access |
| Roster record | A company's private record of the person | Client-wide visibility |
| Lifecycle stage | Where the person is from intake through departure | Job role or permission |
| Readiness | Computed blockers before field work | Another manual lifecycle status |
| Role | What the person does | Hiring progress or login authority |
| Engagement assignment | The client-safe placement of a roster member into client work | Ownership of the full roster |
| Profile | The authenticated application identity, when needed | Proof of employment |

## One People workspace

The company navigation exposes one primary destination: **People**.

The workspace uses views and filters instead of separate People, Workforce, and Onboarding destinations:

- All people;
- Needs attention;
- Candidates;
- Onboarding;
- Field ready;
- Active;
- Inactive or former.

These are saved views of the same company roster authority. Moving a person forward changes lifecycle facts; it does not copy the person into a second workforce system.

### Contractor company view

A contractor sees its complete company-owned roster, including:

- internal people;
- people assigned to ITG;
- people assigned to other clients;
- people not currently assigned to a client.

Engagement chips show where a person is assigned without giving one client ownership of the person.

### ITG client view

ITG does not open the contractor's People workspace. ITG opens its own Workforce view, which is an engagement directory.

The top-level ISP selector lists provider companies with an authorized ITG engagement. Selecting an ISP loads only `core.engagement_roster_assignment` rows for that ITG relationship and engagement.

An **All ISPs** view may combine those assignments, but it must never query or expose each provider's complete `core.company_roster`.

## One roster-management overlay

Every person row opens the same overlay component. The overlay changes its available sections and actions from the resolved company, engagement, entitlements, user grants, and data classification.

It must not open another drawer, dialog, or modal. Confirmations and validation appear inside the overlay.

### Persistent header

The header contains only durable orientation:

- person's shared or company display name;
- roster-owning company or selected ISP;
- lifecycle stage;
- readiness state;
- small source signal;
- close action.

### Small source signal

The signal is derived from provenance:

- **ITG added** when ITG created the contractor-owned roster row through approved on-behalf authority;
- **Contractor added** when the roster owner created the row;
- a neutral legacy label when historical provenance cannot be verified.

The database stores company IDs and entry authority, not the words `ITG` or `Contractor`. The interface renders the appropriate label for the active relationship.

### Overlay body

The overlay follows the person's current needs rather than exposing every subsystem at once:

1. **Next action** — the single most important incomplete step and its owner.
2. **Person** — identity and contact fields permitted in the current context.
3. **Lifecycle and readiness** — stage, computed blockers, and allowed transition.
4. **Role and assignment** — company role plus client engagement placement.
5. **History** — concise event timeline.

Company-private sections such as compensation, HR facts, private documents, and assignments to other clients are rendered only in the roster owner's context. ITG receives the engagement-safe projection only.

Advanced details can expand in place. They do not become separate navigation destinations or nested overlays.

## Streamlined creation workflow

### Contractor creates a person

One transaction:

1. creates the contractor-owned roster record;
2. creates immutable entry provenance with the contractor as entering company;
3. optionally assigns the person to an authorized engagement;
4. records the lifecycle event.

### ITG creates a person for a selected ISP

The ISP and engagement are selected before **Add person** becomes available.

One authorized transaction:

1. verifies the active ITG-to-ISP relationship;
2. verifies ITG's engagement-scoped `roster-on-behalf` entitlement and the actor's roster grant;
3. creates the roster row under the ISP company's ownership;
4. creates immutable provenance naming ITG as the entering company and `principal_on_behalf` as authority;
5. creates the ITG engagement assignment and its client-safe fields;
6. records one audit event;
7. returns the completed overlay model.

A partial result such as “roster created but assignment failed” is not acceptable. The command succeeds or rolls back as one unit.

## Lifecycle simplification

The user should make one lifecycle decision at a time.

```text
Candidate
  -> Onboarding
  -> Field ready
  -> Active
  -> Inactive or Former
```

Readiness is computed from requirements and may be `blocked`, `ready`, or `not applicable`. It is not another freely edited status.

Job role, leadership relationship, application access, engagement assignment, compliance, and compensation remain separate facts. They may affect readiness but do not create parallel lifecycle labels.

The overlay presents the next permitted transition and explains any blocker. It does not expose every possible state in a generic dropdown.

## Reporting by group

One report definition accepts a group and audience:

```text
Group: ISP / engagement / operating team
Audience: Client-safe | Internal
Period: governed reporting window
```

The audience choice resolves to a different secured data projection. It is not a front-end column-hiding option.

### Client-safe report

Built only from engagement assignments and engagement-authorized operational facts. It may include:

- shared workforce names or client references;
- engagement roles and active assignment counts;
- agreed readiness or qualification signals;
- agreed KPIs and work outcomes;
- reporting period and source quality notes.

It excludes private contact information, compensation, HR notes, private compliance documents, other-client assignments, and unassigned roster members.

### Internal report

Built for the roster owner or authorized internal operator. It may add:

- complete company headcount and lifecycle distribution;
- internal readiness blockers;
- staffing gaps and unassigned capacity;
- compensation or payroll-support signals when entitled;
- private compliance and operational exceptions;
- assignment coverage across clients.

The internal projection cannot be reached by changing a browser query parameter while holding only client-safe authority.

## Route shape

The intended target shape is small:

```text
/company/[slug]/people
  - company-owned People workspace
  - view/filter state in the URL
  - one roster overlay selected by person ID

/company/[slug]/workforce
  - client/prime engagement directory
  - ISP selector
  - one roster overlay selected by engagement assignment ID

/company/[slug]/reports/workforce
  - group selector
  - authorized audience projection
```

Hiring and onboarding may retain deep links for external invite flows, but company operators return to the same People record and overlay.

## Implementation boundaries

- Server code resolves the workspace and overlay context before rendering.
- Client state controls interaction, not authorization.
- The overlay consumes one composed view model rather than fetching each tab independently.
- Mutations are narrow lifecycle or assignment commands, not generic record patches.
- Every command returns the refreshed view model so the user remains in place.
- Drawers and routes in the donor are requirements evidence, not components to copy.

## Acceptance criteria for a future UI event

1. A company operator can add a person, complete the next required step, and return to the list without opening a second overlay.
2. One person remains one roster record while moving from candidate to active field worker.
3. ITG can switch ISPs without gaining access to unassigned or other-client contractor workers.
4. ITG can create a contractor-owned person on behalf of the selected ISP in one atomic command.
5. Both parties see a small, accurate source signal.
6. Client-safe and internal reports return different server-authorized projections.
7. A browser-only change cannot upgrade client-safe data to internal data.
