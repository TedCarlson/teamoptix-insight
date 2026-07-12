begin;

-- Track B / Sprint B1
-- Establish the durable customer lifecycle, readiness, and resumable
-- activation records without changing core.companies.company_status.

create table commercial.company_activation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references core.companies(id)
    on delete cascade,

  lifecycle_status text not null default 'implementation',

  implementation_started_at timestamptz,
  implementation_completed_at timestamptz,
  ready_for_go_live_at timestamptz,
  go_live_requested_at timestamptz,
  go_live_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  reactivated_at timestamptz,
  archived_at timestamptz,

  implementation_completed_by uuid,
  ready_for_go_live_by uuid,
  go_live_requested_by uuid,
  go_live_by uuid,
  paused_by uuid,
  cancelled_by uuid,
  reactivated_by uuid,

  implementation_payment_received_at timestamptz,
  first_billing_date date,
  subscription_activation_status text not null default 'not_started',
  subscription_activated_at timestamptz,

  last_transition text not null default 'implementation',
  last_transition_at timestamptz not null default now(),
  last_transition_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_activation_company_uq
    unique (company_id),

  constraint company_activation_lifecycle_status_ck
    check (
      lifecycle_status in (
        'implementation',
        'ready_for_go_live',
        'activation_in_progress',
        'active',
        'activation_failed',
        'paused',
        'cancelled',
        'archived'
      )
    ),

  constraint company_activation_subscription_status_ck
    check (
      subscription_activation_status in (
        'not_started',
        'pending',
        'running',
        'complete',
        'failed',
        'skipped'
      )
    ),

  constraint company_activation_first_billing_date_ck
    check (
      first_billing_date is null
      or go_live_requested_at is not null
    )
);

comment on table commercial.company_activation is
  'Team Optix-owned customer lifecycle and Go Live coordination record. Provider subscription state remains in billing.subscription.';

comment on column commercial.company_activation.lifecycle_status is
  'Authoritative Team Optix customer lifecycle state, distinct from workspace availability and Stripe provider state.';

comment on column commercial.company_activation.first_billing_date is
  'Persisted America/New_York first-Friday billing date calculated before Stripe subscription creation.';


create table commercial.company_activation_readiness (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references core.companies(id)
    on delete cascade,

  readiness_key text not null,
  status text not null default 'incomplete',
  source_type text not null default 'manual',
  source_basis text,
  is_blocking boolean not null default true,

  completed_at timestamptz,
  completed_by uuid,
  blocking_reason text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_activation_readiness_company_key_uq
    unique (company_id, readiness_key),

  constraint company_activation_readiness_key_ck
    check (
      readiness_key in (
        'commercial_ready',
        'implementation_payment_ready',
        'contract_ready',
        'workspace_ready',
        'credentials_ready',
        'automation_ready',
        'training_ready',
        'customer_approval_ready'
      )
    ),

  constraint company_activation_readiness_status_ck
    check (
      status in (
        'incomplete',
        'ready',
        'not_applicable'
      )
    ),

  constraint company_activation_readiness_source_type_ck
    check (
      source_type in (
        'computed',
        'manual',
        'provider',
        'system'
      )
    ),

  constraint company_activation_readiness_completion_ck
    check (
      (
        status = 'ready'
        and completed_at is not null
        and blocking_reason is null
      )
      or (
        status = 'not_applicable'
        and blocking_reason is null
      )
      or (
        status = 'incomplete'
        and completed_at is null
      )
    )
);

comment on table commercial.company_activation_readiness is
  'Inspectable Go Live readiness facts with source, completion evidence, and blocking reason.';


create table commercial.company_activation_run (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references core.companies(id)
    on delete cascade,

  run_type text not null,
  status text not null default 'pending',

  requested_at timestamptz not null default now(),
  requested_by uuid not null,
  started_at timestamptz,
  completed_at timestamptz,
  failure_summary text,

  idempotency_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_activation_run_idempotency_uq
    unique (idempotency_key),

  constraint company_activation_run_type_ck
    check (
      run_type in (
        'go_live',
        'resume',
        'reactivation'
      )
    ),

  constraint company_activation_run_status_ck
    check (
      status in (
        'pending',
        'running',
        'complete',
        'partial',
        'failed'
      )
    ),

  constraint company_activation_run_timestamps_ck
    check (
      completed_at is null
      or started_at is not null
    )
);

comment on table commercial.company_activation_run is
  'One durable, idempotent execution attempt for Go Live, resume, or reactivation.';


