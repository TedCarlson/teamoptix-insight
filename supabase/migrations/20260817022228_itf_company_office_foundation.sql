begin;

create table if not exists core.company_location_office (
  id uuid primary key default gen_random_uuid(),
  company_location_id uuid not null references core.company_location(id) on delete restrict,
  office_name text not null,
  office_name_normalized text generated always as (lower(btrim(office_name))) stored,
  address text,
  sub_region text,
  office_status text not null default 'active',
  source_system text,
  source_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_location_office_name_ck check (length(btrim(office_name)) > 0),
  constraint company_location_office_status_ck check (
    office_status in ('active', 'inactive', 'closed')
  ),
  constraint company_location_office_source_ck check (
    (source_system is null and source_record_id is null)
    or (
      length(btrim(source_system)) > 0
      and length(btrim(source_record_id)) > 0
    )
  ),
  constraint company_location_office_location_name_uk unique (
    company_location_id,
    office_name_normalized
  ),
  constraint company_location_office_id_location_uk unique (
    id,
    company_location_id
  )
);

create unique index if not exists company_location_office_source_uk
  on core.company_location_office (source_system, source_record_id)
  where source_system is not null and source_record_id is not null;

create index if not exists company_location_office_location_status_idx
  on core.company_location_office (company_location_id, office_status, office_name);

alter table core.company_roster
  add column if not exists company_location_office_id uuid;

alter table core.company_roster
  drop constraint if exists company_roster_office_location_fk;

alter table core.company_roster
  add constraint company_roster_office_location_fk
  foreign key (company_location_office_id, company_location_id)
  references core.company_location_office(id, company_location_id)
  on delete restrict;

alter table core.company_roster
  drop constraint if exists company_roster_office_requires_location_ck;

alter table core.company_roster
  add constraint company_roster_office_requires_location_ck check (
    company_location_office_id is null or company_location_id is not null
  );

create index if not exists company_roster_company_office_idx
  on core.company_roster (company_id, company_location_id, company_location_office_id)
  where company_location_office_id is not null;

alter table core.company_location_office enable row level security;

create policy company_location_office_select_access
on core.company_location_office
for select to authenticated
using (
  exists (
    select 1
    from core.company_location location
    where location.id = company_location_office.company_location_id
      and (
        core.is_platform_owner()
        or core.can_access_company(location.company_id)
      )
  )
);

create policy company_location_office_insert_admin
on core.company_location_office
for insert to authenticated
with check (
  exists (
    select 1
    from core.company_location location
    where location.id = company_location_office.company_location_id
      and (
        core.is_platform_owner()
        or core.can_admin_company(location.company_id)
      )
  )
);

create policy company_location_office_update_admin
on core.company_location_office
for update to authenticated
using (
  exists (
    select 1
    from core.company_location location
    where location.id = company_location_office.company_location_id
      and (
        core.is_platform_owner()
        or core.can_admin_company(location.company_id)
      )
  )
)
with check (
  exists (
    select 1
    from core.company_location location
    where location.id = company_location_office.company_location_id
      and (
        core.is_platform_owner()
        or core.can_admin_company(location.company_id)
      )
  )
);

revoke all on table core.company_location_office from public, anon;
grant select, insert, update on table core.company_location_office to authenticated;

insert into core.company_location_office (
  company_location_id,
  office_name,
  address,
  sub_region,
  office_status,
  source_system,
  source_record_id
)
select
  location.id,
  seed.office_name,
  seed.address,
  null,
  'active',
  'itg-insight',
  seed.source_record_id
from core.companies company
join core.company_location location
  on location.company_id = company.id
