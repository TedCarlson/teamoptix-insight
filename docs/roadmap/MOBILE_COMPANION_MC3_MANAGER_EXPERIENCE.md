# Mobile Companion MC-3 — Manager Experience

## Goal

MC-3 turns Mobile Companion into an access-scoped manager product. It does not copy desktop pages into a smaller viewport. It preserves the same company authority, read models, mutations, audit trails, and workflow outcomes while reorganizing them around short, high-frequency manager decisions.

The responsive web workspace remains the continuity fallback and the destination for dense or infrequent administration that has not earned a native workflow yet.

## Product rules

1. A manager context is a company-level persona, never a simulated driver gate.
2. The app only exposes sections backed by an active company membership and the required workspace grant. Company admins inherit the full company workspace catalog.
3. A manager who is also a linked driver can move between Manager Schedule and My Schedule without signing out or changing companies.
4. Native mutations use the same authoritative database functions as the web app. The app must not create a parallel business workflow.
5. Tables become searchable lists and detail sheets; month grids become day rails and agendas; desktop sidebars become focused action hubs.
6. Consequential manager actions show impact, require deliberate confirmation, and record the authenticated actor.
7. Offline support is appropriate for observation and drafts. Approval, assignment, publishing, and schedule-commit actions require live authority.

## Manager navigation

The manager footer has five stable destinations:

| Destination | Purpose | Web domains represented |
| --- | --- | --- |
| Today | Attention queue, company posture, messages, and grant-scoped shortcuts | Home, limited Admin |
| Operations | Live route responsibility and in-day management | Operations, Dispatch |
| Schedule | Coverage, requests, baselines, and exceptions | Schedule |
| People | Workforce briefing, roster, and hiring | People, Hiring |
| Manage | Asset and configuration work that is not part of the live-day loop | Fleet, Routes, limited Admin |

The footer is grant-aware. A user never sees an empty destination. Today remains the landing surface and composes only authorized cards. Fleet, Routes, and Admin remain first-class sections inside Manage and can be reached directly from Today alerts.

## Surface selection

### Today / Home — native, MC-3 priority 0

Native jobs:

- show a ranked manager attention stack;
- read company announcements and acknowledgment posture;
- draft, save, publish, broadcast, or target a message;
- show current operations, staffing, schedule, fleet, and compliance exceptions when granted;
- resume the manager's most recent work.

Mobile identity:

- one primary attention card at a time;
- swipe or explicit actions for acknowledge, review, or dismiss-from-view;
- message composer as a full-height sheet with audience and acknowledgment controls;
- no desktop dashboard mosaic.

### Operations — native, MC-3 priority 1

Native jobs:

- filter live routes by arrived, waiting, on-job, or exception posture;
- open a route responsibility card;
- review stops, packages, pickups, driver, helper, trainee, and live signals;
- assign or unassign seats;
- record attendance, call-out, dispatch, and operational notes;
- refresh live collection posture.

The app keeps report upload, large compliance reports, and historical report analysis in the web fallback initially.

### Schedule — native, MC-3 priority 0

Schedule is four connected manager sections:

1. **Coverage** — a day rail and agenda showing scheduled workforce, routes, off-schedule people, changes, and capacity delta.
2. **Requests** — PTO or simple time-off review with dates, notes, coverage impact, approve/deny, and review history.
3. **Baselines** — searchable people list with current preset, daily route pattern, rotation, anchor, and effective dates.
4. **Exceptions** — call-out, time off, administrative off, add-in, and resignation workflows with active-history management.

Baseline editing is a guided workflow:

1. choose a person;
2. choose or inspect a preset;
3. set the route pattern and optional rotation/anchor;
4. preview the next 14 days and coverage delta;
5. confirm the effective date;
6. commit and repaint through the authoritative schedule workflow.

Time-off behavior is company scoped:

- when the company has governed PTO policy and balance authority, the request includes PTO context and policy impact;
- otherwise it remains a simple time-off request with no implied balance or payroll truth;
- approval creates the appropriate schedule override and repaints affected facts;
- denials and manager notes remain in request history.

Managers who also have a driver context receive a visible **My Schedule / Manager Schedule** bridge.

### People — native, MC-3 priority 1

Native jobs:

- show today's scheduled/off/interview/time-away briefing;
- search and filter the roster using mobile person cards;
- open a person workspace for status, invite posture, compliance, lifecycle, and manager actions;
- review the hiring pipeline by stage and readiness;
- open candidate workflows and complete selected routine steps;
- surface expiring or missing compliance evidence.

