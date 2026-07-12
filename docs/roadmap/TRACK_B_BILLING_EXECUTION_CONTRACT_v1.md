# Track B — Billing Execution Contract

**Project:** Team Optix / Insight  
**Track:** B — Billing  
**Contract version:** 1.0  
**Frozen:** July 12, 2026  
**Repository baseline:** `main` at commit `095bf0f` — `v2.7.11.08 > Establish persistent analytics data workspace`  
**Companion repo snapshot:** `teamoptix-insight-repo-20260712-074028.zip`  
**Snapshot SHA-256:** `80ce66b77ff2a6801cdda20e139bc7dcd0b215d50aa6336c734bd70f9f345216`

---

## 1. Purpose of this document

This document is the durable execution authority for Track B.

It records:

- the inspected repository baseline;
- what already exists;
- the decisions already made;
- the complete Track B implementation sequence;
- the acceptance criteria for each sprint;
- the boundaries between Commercial, Billing, Operations, Core, and Stripe;
- the rules for tracking progress without redefining the plan.

Future conversations must inspect the current repository against this contract and update progress. They must not silently replace, broaden, reorganize, or “improve” the plan.

A genuine architecture conflict or newly discovered requirement may produce an amendment. It does not rewrite this contract. Amendments must be explicit, dated, justified by repository evidence or a business decision, and appended to the change log.

---

## 2. Track B mission

Track B owns the complete financial lifecycle after Team Optix has determined what a customer should pay.

```text
Company
  ↓
Billing Customer
  ↓
Subscription
  ↓
Weekly Invoice
  ↓
Payment
  ↓
Receipt
  ↓
Billing History
  ↓
Accounting / Reconciliation
```

Track B is not merely a Stripe integration.

Its launch milestone is:

> Team Optix takes an implemented customer through Go Live, creates the correct weekly subscription, successfully processes the first recurring billing cycle, records the financial history in Insight, and can inspect the result from the internal Billing workspace.

---

## 3. Governing architecture

### 3.1 The operating principle

> **Insight owns the business. Stripe owns the money movement.**

Insight is the source of truth for:

- customer identity;
- commercial terms;
- operator tier;
- implementation readiness;
- customer lifecycle;
- Go Live authorization;
- billing intent;
- subscription history;
- invoice history;
- payment history;
- billing exceptions;
- operational enablement;
- audit history.

Stripe is the source of truth for:

- payment-provider customer objects;
- payment methods;
- Checkout execution;
- subscription execution;
- invoice execution;
- charges and payment intents;
- provider-side payment outcomes;
- refunds executed through Stripe.

Stripe events report provider facts back to Insight. Stripe does not decide when a customer is ready, Go Live, operationally active, suspended, or commercially cancelled.

### 3.2 System authority by concern

| Concern | Authoritative system/domain |
|---|---|
| Commercial terms and pricing | Commercial |
| Customer lifecycle and readiness | Commercial / Team Optix governance |
| Go Live authorization | Team Optix customer workspace |
| Billing records and financial history | Billing |
| Payment execution | Stripe |
| Automation schedules and collection | Operations |
| Intelligence availability | Operations / company access |
| Authentication and workspace membership | Core |

### 3.3 Go Live is an orchestrator

Go Live coordinates multiple domains. It does not absorb their data models.

It must:

1. validate readiness;
2. record the Team Optix decision and actor;
3. calculate the first weekly billing date;
4. create or resume the Stripe subscription;
5. persist the Insight subscription record;
6. enable the required operational services;
7. expose the result and any failed step to Team Optix;
8. remain safe to retry.

Go Live must not be implemented as an unobservable collection of unrelated UI actions.

---

## 4. Inspected repository baseline

The July 12, 2026 snapshot confirms Track B is partially implemented and is not a greenfield build.

### 4.1 Existing billing schema

Present in the repository:

- `billing.customer`
- `billing.subscription`
- `billing.payment`
- `billing.customer_subscription_v`
- updated-at triggers
- Stripe provider identifiers
- billing and subscription status fields
- payment idempotency indexes for Checkout Session, Payment Intent, and Stripe Event

The payment schema already anticipates:

- implementation payments;
- subscription payments;
- failed payments;
- refunds;
- partial refunds.

### 4.2 Existing commercial pricing foundation

Present:

- `commercial.profile`
- `commercial.operator_tier`
- implementation fee
- weekly subscription amount
- billing contact information
- Stripe implementation and recurring price mappings

