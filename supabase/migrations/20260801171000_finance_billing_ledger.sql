begin;

-- Team Optix owns the finance ledger. Stripe remains the provider and evidence
-- source, while these records remain queryable and auditable inside Insight.

alter table billing.subscription
  add column if not exists provider_price_id text,
  add column if not exists provider_livemode boolean,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table billing.subscription
  drop constraint if exists billing_subscription_status_ck;

alter table billing.subscription
  add constraint billing_subscription_status_ck
  check (
    subscription_status in (
      'not_started',
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'paused',
      'cancelled'
    )
  );

create unique index if not exists billing_subscription_provider_id_uniq
  on billing.subscription (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists billing.invoice (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references billing.customer(id)
    on delete cascade,
  company_id uuid not null
    references core.companies(id)
    on delete cascade,
  subscription_id uuid
    references billing.subscription(id)
    on delete set null,
  provider text not null default 'stripe',
  provider_invoice_id text not null,
  provider_customer_id text not null,
  provider_subscription_id text,
  provider_payment_intent_id text,
  provider_event_id text,
  provider_livemode boolean not null,
  invoice_number text,
  billing_reason text,
  collection_method text,
  currency text not null default 'usd',
  amount_due numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  amount_remaining numeric(10,2) not null default 0,
  invoice_status text not null,
  hosted_invoice_url text,
  invoice_pdf_url text,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_provider_ck
    check (provider = 'stripe'),
  constraint billing_invoice_status_ck
    check (
      invoice_status in (
        'draft',
        'open',
        'paid',
        'uncollectible',
        'void'
      )
    ),
  constraint billing_invoice_currency_ck
    check (currency = lower(currency)),
  constraint billing_invoice_amounts_ck
    check (
      amount_due >= 0
      and amount_paid >= 0
      and amount_remaining >= 0
    ),
  constraint billing_invoice_provider_id_uq
    unique (provider, provider_invoice_id)
);

create index if not exists billing_invoice_company_idx
  on billing.invoice (company_id, issued_at desc);

create index if not exists billing_invoice_customer_idx
  on billing.invoice (customer_id, issued_at desc);

create index if not exists billing_invoice_status_idx
  on billing.invoice (invoice_status, due_at);

create trigger billing_invoice_touch_updated_at
before update on billing.invoice
for each row execute function billing.touch_updated_at();

alter table billing.payment
  add column if not exists invoice_id uuid
    references billing.invoice(id)
    on delete set null,
  add column if not exists provider_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists amount_refunded numeric(10,2) not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_message text;

alter table billing.payment
  drop constraint if exists billing_payment_amount_refunded_ck;

alter table billing.payment
  add constraint billing_payment_amount_refunded_ck
  check (amount_refunded >= 0 and amount_refunded <= amount);

create unique index if not exists billing_payment_charge_uniq
  on billing.payment (provider, provider_charge_id)
  where provider_charge_id is not null;

create index if not exists billing_payment_invoice_idx
  on billing.payment (invoice_id);

create table if not exists billing.provider_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  object_id text,
  company_id uuid
    references core.companies(id)
    on delete set null,
  customer_id uuid
    references billing.customer(id)
    on delete set null,
  provider_livemode boolean not null,
  api_version text,
  occurred_at timestamptz not null,
  processing_status text not null default 'received',
  processing_attempts integer not null default 1,
  processed_at timestamptz,
  last_error text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_event_provider_ck
    check (provider = 'stripe'),
  constraint billing_provider_event_status_ck
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  constraint billing_provider_event_attempts_ck
    check (processing_attempts > 0),
  constraint billing_provider_event_provider_id_uq
    unique (provider, provider_event_id)
);

comment on table billing.provider_event is
  'Signed provider events received by Insight. This is the durable audit and idempotency ledger for finance synchronization.';

create index if not exists billing_provider_event_company_idx
  on billing.provider_event (company_id, occurred_at desc);

create index if not exists billing_provider_event_status_idx
  on billing.provider_event (processing_status, occurred_at desc);

create trigger billing_provider_event_touch_updated_at
before update on billing.provider_event
for each row execute function billing.touch_updated_at();

-- Company-scoped reads are available to governed users. Provider events are
-- restricted to Team Optix platform owners because payloads may contain PII.
alter table billing.payment enable row level security;
alter table billing.invoice enable row level security;
alter table billing.provider_event enable row level security;

drop policy if exists billing_payment_select on billing.payment;
create policy billing_payment_select
on billing.payment
for select
to authenticated
using (core.can_access_company(company_id));

drop policy if exists billing_invoice_select on billing.invoice;
create policy billing_invoice_select
on billing.invoice
for select
to authenticated
using (core.can_access_company(company_id));

drop policy if exists billing_provider_event_select on billing.provider_event;
create policy billing_provider_event_select
on billing.provider_event
for select
to authenticated
using (core.is_platform_owner());

revoke all on billing.payment from anon, public, authenticated;
grant select on billing.payment to authenticated;
grant all on billing.payment to service_role;

