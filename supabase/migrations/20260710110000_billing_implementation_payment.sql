begin;

alter table commercial.profile
  drop constraint if exists profile_commercial_status_check;

alter table commercial.profile
  drop constraint if exists commercial_profile_commercial_status_check;

alter table commercial.profile
  add constraint commercial_profile_commercial_status_check
  check (
    commercial_status in (
      'draft',
      'profile_complete',
      'ready_for_stripe',
      'stripe_customer_created',
      'implementation_paid',
      'subscription_active',
      'suspended',
      'cancelled'
    )
  );

create table if not exists billing.payment (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null
    references billing.customer(id)
    on delete cascade,

  company_id uuid not null
    references core.companies(id)
    on delete cascade,

  provider text not null default 'stripe',

  payment_purpose text not null,

  provider_checkout_session_id text null,

  provider_payment_intent_id text null,

  provider_event_id text null,

  amount numeric(10,2) not null,

  currency text not null default 'usd',

  payment_status text not null default 'pending',

  paid_at timestamptz null,

  provider_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint billing_payment_provider_ck
    check (provider in ('stripe')),

  constraint billing_payment_purpose_ck
    check (payment_purpose in ('implementation', 'subscription')),

  constraint billing_payment_status_ck
    check (
      payment_status in (
        'pending',
        'paid',
        'failed',
        'refunded',
        'partially_refunded'
      )
    ),

  constraint billing_payment_amount_ck
    check (amount >= 0),

  constraint billing_payment_currency_ck
    check (currency = lower(currency))
);

create unique index if not exists billing_payment_checkout_session_uniq
  on billing.payment(provider, provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create unique index if not exists billing_payment_intent_uniq
  on billing.payment(provider, provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create unique index if not exists billing_payment_event_uniq
  on billing.payment(provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists billing_payment_company_idx
  on billing.payment(company_id);

create index if not exists billing_payment_customer_idx
  on billing.payment(customer_id);

create index if not exists billing_payment_status_idx
  on billing.payment(payment_status);

drop trigger if exists billing_payment_touch_updated_at
on billing.payment;

create trigger billing_payment_touch_updated_at
before update on billing.payment
for each row
execute function billing.touch_updated_at();

commit;
