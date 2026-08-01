begin;

alter table billing.subscription
  add column if not exists operator_tier_key text,
  add column if not exists weekly_amount numeric(10,2),
  add column if not exists currency text not null default 'usd',
  add column if not exists billing_start_date date,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid;

alter table billing.subscription
  drop constraint if exists billing_subscription_weekly_amount_ck,
  drop constraint if exists billing_subscription_currency_ck;

alter table billing.subscription
  add constraint billing_subscription_weekly_amount_ck
    check (weekly_amount is null or weekly_amount >= 0),
  add constraint billing_subscription_currency_ck
    check (currency = lower(currency));

alter table billing.invoice
  add column if not exists invoice_type text not null default 'subscription',
  add column if not exists subtotal_amount numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists tax_amount numeric(10,2) not null default 0,
  add column if not exists total_amount numeric(10,2) not null default 0;

alter table billing.invoice
  drop constraint if exists billing_invoice_type_ck,
  drop constraint if exists billing_invoice_totals_ck;

alter table billing.invoice
  add constraint billing_invoice_type_ck
    check (invoice_type in ('implementation', 'subscription', 'adjustment', 'credit')),
  add constraint billing_invoice_totals_ck
    check (
      subtotal_amount >= 0
      and discount_amount >= 0
      and tax_amount >= 0
      and total_amount >= 0
    );

update billing.invoice invoice
set
  invoice_type = case
    when invoice.provider_metadata ->> 'payment_purpose' = 'implementation'
      then 'implementation'
    when invoice.provider_subscription_id is not null
      then 'subscription'
    else invoice.invoice_type
  end,
  subtotal_amount = invoice.amount_due,
  total_amount = invoice.amount_due
where invoice.total_amount = 0;

create table billing.invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null
    references billing.invoice(id)
    on delete cascade,
  company_id uuid not null
    references core.companies(id)
    on delete cascade,
  provider text not null default 'stripe',
  provider_line_item_id text not null,
  line_type text not null,
  description text,
  quantity numeric,
  unit_amount numeric(10,2),
  line_amount numeric(10,2) not null,
  internal_price_key text,
  provider_price_id text,
  currency text not null default 'usd',
  service_period_start timestamptz,
  service_period_end timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_line_provider_ck
    check (provider = 'stripe'),
  constraint billing_invoice_line_currency_ck
    check (currency = lower(currency)),
  constraint billing_invoice_line_provider_id_uq
    unique (provider, provider_line_item_id)
);

create index billing_invoice_line_invoice_idx
  on billing.invoice_line (invoice_id);

create index billing_invoice_line_company_idx
  on billing.invoice_line (company_id);

create trigger billing_invoice_line_touch_updated_at
before update on billing.invoice_line
for each row execute function billing.touch_updated_at();

alter table billing.invoice_line enable row level security;

create policy billing_invoice_line_select
on billing.invoice_line
for select
to authenticated
using (core.can_access_company(company_id));

revoke all on billing.invoice_line from anon, public, authenticated;
grant select on billing.invoice_line to authenticated;
grant all on billing.invoice_line to service_role;

-- Exact, read-only-verified line detail for Team Optix invoice WNBGLHVU-0001.
insert into billing.invoice_line (
  invoice_id,
  company_id,
  provider,
  provider_line_item_id,
  line_type,
  description,
  quantity,
  unit_amount,
  line_amount,
  internal_price_key,
  provider_price_id,
  currency,
  service_period_start,
  service_period_end,
  provider_metadata
)
select
  invoice.id,
  invoice.company_id,
  'stripe',
  'il_1TzdqDJeXupVRq0VGxEmpXFc',
  'invoice_item',
  'Implementation 16-25 route Operators',
  1,
  398.00,
  398.00,
  'operator_3_implementation',
  'price_1TzKemJeXupVRq0VJrmXFoo7',
  'usd',
  to_timestamp(1785594285),
  to_timestamp(1785594285),
  jsonb_build_object('backfilled_from_verified_stripe', true)
from billing.invoice invoice
where invoice.provider = 'stripe'
  and invoice.provider_invoice_id = 'in_1TzdqDJeXupVRq0Vbh1GYYjk'
on conflict (provider, provider_line_item_id) do nothing;

notify pgrst, 'reload schema';

commit;