join (
  values
    ('410', 'Harrisburg', '8000 Derry St, Harrisburg, PA 17111', '6113f011-f44e-48f0-b758-d004ea8331f5'),
    ('410', 'Pittsburgh', '630 Ardmore Blvd, Pittsburgh, PA 15221', '8f97d338-15fe-466e-848a-4d1dda186abf'),
    ('410', 'Scranton', '433 Lawrence St, Old Forge, PA 18518', '9c7bf2b5-02fa-459e-8e28-a3c8e29bea56'),
    ('427', 'Edison', '216 Tingley Ln, Edison, New Jersey 08820', 'ecb42e60-f0c5-4e7e-a19f-f6f926305bdc'),
    ('427', 'Egg Harbor', '2727 Fire Rd, Egg Harbor Twp, NJ 08234', 'daa83ceb-86cb-4d57-a65c-f3c6cb1c43a3')
) as seed (location_code, office_name, address, source_record_id)
  on seed.location_code = location.location_code
where company.company_slug = 'integrated-tech-group'
on conflict (company_location_id, office_name_normalized) do update
set
  office_name = excluded.office_name,
  address = excluded.address,
  office_status = 'active',
  source_system = excluded.source_system,
  source_record_id = excluded.source_record_id,
  updated_at = now();

with donor_office as (
  select distinct on (event.roster_id)
    event.roster_id,
    event.event_metadata ->> 'office_name' as office_name
  from core.company_roster_event event
  where event.event_type = 'donor_roster_imported'
  order by event.roster_id, event.occurred_at desc, event.created_at desc
)
update core.company_roster roster
set company_location_office_id = office.id
from donor_office
join core.company_location_office office
  on office.office_name_normalized = lower(btrim(donor_office.office_name))
where roster.id = donor_office.roster_id
  and roster.company_location_id = office.company_location_id
  and nullif(btrim(coalesce(donor_office.office_name, '')), '') is not null;

create or replace view public.itf_company_office_v
with (security_invoker = true)
as
select
  office.id as office_id,
  office.company_location_id,
  location.company_id,
  company.company_name,
  company.company_slug,
  location.location_code,
  location.location_name,
  office.office_name,
  office.address,
  office.sub_region,
  office.office_status
from core.company_location_office office
join core.company_location location
  on location.id = office.company_location_id
join core.companies company
  on company.id = location.company_id
join core.company_product company_product
  on company_product.company_id = company.id
 and company_product.participation_status in ('active', 'review')
join ref.insight_products product
  on product.id = company_product.product_id
 and product.product_key = 'insight-telecom-fulfillment';

comment on view public.itf_company_office_v is
  'Company-authorized ITF office options nested beneath commercial company locations.';

revoke all on table public.itf_company_office_v from public, anon;
grant select on table public.itf_company_office_v to authenticated;

create or replace function public.itf_create_company_office(
  p_company_slug text,
  p_location_code text,
  p_office_name text,
  p_address text default null,
  p_sub_region text default null
)
returns table (
  office_id uuid,
  company_location_id uuid,
  location_code text,
  location_name text,
  office_name text,
  address text,
  sub_region text,
  office_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_location core.company_location%rowtype;
  v_office core.company_location_office%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_company_slug, '')), '') is null
     or nullif(btrim(coalesce(p_location_code, '')), '') is null
     or nullif(btrim(coalesce(p_office_name, '')), '') is null then
    raise exception 'Company, primary location, and office name are required.';
  end if;

  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (
    core.is_platform_owner()
    or core.can_admin_company(v_company_id)
  ) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  select location.*
  into v_location
  from core.company_location location
  where location.company_id = v_company_id
    and location.location_code = btrim(p_location_code)
    and location.location_status = 'active';

  if v_location.id is null then
    raise exception 'Active primary location not found.';
  end if;

  insert into core.company_location_office (
    company_location_id,
    office_name,
    address,
    sub_region,
    office_status
  )
  values (
    v_location.id,
    btrim(p_office_name),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_sub_region, '')), ''),
    'active'
  )
  on conflict (company_location_id, office_name_normalized) do update
  set
    office_name = excluded.office_name,
    address = coalesce(excluded.address, company_location_office.address),
    sub_region = coalesce(excluded.sub_region, company_location_office.sub_region),
    office_status = 'active',
    updated_at = now()
  returning * into v_office;

  return query
  select
    v_office.id,
    v_office.company_location_id,
    v_location.location_code,
    v_location.location_name,
    v_office.office_name,
    v_office.address,
    v_office.sub_region,
    v_office.office_status;