create table commercial.company_activation_step (
  id uuid primary key default gen_random_uuid(),
  activation_run_id uuid not null
    references commercial.company_activation_run(id)
    on delete cascade,

  step_key text not null,
  step_order integer not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,

  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_activation_step_run_key_uq
    unique (activation_run_id, step_key),

  constraint company_activation_step_run_order_uq
    unique (activation_run_id, step_order),

  constraint company_activation_step_key_ck
    check (
      step_key in (
        'validate_readiness',
        'record_go_live_decision',
        'calculate_first_billing_date',
        'create_stripe_subscription',
        'persist_billing_subscription',
        'enable_automation',
        'confirm_intelligence_access',
        'enable_notifications',
        'finalize_activation'
      )
    ),

  constraint company_activation_step_status_ck
    check (
      status in (
        'pending',
        'running',
        'complete',
        'failed',
        'skipped'
      )
    ),

  constraint company_activation_step_order_ck
    check (step_order > 0),

  constraint company_activation_step_attempt_count_ck
    check (attempt_count >= 0),

  constraint company_activation_step_timestamps_ck
    check (
      completed_at is null
      or started_at is not null
    )
);

comment on table commercial.company_activation_step is
  'Discrete, auditable, retryable steps belonging to a customer activation run.';


create index company_activation_lifecycle_status_idx
  on commercial.company_activation (lifecycle_status);

create index company_activation_last_transition_at_idx
  on commercial.company_activation (last_transition_at desc);

create index company_activation_readiness_company_status_idx
  on commercial.company_activation_readiness (company_id, status);

create index company_activation_run_company_requested_idx
  on commercial.company_activation_run (company_id, requested_at desc);

create index company_activation_run_company_status_idx
  on commercial.company_activation_run (company_id, status);

create index company_activation_step_run_order_idx
  on commercial.company_activation_step (activation_run_id, step_order);


create trigger company_activation_touch_updated_at
before update on commercial.company_activation
for each row
execute function commercial.touch_updated_at();

create trigger company_activation_readiness_touch_updated_at
before update on commercial.company_activation_readiness
for each row
execute function commercial.touch_updated_at();

create trigger company_activation_run_touch_updated_at
before update on commercial.company_activation_run
for each row
execute function commercial.touch_updated_at();

create trigger company_activation_step_touch_updated_at
before update on commercial.company_activation_step
for each row
execute function commercial.touch_updated_at();


-- Every existing company receives an inspectable lifecycle record.
-- Existing companies are intentionally NOT backfilled as Go Live.
insert into commercial.company_activation (
  company_id,
  lifecycle_status,
  implementation_started_at,
  last_transition,
  last_transition_at
)
select
  c.id,
  'implementation',
  c.created_at,
  'baseline_backfill',
  now()
from core.companies c
on conflict (company_id) do nothing;


-- Seed every required readiness domain as explicit and incomplete.
insert into commercial.company_activation_readiness (
  company_id,
  readiness_key,
  status,
  source_type,
  is_blocking,
  blocking_reason
)
select
  c.id,
  readiness.readiness_key,
  'incomplete',
  readiness.source_type,
  true,
  readiness.blocking_reason
from core.companies c
cross join (
  values
    (
      'commercial_ready',
      'computed',
      'Commercial profile has not yet been verified for Go Live.'
    ),
    (
      'implementation_payment_ready',
      'computed',
      'Implementation payment has not yet been verified.'
    ),
    (
      'contract_ready',
      'manual',
      'Customer agreement has not yet been acknowledged.'
    ),
    (
      'workspace_ready',
      'manual',
      'Workspace readiness has not yet been acknowledged.'
    ),
    (
      'credentials_ready',
      'manual',
      'Required customer credentials have not yet been verified.'
    ),
    (
      'automation_ready',
      'manual',
      'Automation configuration has not yet been verified.'
    ),
    (
      'training_ready',
      'manual',
      'Customer training has not yet been acknowledged.'
    ),
    (
      'customer_approval_ready',
      'manual',
      'Customer approval to Go Live has not yet been recorded.'
    )
) as readiness (
  readiness_key,
  source_type,
  blocking_reason
)
on conflict (company_id, readiness_key) do nothing;


-- These records are server-controlled until explicit read/write policies
-- are added with the platform-owner authorization contract.
alter table commercial.company_activation
  enable row level security;

alter table commercial.company_activation_readiness
  enable row level security;

alter table commercial.company_activation_run
  enable row level security;

alter table commercial.company_activation_step
  enable row level security;

revoke all on table commercial.company_activation
  from anon, authenticated;

revoke all on table commercial.company_activation_readiness
  from anon, authenticated;

revoke all on table commercial.company_activation_run
  from anon, authenticated;

revoke all on table commercial.company_activation_step
  from anon, authenticated;

grant all on table commercial.company_activation
  to service_role;

grant all on table commercial.company_activation_readiness
  to service_role;

grant all on table commercial.company_activation_run
  to service_role;

grant all on table commercial.company_activation_step
  to service_role;

commit;