Current pricing baseline:

| Tier | Routes | Implementation | Weekly |
|---|---:|---:|---:|
| Operator 1 | 1–10 | $118 | $59 |
| Operator 2 | 11–15 | $198 | $99 |
| Operator 3 | 16–25 | $398 | $199 |
| Operator 4 | 26–50 | $698 | $349 |
| Operator 5 | 51+ | Custom | Custom |

### 4.3 Existing Stripe customer creation

Present route:

```text
POST /api/company/[slug]/billing/customer
```

Existing behavior:

- authenticated access check;
- company access resolution;
- platform-owner or active-company-admin authorization;
- commercial-profile validation;
- idempotent Stripe customer creation;
- persistence into `billing.customer`;
- commercial transition to `stripe_customer_created`.

### 4.4 Existing implementation Checkout

Present route:

```text
POST /api/company/[slug]/billing/checkout
```

Existing behavior:

- validates billing access;
- requires saved operator tier;
- requires `stripe_customer_created`;
- resolves the tier’s Stripe implementation price;
- creates a one-time hosted Checkout Session;
- associates the session with the Insight company through metadata;
- returns the hosted Checkout URL;
- correctly uses `mode: "payment"` rather than creating the recurring subscription.

### 4.5 Existing Stripe webhook handling

Present route:

```text
POST /api/billing/stripe/webhook
```

Current handled event:

```text
checkout.session.completed
```

Existing behavior:

- verifies Insight-origin metadata;
- resolves the company;
- requires a paid Checkout Session;
- writes a permanent `billing.payment` record;
- safely handles duplicate webhook delivery;
- advances Commercial from `stripe_customer_created` to `implementation_paid`.

### 4.6 Existing company billing surface

Present route:

```text
/company/[slug]/billing
```

Existing capabilities:

- commercial billing profile;
- operator-tier assignment;
- implementation and weekly pricing;
- billing-contact management;
- commercial status;
- Stripe customer creation;
- implementation Checkout launch;
- implementation and Go Live explanation.

### 4.7 Existing Team Optix billing surface

Present route:

```text
/teamoptix/business/finance/billing
```

Existing capabilities:

- Stripe connection state;
- sandbox-mode display;
- webhook-secret state;
- provider counts for customers, products, prices, subscriptions, and invoices;
- Stripe catalog details.

Current limitation:

The page is primarily a Stripe diagnostic surface. It is not yet the Insight-owned billing command center.

### 4.8 Existing Team Optix customer authority surface

Present route:

```text
/teamoptix/customers/[slug]
```

It already owns:

- customer contract governance;
- terminal and operating scope;
- platform-managed automation;
- customer credential posture.

This is the authoritative home for implementation readiness and Go Live execution.

---

## 5. Confirmed gaps at baseline

### 5.1 Lifecycle fragmentation

Three state models currently exist:

1. `core.companies.company_status`
2. `commercial.profile.commercial_status`
3. Billing customer and subscription provider statuses

`core.companies.company_status` is currently used as a workspace/access condition and companies are created as `active`. It must not be repurposed during this track without a separate migration plan because doing so could disrupt membership, profile setup, and workspace access.

Commercial status currently includes:

```text
draft
profile_complete
ready_for_stripe
stripe_customer_created
implementation_paid
subscription_active
suspended
cancelled
```

It does not yet represent implementation readiness, Go Live authorization, or activation execution distinctly.

### 5.2 No Go Live authority

Absent at baseline:

- Go Live route;
- Go Live service;
- readiness contract;
- Go Live timestamp;
- Go Live actor;
- activation audit record;
- resumable activation steps;
- centralized operational enablement.

### 5.3 No recurring subscription creation

There is no current call to:

```ts
stripe.subscriptions.create(...)
```

The recurring Stripe price is stored and displayed but not used operationally.

### 5.4 No first-Friday calculation

The product promise is:

> Recurring subscription billing begins on the first Friday following Go Live.

No current code calculates or persists this date.

The frozen interpretation for implementation is:

```text
Go Live Monday–Thursday → the upcoming Friday
Go Live Friday–Sunday → the following Friday
```

The date must be resolved in `America/New_York`, then converted to the appropriate Stripe timestamp.

### 5.5 No Insight-owned invoice ledger

Stripe invoice counts are visible, but Insight does not yet retain a complete invoice and line-item history.

### 5.6 No recurring webhook lifecycle

