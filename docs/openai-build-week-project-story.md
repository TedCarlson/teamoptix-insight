## Inspiration

Insight is an operations platform for contractor-operated field organizations. I built it from direct experience with the fragmented systems, spreadsheets, reports, and institutional knowledge required to run a last-mile delivery business.

The people responsible for daily execution often have plenty of data but very little usable operational intelligence. Important facts are scattered across carrier reports, scheduling tools, dispatch notes, vehicle records, compliance documents, and conversations. By the time those facts are assembled, the opportunity to act may already be gone.

Insight was created to close that gap.

During Build Week, I used GPT-5.6 and Codex to evolve Insight from an existing production SaaS into a more cohesive operations engine—one that collects operational evidence, validates it, turns it into actionable signals, and preserves the human decisions made in response.

The goal was not to create another dashboard. It was to create a system that helps operators understand what happened, determine what requires attention, document what they did about it, and communicate the result with confidence.

Insight grew out of a problem I have lived personally: operational leaders are routinely asked to explain service outcomes without being given a reliable, unified account of the day.

A terminal may ask about a missed pickup, an Express package, a service-code trend, a vehicle defect, or a staffing decision. The answer often depends on reconstructing events from multiple reports and the memories of several people. That creates delays, incomplete explanations, and conversations centered on blame instead of evidence.

I wanted to build a better operating model.

Insight treats operational data as the beginning of a conversation—not as a weapon and not as a substitute for management judgment. It gives company agents a shared factual foundation for discussing performance, investigating exceptions, assigning follow-up, and showing due diligence.

> **Surface the signal, preserve the evidence, guide the response, and keep the human responsible for the decision.**

## What it does

Build Week focused on connecting several previously separate capabilities into one governed operational lifecycle.

### A governed automation and ingestion system

I developed a workbench for authoring and launching governed collection instructions for recurring operations, previous-day close, targeted recovery, and historical collection.

The system now:

- Generates collection requests from published operating instructions.
- Applies company operating calendars before generating in-day work.
- Prioritizes recovery and close activity ahead of routine collection.
- Tracks files individually from runner capture through storage and ingestion.
- Preserves failed artifacts for investigation instead of deleting the evidence.
- Validates Daily Service Worksheets using the service date contained in cell `A1`, independent of file timestamps or storage paths.
- Distinguishes in-day reports from final historical records.
- Records progress, runtime, output, and recovery candidates with greater granularity.

This transformed automation from a collection of scheduled scripts into a governed request, execution, evidence, and recovery pipeline.

### Daily operational intelligence

I redesigned the Daily Operations Summary to make better use of the operational warehouse. It combines:

- Planned and completed stops and packages.
- Pickup execution and pickup package volume.
- Early and late pickup signals.
- Potential missed pickups.
- Service-code performance.
- ILS and RLS performance.
- Express completion posture.
- Tracking-link gaps.
- Dispatch actions.
- Actionable management follow-up.

The report can also be shared by email as a client-facing operating brief. Rather than presenting every raw event independently, operational events are rolled into readable blocks that communicate what happened without overwhelming the reader.

### An actionable watchlist

One of the most important additions was an operational watchlist that connects performance signals to management action.

When Insight detects a condition such as ILS below target, incomplete Express status, a tracking gap, or a potential missed pickup, it creates a durable investigation item. Each item provides:

- The source and service date.
- The affected route when applicable.
- Severity and current state.
- A targeted workflow for that specific signal.
- Ownership and due-date controls.
- Supporting package or tracking evidence.
- An action and resolution ledger.
- Separate internal and client-visible commentary.

The workflow is intentionally not an excuse generator. It is a due-diligence record: what was observed, what evidence was reviewed, what was learned, and what action was taken.

For Express activity, I separated three concepts that are easy to incorrectly combine:

1. A package linked to a completed stop.
2. A package linked to a stop not marked complete.
3. A package without a reliable stop-completion link.

The system does not automatically label the third condition as a service failure. It exposes the tracking number and asks the operator to investigate before reaching a conclusion.

### Fleet and inspection management

I created the foundation for a Fleet workspace covering:

- Vehicle inventory and FedEx vehicle classifications.
- Vehicle type and configuration.
- Wheels, tires, and operating-cost attributes.
- Driver and leadership-triggered inspections.
- Photo evidence.
- Maintenance exposure.
- Work orders and repair history.
- Mechanic and fleet-manager workflows.

The driver inspection experience is designed as an operational intent pathway, consistent with actions such as clocking in or requesting time off. A driver can scan or select a vehicle, complete the inspection, and submit supporting evidence from a mobile device.

### Legal and customer activation governance

I also developed durable contract workflows for:

- Master Service Agreements.
- Statements of Work.
- Data Processing Addenda.
- Acceptable Use Policies.
- Customer review and acceptance.
- Version locking and document vaulting.

Legal signatures became an independent Go Live gate. This corrected an earlier activation model that could indicate readiness without all required agreements being issued, signed, and vaulted.

The Data Processing Addendum reflects a foundational product commitment: Insight does not sell or share customer data. Operational data is used to provide the service, retained only as operationally necessary, and reduced after its short operational relevance window.

## How we built it

Each capability was planned, implemented, reviewed, and refined through an AI-assisted engineering workflow.

I worked with Codex as an active engineering collaborator across:

- Product and workflow design.
- Database modeling and migrations.
- Row-level security.
- API contracts.
- React and Next.js interfaces.
- Operational terminology.
- Failure analysis.
- Production debugging.
- Testing and release preparation.
- Legal-document development.
- UX refinement.

