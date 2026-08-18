-- Event 3: governed product/company/location foundation for ITF roster setup.
--
-- Scope is intentionally limited to:
--   * the three commercial product identities;
--   * Integrated Tech Group as the first ITF company;
--   * active ITG locations 410 Keystone and 427 Freedom;
--   * location-aware company roster entry.
--
-- No Business Partner, user, workforce, onboarding, metric, or donor operational
-- row is created by this migration.

create table if not exists ref.insight_products (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique,
  product_name text not null,
  product_short_name text not null,
  product_status text not null,
  capability_id uuid unique references ref.insight_capabilities(id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_products_key_ck check (
    product_key = lower(product_key)
    and product_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint insight_products_name_ck check (length(btrim(product_name)) > 0),
  constraint insight_products_short_name_ck check (length(btrim(product_short_name)) > 0),
  constraint insight_products_status_ck check (
    product_status in ('in_service', 'in_review', 'planned', 'retired')
  )
);

alter table core.companies
  add column if not exists provisioning_status text not null default 'claimed';

alter table core.companies
  drop constraint if exists companies_provisioning_status_ck;

alter table core.companies
  add constraint companies_provisioning_status_ck check (
    provisioning_status in ('provisioned', 'invited', 'claimed')
  );

alter table core.companies
  alter column contact_email drop not null;

alter table core.companies
  drop constraint if exists companies_contact_email_ck;

alter table core.companies
  add constraint companies_contact_email_ck check (
    (provisioning_status = 'provisioned' and contact_email is null)
    or (
      contact_email is not null
      and length(btrim(contact_email)) > 0
    )
  );

create table if not exists core.company_product (
  company_id uuid not null references core.companies(id) on delete cascade,
  product_id uuid not null references ref.insight_products(id) on delete restrict,
  participation_status text not null default 'active',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, product_id),
  constraint company_product_status_ck check (
    participation_status in ('active', 'review', 'planned', 'suspended', 'ended')
  ),
  constraint company_product_dates_ck check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  )
);

create index if not exists company_product_product_status_idx
  on core.company_product (product_id, participation_status, company_id);

create table if not exists core.company_external_reference (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  source_system text not null,
  source_entity_type text not null,
  source_record_id text not null,
  source_code text,
  created_at timestamptz not null default now(),
  constraint company_external_reference_source_ck check (
    length(btrim(source_system)) > 0
    and length(btrim(source_entity_type)) > 0
    and length(btrim(source_record_id)) > 0
  ),
  constraint company_external_reference_source_uk unique (
    source_system,
    source_entity_type,
    source_record_id
  ),
  constraint company_external_reference_company_source_uk unique (
    company_id,
    source_system,
    source_entity_type
  )
);

create index if not exists company_external_reference_company_idx
  on core.company_external_reference (company_id, source_system);

create table if not exists core.company_location (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  location_code text not null,
  location_name text not null,
  location_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_location_code_ck check (length(btrim(location_code)) > 0),
  constraint company_location_name_ck check (length(btrim(location_name)) > 0),
  constraint company_location_status_ck check (
    location_status in ('active', 'inactive', 'closed')
  ),
  constraint company_location_company_code_uk unique (company_id, location_code),
  constraint company_location_id_company_uk unique (id, company_id)
);

create index if not exists company_location_company_status_idx
  on core.company_location (company_id, location_status, location_code);

create table if not exists core.company_location_external_reference (
  id uuid primary key default gen_random_uuid(),
  company_location_id uuid not null references core.company_location(id) on delete restrict,
  source_system text not null,
  source_record_id text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint company_location_external_reference_source_ck check (
    length(btrim(source_system)) > 0
    and length(btrim(source_record_id)) > 0
  ),
  constraint company_location_external_reference_source_uk unique (
    source_system,
    source_record_id
  ),
  constraint company_location_external_reference_location_source_uk unique (
    company_location_id,
    source_system
  )
);

create index if not exists company_location_external_reference_location_idx
  on core.company_location_external_reference (company_location_id, source_system);