The webhook does not yet process subscription, recurring invoice, failed-payment, cancellation, or refund events.

### 5.7 Automation is not gated by Go Live

The automation scheduler currently enumerates companies without a canonical Go Live check. Schedule-level `is_enabled` is the main guard.

The historical sweep can also operate independently of normal schedule filtering.

A configured but not commercially live company may therefore become eligible for collection activity.

### 5.8 No dedicated Intelligence entitlement

There is no explicit `intelligence_enabled` or feature-entitlement model. MVP Go Live will rely on lifecycle/access posture plus explicit automation activation rather than introducing a generic entitlement engine.

### 5.9 Subscription history fields are incomplete

The current subscription model needs historical snapshots sufficient to explain what was sold and activated at the time, independent of later catalog changes.

### 5.10 Billing RLS and authorization need hardening

Billing records are primarily written server-side. Before customer billing history is exposed, explicit read authorization and RLS posture must be implemented and verified.

---

## 6. Frozen design decisions

These decisions are fixed for Track B version 1 unless amended in the change log.

### Decision 1 — Preserve `core.companies.company_status`

Do not overload the existing company status as the full commercial lifecycle during Track B.

Treat it as workspace/access posture until a dedicated lifecycle migration is separately approved.

### Decision 2 — Team Optix governs Go Live

The Go Live action lives in:

```text
/teamoptix/customers/[slug]
```

It is not initiated from the customer company Billing page.

Only the platform owner or a future explicitly authorized Team Optix role may execute it.

### Decision 3 — Readiness and provider state remain separate

Customer readiness and business lifecycle must not be represented by Stripe subscription status.

Billing provider state remains in Billing.

### Decision 4 — Go Live is resumable

Go Live must execute through discrete, auditable steps with statuses such as:

```text
pending
running
complete
failed
skipped
```

A failed external step must be visible and retryable. It must not leave the overall state ambiguous.

### Decision 5 — Insight retains historical commercial snapshots

A subscription record must retain at minimum:

- internal tier/catalog key;
- provider price id;
- weekly amount;
- currency;
- billing interval;
- Go Live date;
- billing start date;
- activation timestamp and actor.

Later tier or price changes must not erase the original agreement history.

### Decision 6 — Internal and provider price identities are distinct

```text
price_key = Insight-owned internal pricing identity
provider_price_id = Stripe price identifier
```

The two may not be conflated.

### Decision 7 — The internal Billing workspace becomes Insight-first

The durable command center reads Insight-owned billing records first and shows Stripe as provider/reconciliation detail.

It must not remain solely a live Stripe catalog dashboard.

### Decision 8 — No generic workflow engine in Track B

The activation design may establish a reusable pattern, but this track will implement only the specific activation orchestration required for Go Live, billing, suspension, cancellation, and reactivation.

### Decision 9 — Production Stripe cutover is a separate launch sprint

Track B is developed and tested in Stripe sandbox until Team Optix is ready for the first production customer.

Production keys, live webhook registration, Vercel environment variables, tax activation, and the first live charge remain part of the production launch checklist.

---

## 7. Target data contract

The exact table and column names may be surgically adapted to the inspected schema, but the responsibilities and recorded facts below are mandatory.

### 7.1 Customer activation record

Create one durable activation/lifecycle record per company, preferably in Commercial because it governs customer readiness rather than provider execution.

Recommended conceptual object:

```text
commercial.company_activation
```

Required identity and lifecycle facts:

```text
company_id
lifecycle_status
implementation_started_at
implementation_completed_at
ready_for_go_live_at
go_live_requested_at
go_live_at
paused_at
cancelled_at
reactivated_at
archived_at
created_at
updated_at
```

Required actor and governance facts:

```text
implementation_completed_by
ready_for_go_live_by
go_live_requested_by
go_live_by
paused_by
cancelled_by
reactivated_by
last_transition
last_transition_at
last_transition_by
```

Required billing coordination facts:

```text
implementation_payment_received_at
first_billing_date
subscription_activation_status
subscription_activated_at
```

This record is not a replacement for `billing.subscription`.

### 7.2 Readiness contract

Go Live eligibility must be inspectable and explainable.

Required readiness domains:

```text
commercial_ready
implementation_payment_ready
contract_ready
workspace_ready
credentials_ready
automation_ready
training_ready
customer_approval_ready
```

Each readiness item must have:

```text
status
source or basis
completed_at
completed_by where applicable
blocking_reason where incomplete
```