revoke all on billing.invoice from anon, public, authenticated;
grant select on billing.invoice to authenticated;
grant all on billing.invoice to service_role;

revoke all on billing.provider_event from anon, public, authenticated;
grant select on billing.provider_event to authenticated;
grant all on billing.provider_event to service_role;

-- Backfill the first live Team Optix transaction from Stripe objects and event
-- identifiers verified read-only on 2026-08-01. Every guard must match before
-- Insight changes its own records. No Stripe object is modified here.
do $$
declare
  v_company_id constant uuid := '0385bc8f-eb13-490b-92c8-f34bad2507df';
  v_customer_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_paid_at constant timestamptz := to_timestamp(1785594283);
  v_event_at constant timestamptz := to_timestamp(1785594288);
begin
  if not exists (
    select 1
    from core.companies company
    where company.id = v_company_id
      and company.company_slug = 'beacon-point-ventures'
  ) then
    raise exception 'Verified Beacon Point company identity does not match';
  end if;

  select customer.id
  into strict v_customer_id
  from billing.customer customer
  where customer.company_id = v_company_id
    and customer.provider = 'stripe'
    and customer.provider_customer_id = 'cus_Uzd3jxCq7G7TIK'
    and customer.provider_livemode is true;

  select payment.id
  into strict v_payment_id
  from billing.payment payment
  where payment.company_id = v_company_id
    and payment.provider = 'stripe'
    and payment.provider_checkout_session_id = 'cs_live_a1eY9XiZBY4u7mYN77gweVmguQO97BSaTxGxQGH7KsprMe1KY8TD5KvO2j'
    and payment.provider_payment_intent_id = 'pi_3TzdqAJeXupVRq0V1qMZM1RH'
    and payment.provider_event_id = 'evt_1TzdqGJeXupVRq0VecM4fcdk'
    and payment.amount = 398.00
    and payment.currency = 'usd'
    and payment.payment_status = 'paid';

  insert into billing.invoice (
    customer_id,
    company_id,
    provider,
    provider_invoice_id,
    provider_customer_id,
    provider_payment_intent_id,
    provider_event_id,
    provider_livemode,
    invoice_number,
    billing_reason,
    collection_method,
    currency,
    amount_due,
    amount_paid,
    amount_remaining,
    invoice_status,
    hosted_invoice_url,
    invoice_pdf_url,
    issued_at,
    due_at,
    paid_at,
    period_start,
    period_end,
    provider_metadata
  )
  values (
    v_customer_id,
    v_company_id,
    'stripe',
    'in_1TzdqDJeXupVRq0Vbh1GYYjk',
    'cus_Uzd3jxCq7G7TIK',
    'pi_3TzdqAJeXupVRq0V1qMZM1RH',
    'evt_1TzdqIJeXupVRq0VFxi4XV6I',
    true,
    'WNBGLHVU-0001',
    'manual',
    'send_invoice',
    'usd',
    398.00,
    398.00,
    0.00,
    'paid',
    'https://invoice.stripe.com/i/acct_1TrLEgJeXupVRq0V/live_YWNjdF8xVHJMRWdKZVh1cFZScTBWLF9VemQ2NzFxeDJJVVJ4eVMxUXYzRTQ0Y2pmdmRxUHpyLDE3NjEzNTU5Mg0200Sb0XpuCl?s=ap',
    'https://pay.stripe.com/invoice/acct_1TrLEgJeXupVRq0V/live_YWNjdF8xVHJMRWdKZVh1cFZScTBWLF9VemQ2NzFxeDJJVVJ4eVMxUXYzRTQ0Y2pmdmRxUHpyLDE3NjEzNTU5Mg0200Sb0XpuCl/pdf?s=ap',
    v_paid_at,
    v_paid_at,
    v_paid_at,
    v_paid_at,
    v_paid_at,
    jsonb_build_object(
      'company_id', v_company_id,
      'company_slug', 'beacon-point-ventures',
      'operator_tier_key', 'operator_3',
      'payment_purpose', 'implementation',
      'source', 'insight',
      'backfilled_from_verified_stripe', true
    )
  )
  on conflict (provider, provider_invoice_id)
  do update set
    invoice_number = excluded.invoice_number,
    provider_payment_intent_id = excluded.provider_payment_intent_id,
    provider_event_id = excluded.provider_event_id,
    provider_livemode = excluded.provider_livemode,
    amount_due = excluded.amount_due,
    amount_paid = excluded.amount_paid,
    amount_remaining = excluded.amount_remaining,
    invoice_status = excluded.invoice_status,
    hosted_invoice_url = excluded.hosted_invoice_url,
    invoice_pdf_url = excluded.invoice_pdf_url,
    paid_at = excluded.paid_at,
    provider_metadata = excluded.provider_metadata
  returning id into v_invoice_id;

  update billing.payment
  set
    invoice_id = v_invoice_id,
    provider_invoice_id = 'in_1TzdqDJeXupVRq0Vbh1GYYjk',
    provider_charge_id = 'ch_3TzdqAJeXupVRq0V1EbNTJBN',
    provider_livemode = true,
    receipt_url = 'https://pay.stripe.com/receipts/invoices/CAcQARoXChVhY2N0XzFUckxFZ0plWHVwVlJxMFYo34e40wYyBscrjv_tFzosFmkzHZQo9KM1IdfEp-kbgdZuWiUmIzdUbtWewefe_XlC4Gn8GqDLxduDoGE?s=ap',
    amount_refunded = 0,
    provider_metadata = provider_metadata || jsonb_build_object(
      'livemode', true,
      'invoice_id', 'in_1TzdqDJeXupVRq0Vbh1GYYjk',
      'invoice_number', 'WNBGLHVU-0001',
      'charge_id', 'ch_3TzdqAJeXupVRq0V1EbNTJBN',
      'backfilled_from_verified_stripe', true
    )
  where id = v_payment_id;

  insert into billing.provider_event (
    provider,
    provider_event_id,
    event_type,
    object_id,
    company_id,
    customer_id,
    provider_livemode,
    occurred_at,
    processing_status,
    processed_at,
    payload
  )
  select
    'stripe',
    verified.provider_event_id,
    verified.event_type,
    verified.object_id,
    v_company_id,
    v_customer_id,
    true,
    verified.occurred_at,
    'processed',
    now(),
    jsonb_build_object(
      'id', verified.provider_event_id,
      'type', verified.event_type,
      'livemode', true,
      'data', jsonb_build_object(
        'object', jsonb_build_object(
          'id', verified.object_id,
          'backfilled_from_verified_stripe', true
        )
      )
    )
  from (
    values
      ('evt_1TzdqGJeXupVRq0VecM4fcdk', 'checkout.session.completed', 'cs_live_a1eY9XiZBY4u7mYN77gweVmguQO97BSaTxGxQGH7KsprMe1KY8TD5KvO2j', v_event_at),
      ('evt_1TzdqIJeXupVRq0VS2DlTMfl', 'invoice.payment_succeeded', 'in_1TzdqDJeXupVRq0Vbh1GYYjk', v_event_at),
      ('evt_1TzdqIJeXupVRq0VFxi4XV6I', 'invoice.paid', 'in_1TzdqDJeXupVRq0Vbh1GYYjk', v_event_at),
      ('evt_1TzdqIJeXupVRq0VOy5ENaVn', 'invoice.sent', 'in_1TzdqDJeXupVRq0Vbh1GYYjk', v_event_at),
      ('evt_1TzdqHJeXupVRq0ViaTeOy03', 'invoice.finalized', 'in_1TzdqDJeXupVRq0Vbh1GYYjk', v_event_at),
      ('evt_1TzdqHJeXupVRq0V4V9ZFSLC', 'invoice.created', 'in_1TzdqDJeXupVRq0Vbh1GYYjk', v_event_at),
      ('evt_3TzdqAJeXupVRq0V1O5UVC6D', 'payment_intent.succeeded', 'pi_3TzdqAJeXupVRq0V1qMZM1RH', to_timestamp(1785594284)),
      ('evt_3TzdqAJeXupVRq0V1qfnU1o3', 'payment_intent.created', 'pi_3TzdqAJeXupVRq0V1qMZM1RH', to_timestamp(1785594282))
  ) as verified(provider_event_id, event_type, object_id, occurred_at)
  on conflict (provider, provider_event_id) do nothing;

  update commercial.company_activation_readiness
  set
    status = 'ready',
    source_type = 'provider',
    source_basis = 'Verified from paid live-mode Stripe invoice WNBGLHVU-0001.',
    completed_at = v_paid_at,
    completed_by = null,
    blocking_reason = null,
    metadata = jsonb_build_object(
      'payment_id', v_payment_id,
      'provider_event_id', 'evt_1TzdqGJeXupVRq0VecM4fcdk',
      'provider_invoice_id', 'in_1TzdqDJeXupVRq0Vbh1GYYjk',
      'invoice_number', 'WNBGLHVU-0001',
      'provider_livemode', true,
      'paid_at', v_paid_at
    )
  where company_id = v_company_id
    and readiness_key = 'implementation_payment_ready';

  update commercial.company_activation
  set
    implementation_payment_received_at = v_paid_at,
    lifecycle_status = case
      when not exists (
        select 1
        from commercial.company_activation_readiness readiness
        where readiness.company_id = v_company_id
          and readiness.is_blocking
          and readiness.status = 'incomplete'
      ) then 'ready_for_go_live'
      else 'implementation'
    end,
    ready_for_go_live_at = case
      when not exists (
        select 1
        from commercial.company_activation_readiness readiness
        where readiness.company_id = v_company_id
          and readiness.is_blocking
          and readiness.status = 'incomplete'
      ) then coalesce(ready_for_go_live_at, now())
      else null
    end,
    last_transition = 'live_implementation_payment_reconciled',
    last_transition_at = now(),
    updated_at = now()
  where company_id = v_company_id
    and lifecycle_status in ('implementation', 'ready_for_go_live');
end;
$$;

notify pgrst, 'reload schema';

commit;