The process was highly iterative. I supplied domain knowledge, operating constraints, screenshots, production behavior, and acceptance decisions. Codex inspected the repository, traced contracts across the application and database, implemented changes, and helped reason through failures.

This was not a single-prompt generation exercise. It was a sustained collaboration across a living production system.

## Challenges we ran into

### Aligning language across the system

The most difficult failures were rarely isolated syntax errors. They occurred when one part of the system used a term differently from another.

A collection ticket, runner goal, date-selection contract, ingestion worker, database status, and client-facing report all needed to describe the same operational event consistently. A small mismatch could cause the runner to collect the wrong date, classify a file incorrectly, or report success without producing a usable artifact.

I learned that shared language is infrastructure.

### Separating missing evidence from negative evidence

An absent completion link does not automatically prove an undelivered package. A missing artifact does not prove that the runner never attempted the work. A completed automation request does not prove that ingestion succeeded.

We strengthened the system by separating:

- Collection success from ingestion success.
- Open operational status from tracking gaps.
- Provisional assumptions from verified outcomes.
- Source-system facts from management conclusions.

That distinction now shapes both the database contracts and the user experience.

### Debugging across system boundaries

The complete workflow spans a Next.js application, Supabase, scheduled requests, a VPS runner, browser automation, storage, ingestion workers, and operational reporting. Failures could occur at any handoff.

Codex helped trace those boundaries, but production debugging still required careful observation of logs, payloads, storage behavior, database state, and the actual source files. The most valuable improvements came from making those handoffs observable and preserving evidence when something failed.

### Designing for trust

Operational software cannot merely look correct. It has to communicate what is known, what is inferred, and what still requires human verification.

Several labels that initially sounded useful—such as “verifiably open”—proved too strong for the underlying evidence. We replaced them with more precise language and exposed the tracking identifiers needed to investigate.

That precision is essential when a report may be used in a real conversation with client or terminal leadership.

## Accomplishments that we're proud of

The accomplishment I am most proud of is that Insight now connects evidence, interpretation, and action without pretending they are the same thing.

During Build Week, we moved several major operating surfaces from promising foundations into connected, governed workflows:

- Automation requests now carry explicit intent from the workbench through runner execution, storage, ingestion, validation, and recovery.
- Daily operational reports combine source facts, time-critical signals, dispatch activity, and documented management response.
- Express packages with incomplete status are separated from packages with tracking-link gaps, preventing missing evidence from being presented as a confirmed service failure.
- The Actionable Watchlist gives each signal a targeted investigation workflow, supporting identifiers, ownership, commentary, and a durable resolution trail.
- Fleet inspections connect drivers, leadership, fleet managers, mechanics, evidence capture, maintenance exposure, and future compliance reporting.
- Legal documents are versioned, released, accepted, and vaulted, with required signatures enforced as an independent Go Live gate.
- Customer data protections are expressed not only in policy, but in the product architecture and operating model.

We also deployed and repaired these capabilities inside a living production system. The work was not isolated in a prototype. It had to coexist with real users, existing data, active automation, and established operational behavior.

The result is a platform that is more truthful about what it knows, more useful when something needs attention, and more accountable about what happens next.

## What we learned

The biggest lesson was that AI amplifies domain expertise.

Codex could move quickly through a large codebase, connect related systems, generate implementation options, and help repair regressions. But the quality of the result depended on the operational principles I supplied: how a delivery business actually works, which source is authoritative, what constitutes a service failure, what evidence must be retained, and how an operator should be guided through a decision.

I also learned that successful AI-assisted development requires more than generating code. It requires:

- Clear operating contracts.
- Durable terminology.
- Observable handoffs.
- Evidence-preserving failure behavior.
- Human acceptance testing.
- Willingness to revise an attractive interface when its language overstates the truth.

The most productive pattern was a continuous loop:

1. Define the operational intent.
2. Inspect the existing system.
3. Implement the smallest complete contract.
4. Test it against real behavior.
5. Correct the language and workflow.
6. Preserve what was learned in the system itself.

Insight gives operational leaders something they rarely receive from traditional reporting systems: a coherent account of the day and a structured way to respond.

It does not replace the operator. It equips the operator.

The platform brings together automation, operational evidence, workforce context, fleet readiness, compliance, legal governance, and management action without treating customer data as a product to be sold or exploited.

Build Week demonstrated that an individual builder with deep domain knowledge and an AI engineering collaborator can meaningfully evolve a sophisticated production SaaS in a remarkably short period of time.

The result is more than a collection of new features. It is a stronger operating system for turning fragmented field activity into accountable, useful intelligence.

## What's next for Insight: AI Operations Engine

The next phase is to extend the same evidence-to-action model across the rest of the operating day.

Near-term priorities include:

- Completing the delivery-actions ledger as the operational cousin to the dispatch action log.
- Bringing dispatch and delivery events into Daily Operations reporting as concise, client-readable rollups.
- Expanding Fleet with vehicle provisioning, QR identification, inspection deployment, maintenance workflows, and mechanic-facing scope-of-work records.
- Producing governed monthly fleet, inspection, maintenance, and compliance reports.
- Adding configurable client vocabularies and action types without weakening the underlying API contracts.
- Measuring automation and ingestion cost by request type, artifact family, route, and processing stage.
- Improving recovery automation so failed work can be identified, prioritized, and safely replayed with its evidence intact.
- Introducing carefully bounded intelligence suggestions that help operators investigate and plan without replacing their judgment.

Longer term, Insight will become a configurable operations toolkit for organizations that need the capabilities of a sophisticated internal platform without building one from scratch.

The product will continue to follow the principle established during Build Week: use AI to strengthen operational awareness, preserve human accountability, and turn fragmented evidence into practical action.