create table if not exists core.company_product_location (
  company_id uuid not null,
  product_id uuid not null,
  company_location_id uuid not null,
  location_status text not null default 'active',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, company_location_id),
  constraint company_product_location_product_fk
    foreign key (company_id, product_id)
    references core.company_product(company_id, product_id)
    on delete cascade,
  constraint company_product_location_company_fk
    foreign key (company_location_id, company_id)
    references core.company_location(id, company_id)
    on delete restrict,
  constraint company_product_location_status_ck check (
    location_status in ('active', 'inactive', 'closed')
  ),
  constraint company_product_location_dates_ck check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  )
);

create index if not exists company_product_location_company_idx
  on core.company_product_location (company_id, product_id, location_status);

alter table core.company_roster
  add column if not exists company_location_id uuid;

alter table core.company_roster
  drop constraint if exists company_roster_location_company_fk;

alter table core.company_roster
  add constraint company_roster_location_company_fk
  foreign key (company_location_id, company_id)
  references core.company_location(id, company_id)
  on delete restrict;

create index if not exists company_roster_company_location_idx
  on core.company_roster (company_id, company_location_id)
  where company_location_id is not null;

create or replace function core.sync_company_roster_location()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_location core.company_location%rowtype;
begin
  if new.company_location_id is not null then
    select location.*
    into v_location
    from core.company_location location
    where location.id = new.company_location_id
      and location.company_id = new.company_id
      and location.location_status = 'active';

    if v_location.id is null then
      raise exception 'Roster location must be active and owned by the roster company.';
    end if;

    new.market_code := v_location.location_code;
    return new;
  end if;

  if nullif(btrim(coalesce(new.market_code, '')), '') is not null then
    select location.*
    into v_location
    from core.company_location location
    where location.company_id = new.company_id
      and location.location_code = btrim(new.market_code)
      and location.location_status = 'active'
    limit 1;

    if v_location.id is not null then
      new.company_location_id := v_location.id;
      new.market_code := v_location.location_code;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_company_roster_location_before_write
  on core.company_roster;

create trigger sync_company_roster_location_before_write
before insert or update of company_id, company_location_id, market_code
on core.company_roster
for each row execute function core.sync_company_roster_location();

alter table ref.insight_products enable row level security;
alter table core.company_product enable row level security;
alter table core.company_external_reference enable row level security;
alter table core.company_location enable row level security;
alter table core.company_location_external_reference enable row level security;
alter table core.company_product_location enable row level security;

create policy insight_products_select_authenticated
on ref.insight_products
for select to authenticated
using (is_active);

create policy insight_products_all_platform_owner
on ref.insight_products
for all to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

create policy company_product_select_access
on core.company_product
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_product_all_platform_owner
on core.company_product
for all to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

create policy company_external_reference_all_platform_owner
on core.company_external_reference
for all to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

create policy company_location_select_access
on core.company_location
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_location_all_platform_owner
on core.company_location
for all to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

create policy company_location_external_reference_all_platform_owner
on core.company_location_external_reference
for all to authenticated
using (core.is_platform_owner());

create policy company_product_location_select_access
on core.company_product_location
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

create policy company_product_location_all_platform_owner
on core.company_product_location
for all to authenticated
using (core.is_platform_owner())
with check (core.is_platform_owner());

grant select on ref.insight_products to authenticated;
grant select on core.company_product to authenticated;
grant select on core.company_external_reference to authenticated;
grant select on core.company_location to authenticated;
grant select on core.company_location_external_reference to authenticated;
grant select on core.company_product_location to authenticated;

revoke all on function core.sync_company_roster_location() from public;

insert into ref.insight_products (
  product_key,
  product_name,
  product_short_name,
  product_status,
  capability_id,
  is_active,
  sort_order
)
select
  seed.product_key,
  seed.product_name,
  seed.product_short_name,
  seed.product_status,
  capability.id,
  true,
  seed.sort_order
