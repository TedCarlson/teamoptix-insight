# Product Branch Studio Contract

## Purpose

TeamOptix needs a place to design and test product capabilities without using a production company workspace as the experiment. A product branch studio provides that place.

Insight — Telecom Fulfillment is the first implementation of this contract. Insight — P&D Last Mile and later product lines should follow the same path after the Telecom Fulfillment pattern is accepted.

## Separation of responsibilities

### Product studio

- Lives inside the existing TeamOptix product area.
- Uses explicit fictional fixture files.
- Performs no database writes.
- Can model pages, tables, roles, access boundaries, and user interactions.
- May keep temporary edits in browser memory so a workflow can be tested.
- Must visibly identify itself as a branch demo.

### Prospect demo

- Reuses the approved fictional fixtures and product interactions from the studio.
- Lives behind a separate guided, invitation-controlled entry point.
- Presents product navigation and realistic workflows without TeamOptix developer controls.
- Has no connection to production tenant records and resets to a known state.
- Exposes only capabilities intentionally selected for the demonstration.
- Uses demo-safe analytics and audit events that contain no customer data.

### Company workspace

- Represents a real tenant and real business activity.
- Uses authenticated, role-aware server projections.
- Receives only capabilities that have completed review.
- Must not contain experimental fixture data or developer-only behavior.

### Donor application

- Remains operational during conversion.
- Is read only from the perspective of the new product until a migration event is approved.
- Supplies behavior and data lessons, not a structure to clone.

## Graduation path

1. Model a capability with fictional fixtures in the product studio.
2. Approve the user workflow, tenant boundary, data contract, and report audience.
3. Implement the capability behind the existing TeamOptix identity and company model.
4. Verify it with automated access tests and a bounded local pilot.
5. Approve a migration event with explicit source, target, reconciliation, and rollback rules.
6. Enable the capability for a selected real company.
7. Retire the matching donor path only after the new path is proven.

The prospect demo may be published after the fictional experience is approved; it does not need to wait for customer-data migration. Publication is its own access and hosting event and does not grant access to the internal product studio.

## Non-negotiable rules

- A product studio never creates a second identity system, company model, or shell.
- The prospect demo and developer studio may share components and fixtures, but they do not share an access doorway.
- A platform developer does not gain blanket tenant-data access merely by being the developer.
- Demo fixtures are unmistakably fictional and must never be imported into a real tenant.
- A visual-only role restriction is not security; production access is enforced in server projections and database policies.
- Client-safe and internal reports are separate secured projections, not one payload with columns hidden in the browser.
- Production data enters only through a named and approved migration or seed event.

## First implementation

- Studio route: `/teamoptix/products/itg`
- Fixture: `apps/web/src/features/teamoptix/itg/itgDemoData.ts`
- Interactive surface: `apps/web/src/features/teamoptix/itg/ItgProductStudio.tsx`
- Persistence: browser memory only
- Database records created: zero

## Future FedEx application

The FedEx branch should reuse this product lifecycle contract while keeping its own fixture set and product-specific workflows. Shared capabilities such as People, roster ownership, scheduling, payroll, assets, and reporting should graduate into common company-workspace modules instead of being copied between ITG and FedEx products.
