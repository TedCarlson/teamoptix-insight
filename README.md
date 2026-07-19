# Insight: AI Operations Engine

Insight is a production-oriented operations platform for contractor-operated field organizations. It turns governed source artifacts and daily operating evidence into dispatch signals, service reporting, compliance workflows, fleet records, and accountable follow-up.

The public application is available at [teamoptix.io](https://teamoptix.io/). Access to customer workspaces and operational data is restricted.

## OpenAI Build Week project

This repository documents the development of **Insight: AI Operations Engine** for OpenAI Build Week. The project focused on extending an existing application into a more cohesive operating system connecting:

- governed collection and ingestion;
- dispatch and route-level operational intelligence;
- client-facing daily operations reporting;
- evidence-backed, actionable watchlists;
- fleet inventory, inspections, maintenance, and photographic evidence;
- contract, legal-signature, and Go Live governance.

## How Codex and GPT-5.6 were used

Insight was built through continuous AI collaboration. GPT-5.6 and Codex were used throughout the development loop, while product direction, operational definitions, acceptance decisions, and production responsibility remained human-controlled.

The collaboration included:

1. **Translating domain knowledge into software contracts.** Operational experience was articulated conversationally, then refined with GPT-5.6 into bounded workflows, data contracts, interface requirements, and acceptance criteria.
2. **Repository implementation with Codex.** Codex inspected the existing codebase, implemented features across Next.js, TypeScript, Supabase, PostgreSQL, APIs, and migrations, and preserved established repository conventions.
3. **Schema and ingestion design.** We collaborated on idempotent storage, row-level security, ingestion priority, recovery telemetry, retention behavior, and distinctions between missing evidence, tracking gaps, and confirmed negative outcomes.
4. **Debugging across system boundaries.** Runtime errors, failed automation tickets, runner handoffs, database views, production migrations, and UI regressions were investigated through repeated evidence-driven exchanges.
5. **Verification and review.** Changes were checked with linting, TypeScript validation, migration output, runtime evidence, and human visual acceptance. AI suggestions were treated as proposals until verified.
6. **Product communication.** GPT-5.6 helped turn the implementation history into clear documentation and a Build Week project story without exposing customer data, credentials, private prompts, or sensitive infrastructure.

This was not a one-prompt generation exercise. The system emerged through substantial iteration: explaining intent, challenging assumptions, correcting failures, refining language, and converting lived operational knowledge into working software.

## Human and AI responsibilities

**Human-led:**

- product vision and priorities;
- operational definitions and source-of-truth decisions;
- privacy, retention, and governance policy;
- visual acceptance and production authorization;
- evaluation of whether system outputs reflect operational truth.

**AI-assisted:**

- codebase inspection and implementation planning;
- code and migration authoring;
- debugging and contract reconciliation;
- test and verification support;
- technical and product documentation.

## Technology

- Next.js, React, and TypeScript
- Supabase and PostgreSQL
- Vercel
- Node.js automation workers
- Docker, Python, Selenium, Laravel, and PHP runner services
- OpenAI GPT-5.6 and Codex

## Repository structure

- `apps/web` — primary web application
- `apps/automation-worker` — governed ingestion and automation worker
- `packages/ui` — shared UI components
- `packages/config` — shared configuration
- `packages/types` — shared types
- `supabase/migrations` — database contracts and governed schema evolution
- `docs` — product, architecture, decision records, and Build Week material

## Data responsibility

Insight is designed to support client operations, not monetize client data. Customer data is not sold or shared for advertising. Operational access is restricted, and implementation details that could expose customer records, credentials, proprietary automation, or security controls are intentionally omitted from this README.