from (
  values
    (
      'insight-pd-last-mile',
      'Insight - P&D Last Mile',
      'P&D Last Mile',
      'in_service',
      null::text,
      10
    ),
    (
      'insight-telecom-fulfillment',
      'Insight - Telecom Fulfillment',
      'Telecom Fulfillment',
      'in_review',
      'insight-telecom-fulfillment',
      20
    ),
    (
      'utility-locate-service',
      'Utility Locate Service',
      'Utility Locate',
      'planned',
      null::text,
      30
    )
) as seed (
  product_key,
  product_name,
  product_short_name,
  product_status,
  capability_key,
  sort_order
)
left join ref.insight_capabilities capability
  on capability.capability_key = seed.capability_key
on conflict (product_key) do update
set
  product_name = excluded.product_name,
  product_short_name = excluded.product_short_name,
  product_status = excluded.product_status,
  capability_id = excluded.capability_id,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into core.companies (
  company_name,
  company_slug,
  company_status,
  primary_industry_id,
  contact_email,
  provisioning_status
)
select
  'Integrated Tech Group',
  'integrated-tech-group',
  'active',
  industry.id,
  null,
  'provisioned'
from ref.industries industry
where industry.industry_key = 'telecom-fulfillment'
on conflict (company_slug) do nothing;

insert into core.company_external_reference (
  company_id,
  source_system,
  source_entity_type,
  source_record_id,
  source_code
)
select
  company.id,
  'itg-insight',
  'company',
  '11267b34-dfff-4792-8c27-138fdc185bc5',
  'ITG'
from core.companies company
where company.company_slug = 'integrated-tech-group'
on conflict (source_system, source_entity_type, source_record_id) do update
set
  company_id = excluded.company_id,
  source_code = excluded.source_code;

insert into core.company_product (
  company_id,
  product_id,
  participation_status,
  starts_on
)
select
  company.id,
  product.id,
  seed.participation_status,
  current_date
from (
  values
    ('beacon-point-ventures', 'insight-pd-last-mile', 'active'),
    ('integrated-tech-group', 'insight-telecom-fulfillment', 'active')
) as seed (company_slug, product_key, participation_status)
join core.companies company
  on company.company_slug = seed.company_slug
join ref.insight_products product
  on product.product_key = seed.product_key
on conflict (company_id, product_id) do update
set
  participation_status = excluded.participation_status,
  ends_on = null,
  updated_at = now();

insert into core.company_capability_entitlement (
  company_id,
  capability_id,
  entitlement_status,
  entitlement_source,
  source_reference
)
select
  company.id,
  capability.id,
  'active',
  'included',
  'commercial-itf-foundation'
from core.companies company
join ref.insight_capabilities capability
  on capability.capability_key = 'insight-telecom-fulfillment'
where company.company_slug = 'integrated-tech-group'
  and not exists (
    select 1
    from core.company_capability_entitlement entitlement
    where entitlement.company_id = company.id
      and entitlement.capability_id = capability.id
      and entitlement.engagement_id is null
      and entitlement.entitlement_status in ('pending', 'active', 'suspended')
  );

insert into core.company_location (
  company_id,
  location_code,
  location_name,
  location_status
)
select
  company.id,
  seed.location_code,
  seed.location_name,
  'active'
from core.companies company
cross join (
  values
    ('410', 'Keystone'),
    ('427', 'Freedom')
) as seed (location_code, location_name)
where company.company_slug = 'integrated-tech-group'
on conflict (company_id, location_code) do update
set
  location_name = excluded.location_name,
  location_status = excluded.location_status,
  updated_at = now();

insert into core.company_location_external_reference (
  company_location_id,
  source_system,
  source_record_id,
  source_payload
)
select
  location.id,
  'itg-insight',
  seed.pc_org_id,
  jsonb_build_object(
    'pc_org_id', seed.pc_org_id,
    'pc_org_name', seed.location_code,
    'fulfillment_center_id', seed.fulfillment_center_id,
    'fulfillment_center_name', seed.location_name,
    'mso_id', 'bfdc6ac5-a0a1-4726-a646-d4309fbb473c',
    'region_id', seed.region_id,
    'division_id', 'dfd72d14-5819-41c1-aadd-6edcb8e64155'
  )
