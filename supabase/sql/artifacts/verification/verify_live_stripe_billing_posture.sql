-- Read-only point-in-time verification for the live Stripe catalog alignment
-- and Beacon Point reset. Run only before the first live customer is created;
-- verify_finance_billing_ledger.sql supersedes it after live Checkout.

do $$
declare
  v_company_id uuid;
  v_live_tier_count integer;
begin
  select company.id
  into strict v_company_id
  from core.companies company
  where company.company_slug = 'beacon-point-ventures';

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
    raise exception 'Expected four verified live Stripe tier mappings, found %', v_live_tier_count;
  end if;

  if exists (
    select 1
    from billing.customer customer
    where customer.company_id = v_company_id
      and customer.provider_customer_id is not null
  ) then
    raise exception 'Beacon Point still has a connected Stripe customer after reset';
  end if;

  if exists (
    select 1
    from billing.payment payment
    where payment.company_id = v_company_id
      and payment.provider_checkout_session_id like 'cs_test_%'
      and payment.provider_livemode is distinct from false
  ) then
    raise exception 'Beacon Point sandbox payment is not marked as non-live evidence';
  end if;

  if not exists (
    select 1
    from commercial.profile profile
    where profile.company_id = v_company_id
      and profile.commercial_status = 'ready_for_stripe'
  ) then
    raise exception 'Beacon Point commercial profile is not reset to ready_for_stripe';
  end if;

  if not exists (
    select 1
    from commercial.company_activation activation
    where activation.company_id = v_company_id
      and activation.lifecycle_status = 'implementation'
      and activation.implementation_payment_received_at is null
      and activation.subscription_activation_status = 'not_started'
  ) then
    raise exception 'Beacon Point activation billing posture is not reset';
  end if;

  if exists (
    select 1
    from commercial.company_activation_readiness readiness
    where readiness.company_id = v_company_id
      and readiness.readiness_key in (
        'implementation_payment_ready',
        'customer_approval_ready'
      )
      and readiness.status <> 'incomplete'
  ) then
    raise exception 'Beacon Point billing-derived readiness remains complete after reset';
  end if;
end;
$$;
