create schema if not exists billing;

create table if not exists billing.customer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text null,
  billing_email text null,
  billing_name text null,
  billing_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customer_company_provider_uniq unique (company_id, provider),
  constraint billing_customer_provider_ck check (provider in ('stripe')),
  constraint billing_customer_status_ck check (
    billing_status in ('not_started', 'ready', 'active', 'past_due', 'suspended', 'cancelled')
  )
);

create table if not exists billing.subscription (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references billing.customer(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  provider text not null default 'stripe',
  provider_subscription_id text null,
  price_key text not null,
  billing_interval text not null default 'week',
  subscription_status text not null default 'not_started',
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_provider_ck check (provider in ('stripe')),
  constraint billing_subscription_interval_ck check (billing_interval in ('week', 'month', 'year')),
  constraint billing_subscription_status_ck check (
    subscription_status in ('not_started', 'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'cancelled')
  )
);

create index if not exists billing_customer_company_idx
  on billing.customer(company_id);

create index if not exists billing_subscription_company_idx
  on billing.subscription(company_id);

create index if not exists billing_subscription_provider_id_idx
  on billing.subscription(provider_subscription_id);

create or replace view billing.customer_subscription_v as
select
  c.id as billing_customer_id,
  c.company_id,
  co.company_slug,
  co.company_name,
  c.provider,
  c.provider_customer_id,
  c.billing_email,
  c.billing_name,
  c.billing_status,
  s.id as subscription_id,
  s.provider_subscription_id,
  s.price_key,
  s.billing_interval,
  s.subscription_status,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  greatest(c.updated_at, coalesce(s.updated_at, c.updated_at)) as updated_at
from billing.customer c
join core.companies co on co.id = c.company_id
left join billing.subscription s on s.customer_id = c.id;

create or replace function billing.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists billing_customer_touch_updated_at on billing.customer;
create trigger billing_customer_touch_updated_at
before update on billing.customer
for each row execute function billing.touch_updated_at();

drop trigger if exists billing_subscription_touch_updated_at on billing.subscription;
create trigger billing_subscription_touch_updated_at
before update on billing.subscription
for each row execute function billing.touch_updated_at();