Some items may be computed; others may be explicitly acknowledged. The UI must show the distinction.

The Go Live action is unavailable until all launch-blocking readiness items are satisfied.

### 7.3 Activation run

Each Go Live attempt must produce an activation run.

Recommended conceptual object:

```text
commercial.company_activation_run
```

Required fields:

```text
id
company_id
run_type            -- go_live, resume, reactivation
status              -- pending, running, complete, partial, failed
requested_at
requested_by
started_at
completed_at
failure_summary
idempotency_key
created_at
updated_at
```

### 7.4 Activation steps

Recommended conceptual object:

```text
commercial.company_activation_step
```

Required fields:

```text
activation_run_id
step_key
step_order
status              -- pending, running, complete, failed, skipped
attempt_count
started_at
completed_at
last_error
result_metadata
created_at
updated_at
```

Required initial Go Live steps:

```text
validate_readiness
record_go_live_decision
calculate_first_billing_date
create_stripe_subscription
persist_billing_subscription
enable_automation
confirm_intelligence_access
enable_notifications
finalize_activation
```

A step may be implemented as a no-op confirmation if the underlying subsystem does not yet require a dedicated switch. It must still report what was verified.

### 7.5 Billing subscription expansion

Extend or replace the current subscription record only as necessary to persist:

```text
company_id
billing_customer_id
internal_price_key
operator_tier_key
provider
provider_subscription_id
provider_price_id
weekly_amount
currency
billing_interval
subscription_status
go_live_date
billing_start_date
current_period_start
current_period_end
activated_at
activated_by
cancel_at_period_end
cancelled_at
ended_at
cancellation_reason
created_at
updated_at
```

Provider subscription status must remain distinct from customer lifecycle status.

### 7.6 Invoice ledger

Add an Insight-owned invoice record.

Required conceptual fields:

```text
company_id
billing_customer_id
subscription_id
provider
provider_invoice_id
invoice_number
invoice_type          -- implementation, subscription, adjustment, credit
status
currency
subtotal
tax_amount
discount_amount
credit_amount
total_amount
amount_due
amount_paid
amount_remaining
service_period_start
service_period_end
invoice_date
due_date
paid_at
voided_at
hosted_invoice_url
invoice_pdf_url
provider_created_at
created_at
updated_at
```

### 7.7 Invoice line items

Required conceptual fields:

```text
invoice_id
provider_line_item_id
line_type
description
quantity
unit_amount
line_amount
internal_price_key
provider_price_id
service_period_start
service_period_end
metadata
```

### 7.8 Payment ledger expansion

Preserve the existing `billing.payment` model and expand only where required for recurring billing and reconciliation.

The ledger must support:

```text
implementation
subscription
manual adjustment
refund
partial refund
failed payment
recovered payment
```

Each Stripe event must be idempotently attributable to the provider object that generated it.

### 7.9 Billing event/audit history

All meaningful billing transitions must be reconstructable, including:

- subscription created;
- subscription updated;
- invoice finalized;
- invoice paid;
- invoice payment failed;
- payment recovered;
- subscription paused or cancelled;
- refund issued;
- credit applied;
- manual reconciliation.

This may be implemented as a dedicated billing-event table or a consistent immutable audit/event pattern already used in the repository.

---

## 8. End-to-end Track B sprint plan

The sequence below is the execution order. A sprint may reveal surgical prerequisites, but work should not skip ahead in a way that bypasses its acceptance criteria.

## Sprint B0 — Baseline and contract lock

**Purpose:** Establish the durable plan and repository evidence.

### Work

- Preserve this document in the repository under a stable docs path.
- Record the companion snapshot and commit.
- Confirm the existing billing and commercial migrations against the live schema before modifying them.
- Create a Track B progress ledger using the sprint checklist in Section 10.

### Acceptance

- This contract is committed to `main`.
- The repository baseline is reproducible.
- No Track B implementation proceeds from conversational memory alone.

---

## Sprint B1 — Lifecycle and readiness foundation

**Purpose:** Establish the business authority required before recurring billing can begin.

### Work

- Add the customer activation/lifecycle record.
- Add readiness representation and blocking reasons.
- Add activation run and activation step records.
- Add explicit transition rules.
- Add platform-owner authorization for Team Optix activation actions.
- Preserve `core.companies.company_status` behavior.
- Backfill existing companies safely without marking them newly Go Live.