Bulk import, broad report generation, and complex policy authoring remain web fallback work.

### Fleet — native inside Manage, MC-3 priority 1

Native jobs:

- show dispatch-ready, spare, unavailable, open-defect, and work-order posture;
- search vehicles and open a vehicle workspace;
- review identity, availability, assignment, GVWR posture, defects, maintenance, and inspection history;
- create or triage defects and work orders;
- connect manager review to driver-submitted inspections.

### Routes — native inside Manage, MC-3 priority 1

Routes owns the recurring route baseline; Operations owns today's execution.

Native jobs:

- search route cards by route, WA number, location, type, or rotation;
- review the recurring service-day pattern and thresholds;
- add or edit a route through a guided sheet;
- review history and effective-state changes.

This avoids duplicating live assignment controls already owned by Operations.

### Admin — limited native scope inside Today and Manage, MC-3 priority 2

Native jobs:

- company operating profile and posture;
- terminal and contract identity needed to understand current work;
- signed-in user's company role and active grants;
- selected operational configuration and safe toggles that support mobile workflows.

Billing, payroll configuration, analytics configuration, opportunity analysis, grant administration, and other high-risk or infrequent setup remain web-only until separately designed.

## Interaction grammar

MC-3 uses a consistent mobile grammar across domains:

- **attention stack** for work needing a decision;
- **status chips** for fast filtering;
- **cards** for routes, people, vehicles, requests, and baselines;
- **detail sheets** for inspecting one object without losing list context;
- **guided action sheets** for edits and consequential mutations;
- **day rail + agenda** instead of a compressed month grid;
- **impact preview + confirm** before publish, approve, assign, remove, or commit;
- **web fallback link** only when the native workflow is not yet available.

## Grant routing

| Native section | Required grant(s) |
| --- | --- |
| Today messages | company membership; authoring follows message authority |
| Operations | `dispatch`, `planning`, `delivery_window`, `operations_uploads`, or `reports` |
| Schedule | `schedule` |
| People roster | `roster` |
| People hiring | `hiring` |
| Fleet | `fleet` |
| Routes | `routes` |
| Admin summary | `admin_config`; company admins receive it implicitly |

The app should resolve grants once at context selection, then enforce authority again at every data and mutation boundary.

## Approved design checkpoint — 2026-08-11

The implementation reference is the [Insight Mobile Companion Figma file](https://www.figma.com/design/R4UM3y6Be7b0intKPLSUrE/Insight-Mobile-Companion?node-id=62-14). The approved MC-7 manager foundation currently includes:

| Figma frame | Node | Decision represented |
| --- | --- | --- |
| Manager Today / Full Grant | `62:15` | Grant-matched manager landing surface and priority work |
| Manager Schedule / Manager Only | `68:49` | Direct manager scheduling entry for a single-role manager |
| Manager Schedule / Dual Role Bridge | `69:84` | Explicit My Schedule / Manage Schedule choice for dual-role users |
| Manager Coverage | `78:113` | Mobile day rail, coverage posture, exceptions, and action entry |
| Account / Role Context | `83:163` | Company, role, grants, and deliberate context switching |

These frames establish the information architecture and interaction grammar for MC-3A and the opening of MC-3B. Later workspace frames should extend this system rather than introduce a separate manager navigation model.

## Delivery sequence

### MC-3A — Manager foundation

- company-level manager context and persona switcher;
- grant-aware Today and five-destination shell;
- section registry and web fallback routing;
- manager access tests.

### MC-3B — Schedule authority

- Coverage, Requests, Baselines, and Exceptions sections;
- PTO/simple-time-off policy distinction;
- review, baseline commit, override, repaint, and audit connections;
- My Schedule / Manager Schedule bridge.

### MC-3C — Live management

- message authoring and publishing;
- Operations route cards and responsibility workspace;
- attendance, assignment, and dispatch actions.

### MC-3D — Workforce and assets

- People briefing, roster, and hiring workflows;
- Fleet posture, vehicle workspace, and defect queue;
- Route baseline cards and editor;
- limited Admin posture.

## Explicit non-goals for the first MC-3 release

- reproducing every web table or configuration screen;
- moving billing, payroll truth, analytics authoring, or grant administration into the app;
- allowing offline manager approvals or assignments;
- hiding unavailable authority behind optimistic UI;
- treating access to a surface as authority to mutate every record inside it.
