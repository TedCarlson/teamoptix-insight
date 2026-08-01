begin;

alter table billing.customer
  add column if not exists provider_livemode boolean;

comment on column billing.customer.provider_livemode is
  'Stripe environment for provider_customer_id. Null means no current provider customer is connected.';

alter table billing.payment
  add column if not exists provider_invoice_id text,
  add column if not exists provider_livemode boolean;

comment on column billing.payment.provider_invoice_id is
  'Stripe Invoice created for the Checkout payment, when invoice creation is enabled.';

comment on column billing.payment.provider_livemode is
  'Stripe event environment. Only live-mode payments satisfy production activation readiness.';

create unique index if not exists billing_payment_invoice_uniq
  on billing.payment (provider, provider_invoice_id)
  where provider_invoice_id is not null;

update billing.payment
set provider_livemode = case
  when provider_checkout_session_id like 'cs_live_%' then true
  when provider_checkout_session_id like 'cs_test_%' then false
  else provider_livemode
end
where provider_livemode is null;

-- Verified against Stripe account acct_1TrLEgJeXupVRq0V on 2026-08-01.
-- Product IDs remained stable when the catalog was promoted to live mode;
-- Price IDs changed and therefore must be synchronized explicitly.
update commercial.operator_tier tier
set
  stripe_setup_product_id = mapping.setup_product_id,
  stripe_setup_price_id = mapping.setup_price_id,
  stripe_subscription_product_id = mapping.subscription_product_id,
  stripe_subscription_price_id = mapping.subscription_price_id,
  updated_at = now()
from (
  values
    (
      'operator_1',
      'prod_Ur4hprVKfM4w38',
      'price_1TzKeqJeXupVRq0VcpIQgOCF',
      'prod_Ur4LDY4pBxYBSj',
      'price_1TzKf3JeXupVRq0V6w4CjRjC'
    ),
    (
      'operator_2',
      'prod_Ur4nl2HZVhsGnK',
      'price_1TzKeoJeXupVRq0VuBjoLB9L',
      'prod_Ur4O40b8GMFjE2',
      'price_1TzKf0JeXupVRq0VJ1Wcu3NQ'
    ),
    (
      'operator_3',
      'prod_Ur4oGiEO4Kintx',
      'price_1TzKemJeXupVRq0VJrmXFoo7',
      'prod_Ur4ObcfZoC7Rfk',
      'price_1TzKeyJeXupVRq0V5QAAhnF4'
    ),
    (
      'operator_4',
      'prod_Ur4qlJscg72ubQ',
      'price_1TzKejJeXupVRq0VZ8rO7Xa9',
      'prod_Ur4Ppy7nb6uYt1',
      'price_1TzKewJeXupVRq0VYHTqFVMc'
    )
) as mapping(
  tier_key,
  setup_product_id,
  setup_price_id,
  subscription_product_id,
  subscription_price_id
)
where tier.tier_key = mapping.tier_key;

do $$
declare
  v_company_id uuid;
  v_live_tier_count integer;
  v_billing_customer_count integer;
  v_subscription_count integer;
  v_test_payment_count integer;