### Required transitions

Minimum business lifecycle:

```text
implementation
ready_for_go_live
activation_in_progress
active
activation_failed
paused
cancelled
```

Historical commercial setup states may remain in `commercial.profile.commercial_status`; the new lifecycle must integrate with them rather than ambiguously duplicate them.

### Acceptance

- Every company has an inspectable lifecycle record.
- Readiness is visible as explicit facts, not one unexplained boolean.
- Unauthorized company administrators cannot execute Go Live.
- The same lifecycle transition cannot be applied twice accidentally.
- Existing workspaces and memberships continue to function.

---

## Sprint B2 — Team Optix readiness and Go Live surface

**Purpose:** Give Team Optix one authoritative operating surface for customer activation.

### Location

```text
/teamoptix/customers/[slug]
```

### Work

- Add implementation/lifecycle summary.
- Add readiness checklist with source, status, actor, date, and blocking reason.
- Add first billing date preview.
- Add Go Live action.
- Add confirmation treatment for the consequential action.
- Add activation progress and failed-step visibility.
- Add Resume Activation action when applicable.
- Keep customer billing setup on `/company/[slug]/billing`; do not duplicate it.

### Acceptance

- Team Optix can determine exactly why a customer is or is not ready.
- Go Live is unavailable while a required readiness item is incomplete.
- Executing Go Live creates a durable activation run.
- Refreshing or revisiting the page shows the true persisted state.
- A failed step is visible with a useful error and can be resumed safely.

---

## Sprint B3 — First-Friday billing calendar

**Purpose:** Make the billing start promise deterministic and auditable.

### Work

- Implement a shared New York date function.
- Apply the frozen Monday–Thursday / Friday–Sunday rule.
- Persist the calculated first billing date before provider creation.
- Convert the date to a Stripe-compatible billing anchor safely across daylight-saving changes.
- Add tests around Thursday, Friday, Sunday, year-end, and DST boundaries.
- Display the result in Team Optix readiness and activation history.

### Acceptance

- The same Go Live timestamp always produces the same first billing date.
- The date is calculated using `America/New_York`.
- Test cases prove no accidental same-day Friday charge.
- The persisted date is the authority used for Stripe subscription creation.

---

## Sprint B4 — Stripe subscription activation

**Purpose:** Create the customer’s weekly recurring subscription from the approved Go Live action.

### Work

- Resolve the Insight billing customer.
- Resolve the internal operator tier and provider recurring price.
- Validate the implementation payment and commercial terms.
- Create the Stripe subscription with an idempotency key.
- Use the persisted first billing date as the billing anchor.
- Define proration behavior explicitly; MVP should not create an unintended partial-period charge.
- Persist the Insight subscription snapshot.
- Store provider customer, subscription, and price identifiers.
- Mark the activation step complete only after provider and Insight records reconcile.
- Handle partial failure where Stripe succeeds but the Insight write fails.

### Acceptance

- One approved Go Live action creates no more than one active Stripe subscription.
- Repeated requests are idempotent.
- No charge occurs before the promised first Friday.
- Insight retains the tier and amount that were active at creation.
- A Stripe-success/database-failure scenario can be reconciled without creating a duplicate subscription.

---

## Sprint B5 — Operational activation gating

**Purpose:** Ensure only live customers receive platform-managed automation and related services.

### Work

- Add a canonical lifecycle/Go Live guard to normal automation scheduling.
- Add the same guard to the daily historical sweep.
- Determine how existing enabled schedule rows behave before Go Live.
- Enable intended schedules as an activation step rather than relying on implicit company creation.
- Confirm Intelligence access behavior.
- Implement notification activation only where a current subsystem exists; otherwise record a verified no-op and defer dedicated notifications.
- Add visible service posture to the Team Optix customer page.

### Acceptance

- A company that is not Go Live cannot receive automated collection through either scheduling path.
- A Go Live company can receive only the schedules explicitly enabled for it.
- Paused or cancelled lifecycle states prevent future automated requests.
- Existing manual upload capability remains available according to its existing access rules.
- The activation page shows the operational services enabled by Go Live.

---

## Sprint B6 — Subscription webhook synchronization

**Purpose:** Keep Insight synchronized with provider subscription facts.

### Initial Stripe events

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

### Work

- Add event routing with idempotency.
- Resolve company and subscription using provider ids and trusted metadata.
- Synchronize provider status, current period, and cancellation posture.
- Record immutable billing events.
- Prevent provider events from silently overwriting Team Optix lifecycle decisions.
- Surface mismatches for reconciliation.

