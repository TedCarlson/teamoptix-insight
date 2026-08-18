-- Run after 20260816232140_itf_company_location_foundation.sql.
-- All fixture writes are transaction-local and rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_itg_id uuid;
  v_itf_product_id uuid;
begin
  select company.id
  into v_itg_id
  from core.companies company
  where company.company_slug = 'integrated-tech-group';

  if v_itg_id is null then
    raise exception 'Integrated Tech Group was not provisioned.';
  end if;

  if not exists (
    select 1
    from core.companies company
    where company.id = v_itg_id
      and company.company_name = 'Integrated Tech Group'
      and company.company_status = 'active'
      and company.provisioning_status = 'provisioned'
      and company.contact_email is null
  ) then
    raise exception 'ITG company provisioning contract is incorrect.';
  end if;

  if (
    select count(*)
    from ref.insight_products product
    where product.product_key in (
      'insight-pd-last-mile',
      'insight-telecom-fulfillment',
      'utility-locate-service'
    )
  ) <> 3 then
    raise exception 'The commercial product registry is incomplete.';
  end if;

  select product.id
  into v_itf_product_id
  from ref.insight_products product
  where product.product_key = 'insight-telecom-fulfillment';

  if not exists (
    select 1
    from core.company_product company_product
    where company_product.company_id = v_itg_id
      and company_product.product_id = v_itf_product_id
      and company_product.participation_status = 'active'
  ) then
    raise exception 'ITG is not associated with ITF.';
  end if;

  if exists (
    select 1
    from core.company_product company_product
    join ref.insight_products product on product.id = company_product.product_id
    where company_product.company_id = v_itg_id
      and product.product_key <> 'insight-telecom-fulfillment'
  ) then
    raise exception 'ITG was associated with an unauthorized product.';
  end if;

  if (
    select count(*)
    from core.company_location location
    where location.company_id = v_itg_id
      and location.location_status = 'active'
  ) <> 2 then
    raise exception 'ITG must have exactly two active locations in this event.';
  end if;

  if not exists (
    select 1
    from core.company_location location
    where location.company_id = v_itg_id
      and location.location_code = '410'
      and location.location_name = 'Keystone'
  ) or not exists (
    select 1
    from core.company_location location
    where location.company_id = v_itg_id
      and location.location_code = '427'
      and location.location_name = 'Freedom'
  ) then
    raise exception 'The 410/427 location identities are incorrect.';
  end if;

  if exists (
    select 1
    from core.company_product company_product
    join ref.insight_products product on product.id = company_product.product_id
    where product.product_key = 'utility-locate-service'
  ) then
    raise exception 'ULS must not receive a company in this event.';
  end if;

  if exists (
    select 1
    from core.company_roster roster
    where roster.company_id = v_itg_id
  ) then
    raise exception 'The company/location event must not seed ITG roster rows.';
  end if;
end;
$$;

do $$
declare
  v_itg_id uuid;
  v_roster_id uuid := '00000000-0000-4000-8000-000000003101';
  v_location_id uuid;
begin
  select company.id
  into v_itg_id
  from core.companies company
  where company.company_slug = 'integrated-tech-group';

  select location.id
  into v_location_id
  from core.company_location location
  where location.company_id = v_itg_id
    and location.location_code = '410';

  insert into core.company_roster (
    id,
    company_id,
    full_name,
    employment_status,
    market_code
  ) values (
    v_roster_id,
    v_itg_id,
    'Event 3 Location Test',
    'Active',
    '410'
  );

  if not exists (
    select 1
    from core.company_roster roster
    where roster.id = v_roster_id
      and roster.company_location_id = v_location_id
      and roster.market_code = '410'
  ) then
    raise exception 'Market 410 did not resolve to the governed Keystone location.';
  end if;
end;
$$;

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000003201');

insert into core.profiles (
  id,
  auth_user_id,
  email,
  first_name,
  last_name,
  is_platform_owner
) values (
  '00000000-0000-4000-8000-000000003202',
  '00000000-0000-4000-8000-000000003201',
  'event3-platform@example.invalid',
  'Event 3',
  'Platform Owner',
  true
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000003201',
  true
);

do $$
begin
  if (
    select count(*)
    from public.platform_product_companies('insight-telecom-fulfillment') company
    where company.company_slug = 'integrated-tech-group'
      and company.location_count = 2
  ) <> 1 then
    raise exception 'Product-scoped company selection did not return ITG and its two locations.';
  end if;

  if exists (
    select 1
    from public.platform_product_companies('insight-telecom-fulfillment') company
    where company.company_slug = 'beacon-point-ventures'
  ) then
    raise exception 'PDLM company leaked into the ITF company selection.';
  end if;

  if exists (
    select 1
    from public.platform_product_companies('utility-locate-service')
  ) then
    raise exception 'ULS returned companies before it was configured.';
  end if;
end;
$$;

rollback;