begin
  select count(*)
  into v_live_tier_count
  from commercial.operator_tier tier
  where (tier.tier_key, tier.stripe_setup_price_id, tier.stripe_subscription_price_id) in (
    ('operator_1', 'price_1TzKeqJeXupVRq0VcpIQgOCF', 'price_1TzKf3JeXupVRq0V6w4CjRjC'),
    ('operator_2', 'price_1TzKeoJeXupVRq0VuBjoLB9L', 'price_1TzKf0JeXupVRq0VJ1Wcu3NQ'),
    ('operator_3', 'price_1TzKemJeXupVRq0VJrmXFoo7', 'price_1TzKeyJeXupVRq0V5QAAhnF4'),
    ('operator_4', 'price_1TzKejJeXupVRq0VZ8rO7Xa9', 'price_1TzKewJeXupVRq0VYHTqFVMc')
  );

  if v_live_tier_count <> 4 then
    raise exception
      'Expected four live Stripe tier mappings, found %',
      v_live_tier_count;
  end if;

  select company.id
  into strict v_company_id
  from core.companies company
  where company.company_slug = 'beacon-point-ventures';

  select count(*)
  into v_billing_customer_count
  from billing.customer customer
  where customer.company_id = v_company_id
    and customer.provider = 'stripe'
    and customer.provider_customer_id = 'cus_UrAFCZWNppDycW';

  if v_billing_customer_count <> 1 then
    raise exception
      'Expected exactly one Beacon Point sandbox billing customer, found %',
      v_billing_customer_count;
  end if;

  select count(*)
  into v_subscription_count
  from billing.subscription subscription
  where subscription.company_id = v_company_id;

  if v_subscription_count <> 0 then
    raise exception
      'Beacon Point reset refused because % billing subscription rows exist',
      v_subscription_count;
  end if;

  select count(*)
  into v_test_payment_count
  from billing.payment payment
  where payment.company_id = v_company_id
    and payment.provider_checkout_session_id like 'cs_test_%';

  if v_test_payment_count <> 1 then
    raise exception
      'Expected exactly one Beacon Point sandbox implementation payment, found %',
      v_test_payment_count;
  end if;

  if exists (
    select 1
    from billing.payment payment
    where payment.company_id = v_company_id
      and payment.provider_livemode is true
  ) then
    raise exception
      'Beacon Point reset refused because a live Stripe payment exists';
  end if;

  update billing.customer
  set
    provider_customer_id = null,
    provider_livemode = null,
    billing_status = 'not_started',
    updated_at = now()
  where company_id = v_company_id
    and provider = 'stripe';

  update commercial.profile
  set
    commercial_status = 'ready_for_stripe',
    updated_at = now()
  where company_id = v_company_id;

  update commercial.company_activation_readiness
  set
    status = 'incomplete',
    source_basis = null,
    completed_at = null,
    completed_by = null,
    blocking_reason = case readiness_key
      when 'implementation_payment_ready'
        then 'A paid live-mode implementation payment record has not been found.'
      when 'customer_approval_ready'
        then 'Fresh customer Go Live authorization is required for the live billing run.'
    end,
    metadata = case readiness_key
      when 'implementation_payment_ready'
        then jsonb_build_object(
          'sandbox_evidence_preserved', true,
          'sandbox_payment_count', v_test_payment_count
        )
      else '{}'::jsonb
    end,
    updated_at = now()
  where company_id = v_company_id
    and readiness_key in (
      'implementation_payment_ready',
      'customer_approval_ready'
    );

  update commercial.company_activation
  set
    lifecycle_status = 'implementation',
    implementation_payment_received_at = null,
    ready_for_go_live_at = null,
    ready_for_go_live_by = null,
    go_live_requested_at = null,
    go_live_requested_by = null,
    go_live_at = null,
    go_live_by = null,
    first_billing_date = null,
    subscription_activation_status = 'not_started',
    subscription_activated_at = null,
    last_transition = 'live_billing_posture_reset',
    last_transition_at = now(),
    last_transition_by = null,
    updated_at = now()
  where company_id = v_company_id;
end;
$$;

create or replace view billing.customer_subscription_v as
select
  customer.id as billing_customer_id,
  customer.company_id,
  company.company_slug,
  company.company_name,
  customer.provider,
  customer.provider_customer_id,
  customer.billing_email,
  customer.billing_name,
  customer.billing_status,
  subscription.id as subscription_id,
  subscription.provider_subscription_id,
  subscription.price_key,
  subscription.billing_interval,
  subscription.subscription_status,
  subscription.current_period_start,
  subscription.current_period_end,
  subscription.cancel_at_period_end,
  greatest(
    customer.updated_at,
    coalesce(subscription.updated_at, customer.updated_at)
  ) as updated_at,
  customer.provider_livemode
from billing.customer customer
join core.companies company
  on company.id = customer.company_id
left join billing.subscription subscription
  on subscription.customer_id = customer.id;

alter view billing.customer_subscription_v
  set (security_invoker = true);

revoke all on billing.customer_subscription_v from anon, public, authenticated;
grant select on billing.customer_subscription_v to authenticated;
grant all on billing.customer_subscription_v to service_role;

notify pgrst, 'reload schema';

commit;