### Acceptance

- Subscription state changes in Stripe are reflected in Insight.
- Duplicate events do not duplicate history or corrupt state.
- Out-of-order events are handled safely.
- Stripe cancellation does not erase the customer lifecycle history.
- Unmatched events are retained or surfaced for investigation rather than discarded silently.

---

## Sprint B7 — Insight invoice ledger

**Purpose:** Make Insight the durable financial-history surface.

### Initial Stripe events

```text
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
```

### Work

- Add invoice and invoice-line schema.
- Ingest provider invoice facts idempotently.
- Classify implementation, subscription, adjustment, and credit invoices.
- Persist invoice URLs and PDFs as provider references, not copied secret content.
- Preserve service periods and pricing references.
- Connect invoices to the correct subscription and company.

### Acceptance

- Every recurring invoice has one canonical Insight record.
- Line items explain what the customer was charged for.
- Invoice state can be reconstructed without querying Stripe live.
- Duplicate webhook delivery is harmless.
- Invoice history remains correct after pricing-tier changes.

---

## Sprint B8 — Recurring payment and receipt history

**Purpose:** Complete the weekly invoice-to-payment lifecycle.

### Work

- Extend payment ingestion for subscription invoices.
- Link payments to invoices and provider payment intents/charges.
- Record successful, failed, refunded, and partially refunded outcomes.
- Add receipt/provider-reference presentation.
- Reconcile the existing implementation payment into the same history model.
- Add customer-visible billing history only after RLS and authorization are complete.

### Acceptance

- A paid weekly invoice produces a durable payment record.
- Payment history clearly distinguishes implementation and recurring payments.
- Payment, invoice, and subscription relationships are inspectable.
- Refunds do not mutate or erase the original payment.
- Customer users see only their authorized company records.

---

## Sprint B9 — Internal Billing command center

**Purpose:** Convert the current Stripe diagnostic page into Team Optix’s financial operating surface.

### Location

```text
/teamoptix/business/finance/billing
```

### Work

- Make Insight records the primary data source.
- Show customer, lifecycle, tier, weekly amount, subscription status, next billing date, last invoice, last payment, and balance posture.
- Add customer drill-down for subscription, invoices, payments, and activation history.
- Retain Stripe connection/catalog diagnostics as a separate provider-health section.
- Add mismatch and reconciliation indicators.
- Add filters for active, activation failed, past due, suspended, cancelled, and provider mismatch.

### Acceptance

- Team Optix can operate billing without opening Stripe for routine inspection.
- The surface remains useful if Stripe live-list APIs are temporarily unavailable.
- Provider diagnostics are clearly separated from Insight business state.
- Every displayed status has an identifiable source and timestamp.

---

## Sprint B10 — Failed payment and recovery lifecycle

**Purpose:** Make payment failures visible and operationally manageable.

### Work

- Define `past_due`, `unpaid`, and recovered-payment mappings.
- Ingest failed-payment facts.
- Record retry attempts and Stripe’s next-action posture.
- Surface failure and recovery in Team Optix Billing.
- Define the MVP grace policy before service suspension.
- Keep billing failure separate from immediate customer cancellation.
- Add manual Team Optix acknowledgement or escalation where needed.

### Acceptance

- A failed weekly payment is visible in Insight.
- A later successful retry closes the exception without erasing it.
- The customer lifecycle does not automatically become cancelled.
- Service suspension occurs only according to an explicit policy and auditable action.
- Team Optix can distinguish temporary failure, unresolved past due, and cancelled service.

---

## Sprint B11 — Pause, cancellation, and reactivation

**Purpose:** Support the customer lifecycle after initial activation.

### Work

- Add Team Optix-governed pause, cancellation, and reactivation actions.
- Record effective dates, actor, and reason.
- Coordinate Stripe subscription behavior.
- Coordinate automation gating.
- Preserve all historical subscription, invoice, and payment records.
- Define cancel-at-period-end versus immediate cancellation.
- Reuse the activation-run pattern for reactivation.

### Acceptance

- Pause/cancel/reactivate actions are idempotent and audited.
- Cancellation does not delete billing history.
- Automation follows the lifecycle decision.
- Reactivation cannot create duplicate subscriptions.
- The UI clearly distinguishes business cancellation from provider status.

---

