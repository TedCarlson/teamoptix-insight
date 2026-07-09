create schema if not exists commercial;

create table if not exists commercial.profile (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references core.companies(id)
    on delete cascade,

  operator_tier_key text null,

  implementation_fee numeric(10,2) null,

  weekly_subscription numeric(10,2) null,

  billing_contact_name text null,

  billing_email text null,

  billing_phone text null,

  commercial_status text not null default 'draft'
    check (
      commercial_status in (
        'draft',
        'profile_complete',
        'ready_for_stripe',
        'stripe_customer_created',
        'subscription_active',
        'suspended',
        'cancelled'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commercial_profile_company_uniq
    unique (company_id)
);

create or replace function commercial.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commercial_profile_touch_updated_at
on commercial.profile;

create trigger commercial_profile_touch_updated_at
before update on commercial.profile
for each row
execute function commercial.touch_updated_at();

alter table commercial.profile enable row level security;

create policy commercial_profile_select
on commercial.profile
for select
using (true);

create policy commercial_profile_insert
on commercial.profile
for insert
with check (true);

create policy commercial_profile_update
on commercial.profile
for update
using (true)
with check (true);