from (
  values
    (
      '410',
      'Keystone',
      'c119b47b-bdd4-46a1-b60d-632e3690d62d',
      '189931101',
      'a7780e8e-ac83-462e-9c5d-71d7dbd6f96d'
    ),
    (
      '427',
      'Freedom',
      '9711723d-c727-44c6-9269-b80779eb3f55',
      '84991000',
      '70ed5013-c0da-4d1c-90b2-56aacbd2a3e1'
    )
) as seed (
  location_code,
  location_name,
  pc_org_id,
  fulfillment_center_id,
  region_id
)
join core.companies company
  on company.company_slug = 'integrated-tech-group'
join core.company_location location
  on location.company_id = company.id
  and location.location_code = seed.location_code
on conflict (source_system, source_record_id) do update
set
  company_location_id = excluded.company_location_id,
  source_payload = excluded.source_payload;

insert into core.company_product_location (
  company_id,
  product_id,
  company_location_id,
  location_status,
  starts_on
)
select
  company.id,
  product.id,
  location.id,
  'active',
  current_date
from core.companies company
join core.company_product company_product
  on company_product.company_id = company.id
join ref.insight_products product
  on product.id = company_product.product_id
  and product.product_key = 'insight-telecom-fulfillment'
join core.company_location location
  on location.company_id = company.id
  and location.location_code in ('410', '427')
where company.company_slug = 'integrated-tech-group'
on conflict (product_id, company_location_id) do update
set
  company_id = excluded.company_id,
  location_status = excluded.location_status,
  ends_on = null,
  updated_at = now();

create or replace function public.platform_product_catalog()
returns table (
  product_key text,
  product_name text,
  product_short_name text,
  product_status text,
  company_count bigint
)
language plpgsql
stable
security definer
set search_path = public, core, ref
as $$
begin
  if auth.uid() is null or not core.is_platform_owner() then
    raise exception 'Platform owner access required.' using errcode = '42501';
  end if;

  return query
  select
    product.product_key,
    product.product_name,
    product.product_short_name,
    product.product_status,
    count(company_product.company_id) filter (
      where company_product.participation_status in ('active', 'review', 'planned')
    ) as company_count
  from ref.insight_products product
  left join core.company_product company_product
    on company_product.product_id = product.id
  where product.is_active
  group by
    product.id,
    product.product_key,
    product.product_name,
    product.product_short_name,
    product.product_status,
    product.sort_order
  order by product.sort_order, product.product_name;
end;
$$;

create or replace function public.platform_product_companies(p_product_key text)
returns table (
  id uuid,
  company_name text,
  company_slug text,
  company_status text,
  provisioning_status text,
  participation_status text,
  location_count bigint
)
language plpgsql
stable
security definer
set search_path = public, core, ref
as $$
begin
  if auth.uid() is null or not core.is_platform_owner() then
    raise exception 'Platform owner access required.' using errcode = '42501';
  end if;

  return query
  select
    company.id,
    company.company_name,
    company.company_slug,
    company.company_status,
    company.provisioning_status,
    company_product.participation_status,
    count(product_location.company_location_id) filter (
      where product_location.location_status = 'active'
    ) as location_count
  from ref.insight_products product
  join core.company_product company_product
    on company_product.product_id = product.id
    and company_product.participation_status in ('active', 'review', 'planned')
  join core.companies company
    on company.id = company_product.company_id
    and company.company_status = 'active'
  left join core.company_product_location product_location
    on product_location.company_id = company_product.company_id
    and product_location.product_id = company_product.product_id
  where product.product_key = lower(btrim(p_product_key))
    and product.is_active
  group by
    company.id,
    company.company_name,
    company.company_slug,
    company.company_status,
    company.provisioning_status,
    company_product.participation_status
  order by company.company_name;
end;
$$;

revoke all on function public.platform_product_catalog() from public;
revoke all on function public.platform_product_catalog() from anon;
grant execute on function public.platform_product_catalog() to authenticated;

revoke all on function public.platform_product_companies(text) from public;
revoke all on function public.platform_product_companies(text) from anon;
grant execute on function public.platform_product_companies(text) to authenticated;