## Sprint B12 — Credits, discounts, founding pricing, and adjustments

**Purpose:** Support controlled exceptions without corrupting the pricing model.

### Work

- Add internal adjustment and reason records.
- Support credits and discounts with effective dates.
- Preserve founding-customer pricing as an explicit commercial agreement, not a hidden Stripe override.
- Add refund and partial-refund workflows.
- Add approval/audit requirements for manual financial changes.
- Ensure invoice and payment history retain gross, discount, credit, tax, and net amounts.

### Acceptance

- Every nonstandard charge has a reason, actor, and effective period.
- Stripe execution matches the Insight-approved adjustment.
- Historical invoices remain unchanged after future commercial updates.
- Founding pricing is visible and explainable.
- Manual adjustments cannot be made anonymously or by unauthorized company users.

---

## Sprint B13 — Security, RLS, reconciliation, and audit hardening

**Purpose:** Make the billing system safe for production use.

### Work

- Enable and verify RLS for all customer-visible billing tables.
- Add explicit platform-owner and company read policies.
- Keep provider writes server-only.
- Consolidate shared billing authorization helpers.
- Add reconciliation checks for Stripe/Insight customer, subscription, invoice, and payment mismatches.
- Add operational logging without exposing secrets or raw payment data.
- Verify webhook signature handling and secret rotation posture.
- Confirm no card data is stored in Insight.
- Add data-retention and audit expectations.

### Acceptance

- Cross-company billing access is impossible under tested roles.
- Customer admins cannot execute Team Optix lifecycle actions.
- Service-role usage is limited and justified.
- Reconciliation identifies partial failures and orphaned provider objects.
- Logs contain useful identifiers but no restricted payment credentials.

---

## Sprint B14 — Sandbox end-to-end certification

**Purpose:** Prove the complete Track B lifecycle before production cutover.

### Required sandbox scenario

```text
Commercial profile complete
  ↓
Stripe customer created
  ↓
Implementation Checkout paid
  ↓
Implementation completed
  ↓
Readiness complete
  ↓
Go Live executed by Team Optix
  ↓
First Friday calculated
  ↓
Weekly subscription created
  ↓
Automation enabled
  ↓
Invoice finalized
  ↓
Payment succeeds
  ↓
Invoice, payment, and receipt visible in Insight
```

### Required exception tests

- duplicate Go Live request;
- Stripe success followed by database failure;
- duplicate webhook delivery;
- out-of-order webhook delivery;
- failed recurring payment;
- successful Stripe retry;
- pause;
- cancellation;
- reactivation;
- unauthorized user attempts;
- company not Go Live but automation configured;
- DST and Friday boundary billing dates.

### Acceptance

- The full scenario passes using sandbox provider objects.
- All financial and lifecycle records are visible in Insight.
- Failed steps are resumable.
- No duplicate subscription, invoice, payment, or activation records are created.
- Lint, typecheck, migration review, and applicable tests pass.

---

## Sprint B15 — Production Stripe cutover and Customer #1

**Purpose:** Move the proven system into live financial operation.

### Work

- activate and verify the Stripe account;
- configure live products and prices;
- install live API keys in deployment environments;
- register the live webhook endpoint and secret;
- verify Vercel environment variables;
- finalize tax configuration;
- execute a production smoke test that does not create an unintended customer charge;
- provision the first real customer;
- process implementation payment;
- execute Go Live;
- verify the first live weekly invoice and payment;
- reconcile Insight and Stripe;
- record launch evidence.

### Acceptance

- The first production customer completes one successful weekly billing cycle.
- Insight and Stripe reconcile for customer, subscription, invoice, and payment.
- Team Optix can produce the receipt and billing history from Insight.
- Any production issue has an explicit owner, status, and recovery path.

---

## 9. Explicit non-goals and deferred work

The following are not required before the first successful recurring billing cycle unless a discovered launch blocker makes them necessary:

- a generic enterprise workflow engine;
- a full accounting general ledger;
- automated revenue recognition under every accounting standard;
- multi-currency billing;
- usage-based pricing;
- customer self-service plan changes;
- customer self-service cancellation;
- complex seat licensing;
- multiple simultaneous subscriptions per company;
- reseller billing;
- marketplace payouts;
- extensive tax-jurisdiction automation beyond the selected Stripe tax configuration;
- replacing Stripe’s hosted payment-method experience;
- storing card or bank-account details in Insight.

These items require separate approval and must not be inserted into Track B midstream as informal “improvements.”