end;
$$;

revoke all on function public.itf_create_company_office(text, text, text, text, text)
  from public, anon;
grant execute on function public.itf_create_company_office(text, text, text, text, text)
  to authenticated;

create or replace view public.itf_company_roster_v
with (security_invoker = true)
as
select
  roster.id as roster_member_id,
  roster.company_id,
  company.company_name,
  company.company_slug,
  roster.profile_id,
  roster.full_name,
  roster.email,
  roster.phone,
  roster.worker_type,
  roster.job_title,
  roster.employment_status,
  roster.company_location_id,
  location.location_code,
  location.location_name,
  roster.reports_to_roster_id,
  supervisor.full_name as reports_to_name,
  identifiers.tech_id,
  identifiers.fuse_emp_id,
  identifiers.nt_login,
  identifiers.csg,
  identifiers.legacy_person_id,
  identifiers.legacy_assignment_id,
  import_event.event_metadata ->> 'office_name' as donor_office_name,
  provenance.entry_channel,
  provenance.source_system,
  provenance.source_record_id,
  case
    when provenance.entry_channel = 'donor_migration' then 'Donor import'
    when provenance.entered_by_company_id = roster.company_id then 'Company added'
    else 'Added on behalf'
  end as source_label,
  office.id as office_id,
  office.office_name,
  office.address as office_address,
  office.sub_region as office_sub_region
from core.company_roster roster
join core.companies company
  on company.id = roster.company_id
join core.company_product company_product
  on company_product.company_id = company.id
 and company_product.participation_status in ('active', 'review')
join ref.insight_products product
  on product.id = company_product.product_id
 and product.product_key = 'insight-telecom-fulfillment'
left join core.company_location location
  on location.id = roster.company_location_id
left join core.company_location_office office
  on office.id = roster.company_location_office_id
 and office.company_location_id = roster.company_location_id
left join core.company_roster supervisor
  on supervisor.id = roster.reports_to_roster_id
left join core.company_roster_entry_provenance provenance
  on provenance.roster_id = roster.id
left join lateral (
  select
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'tech_id') as tech_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'fuse_emp_id') as fuse_emp_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'nt_login') as nt_login,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'csg') as csg,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_person_id') as legacy_person_id,
    max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_assignment_id') as legacy_assignment_id
  from core.company_roster_identifier identifier
  where identifier.roster_id = roster.id
) identifiers on true
left join lateral (
  select event.event_metadata
  from core.company_roster_event event
  where event.roster_id = roster.id
    and event.event_type = 'donor_roster_imported'
  order by event.occurred_at desc, event.created_at desc
  limit 1
) import_event on true;

comment on view public.itf_company_roster_v is
  'Company-authorized ITF roster projection composed from the platform roster, telecom identifiers, primary location, office, reporting line, and provenance.';

revoke all on table public.itf_company_roster_v from public, anon;
grant select on table public.itf_company_roster_v to authenticated;

do $$
declare
  v_office_count integer;
  v_assigned_count integer;
begin
  select count(*)
  into v_office_count
  from public.itf_company_office_v office
  where office.company_slug = 'integrated-tech-group';

  if v_office_count <> 5 then
    raise exception 'Expected 5 seeded ITG offices, found %.', v_office_count;
  end if;

  select count(*)
  into v_assigned_count
  from public.itf_company_roster_v roster
  where roster.company_slug = 'integrated-tech-group'
    and roster.office_id is not null;

  if v_assigned_count <> 36 then
    raise exception 'Expected 36 ITG roster office assignments, found %.', v_assigned_count;
  end if;
end;
$$;

commit;