---

## 10. Progress ledger

Use this exact checklist to track the track. Mark a sprint complete only when its acceptance criteria are met and the work is committed.

- [x] **B0 — Baseline and contract lock** — contract authored against snapshot; repository commit still required
- [ ] **B1 — Lifecycle and readiness foundation**
- [ ] **B2 — Team Optix readiness and Go Live surface**
- [ ] **B3 — First-Friday billing calendar**
- [ ] **B4 — Stripe subscription activation**
- [ ] **B5 — Operational activation gating**
- [ ] **B6 — Subscription webhook synchronization**
- [ ] **B7 — Insight invoice ledger**
- [ ] **B8 — Recurring payment and receipt history**
- [ ] **B9 — Internal Billing command center**
- [ ] **B10 — Failed payment and recovery lifecycle**
- [ ] **B11 — Pause, cancellation, and reactivation**
- [ ] **B12 — Credits, discounts, founding pricing, and adjustments**
- [ ] **B13 — Security, RLS, reconciliation, and audit hardening**
- [ ] **B14 — Sandbox end-to-end certification**
- [ ] **B15 — Production Stripe cutover and Customer #1**

### Existing foundation carried into Track B

- [x] `billing.customer`
- [x] `billing.subscription` scaffold
- [x] `billing.payment`
- [x] commercial operator tiers
- [x] weekly and implementation pricing
- [x] Stripe price mappings
- [x] Stripe customer creation
- [x] implementation Checkout
- [x] implementation payment webhook
- [x] implementation payment persistence
- [x] duplicate implementation-event protection
- [x] company billing setup surface
- [x] initial Team Optix Stripe diagnostic surface

---

## 11. Engineering execution rules

Track B follows the established Team Optix engineering workflow.

1. Inspect first; never guess.
2. Compare the current repository against this contract.
3. Identify the next incomplete sprint and its smallest measurable slice.
4. Inspect all affected schema, routes, helpers, UI, authorization, and automation paths before editing.
5. Make one surgical change at a time.
6. Review the result after each change.
7. Preserve existing architecture where possible.
8. Use thin orchestrators and explicit domain ownership.
9. Run applicable lint, typecheck, tests, and migration verification.
10. Commit with a versioned message and push `main`.
11. Update the progress ledger only after acceptance is demonstrated.
12. Record deviations as amendments; do not rewrite completed decisions silently.

---

## 12. Resume protocol for a new conversation

At the start of any future Track B conversation, provide:

1. this document;
2. the newest repo snapshot or repository inspection;
3. the latest commit hash;
4. the most recently completed Track B sprint or slice.

The model must then:

1. read this contract;
2. inspect the current repo;
3. compare implemented code to the progress ledger and acceptance criteria;
4. report verified progress and any mismatch;
5. continue from the first incomplete acceptance criterion;
6. avoid producing a replacement roadmap unless explicitly asked to amend this contract.

Recommended opening instruction:

> Treat `TRACK_B_BILLING_EXECUTION_CONTRACT_v1.md` as the frozen Track B authority. Inspect the supplied repository snapshot/current repo against it, identify verified progress, and continue from the first incomplete acceptance criterion. Do not redesign or reorder the roadmap unless repository evidence creates a blocking conflict; log any necessary change as an amendment instead.

---

## 13. Change-control rule

This contract may be changed only by appending an amendment with:

- amendment number;
- date;
- requesting decision-maker;
- affected section and sprint;
- reason;
- repository or business evidence;
- replacement decision;
- migration impact;
- approval status.

Do not edit prior decisions to make the history look cleaner.

### Amendment log

_No amendments at version 1.0._

---

## 14. Definition of Track B complete

Track B is complete for launch when:

- Team Optix can inspect implementation and billing readiness;
- Team Optix alone can execute Go Live;
- Go Live creates one correct weekly Stripe subscription anchored to the first Friday following Go Live;
- automation is gated by customer lifecycle;
- subscription, invoice, payment, refund, and failure facts are retained in Insight;
- Team Optix can operate routine billing from the internal Billing workspace;
- failed payments and lifecycle exceptions are visible and auditable;
- security and RLS prevent cross-company access;
- the complete sandbox certification passes;
- Customer #1 completes one successful live weekly billing cycle;
- Insight and Stripe reconcile.

That milestone proves Team Optix can operate Insight as a recurring-revenue software business, not only deliver it as a product.
