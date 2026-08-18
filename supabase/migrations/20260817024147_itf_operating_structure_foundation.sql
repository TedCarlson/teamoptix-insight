begin;

create table if not exists core.company_operating_division (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  division_name text not null,
  division_code text not null,
  division_status text not null default 'active',
  source_system text,
  source_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_operating_division_name_ck check (length(btrim(division_name)) > 0),
  constraint company_operating_division_code_ck check (length(btrim(division_code)) > 0),
  constraint company_operating_division_status_ck check (
    division_status in ('active', 'inactive', 'closed')
  ),
  constraint company_operating_division_company_code_uk unique (company_id, division_code),
  constraint company_operating_division_id_company_uk unique (id, company_id)
);

create unique index if not exists company_operating_division_source_uk
  on core.company_operating_division(source_system, source_record_id)
  where source_system is not null and source_record_id is not null;

create table if not exists core.company_operating_region (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  division_id uuid not null,
  region_name text not null,
  region_code text not null,
  region_status text not null default 'active',
  source_system text,
  source_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_operating_region_division_fk
    foreign key (division_id, company_id)
    references core.company_operating_division(id, company_id)
    on delete restrict,
  constraint company_operating_region_name_ck check (length(btrim(region_name)) > 0),
  constraint company_operating_region_code_ck check (length(btrim(region_code)) > 0),
  constraint company_operating_region_status_ck check (
    region_status in ('active', 'inactive', 'closed')
  ),
  constraint company_operating_region_company_code_uk unique (company_id, region_code),
  constraint company_operating_region_id_company_uk unique (id, company_id)
);

create index if not exists company_operating_region_division_status_idx
  on core.company_operating_region(company_id, division_id, region_status, region_name);

create unique index if not exists company_operating_region_source_uk
  on core.company_operating_region(source_system, source_record_id)
  where source_system is not null and source_record_id is not null;

create table if not exists core.company_location_region_assignment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete restrict,
  company_location_id uuid not null,
  company_region_id uuid not null,
  starts_on date,
  ends_on date,
  assignment_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_location_region_assignment_location_fk
    foreign key (company_location_id, company_id)
    references core.company_location(id, company_id)
    on delete restrict,
  constraint company_location_region_assignment_region_fk
    foreign key (company_region_id, company_id)
    references core.company_operating_region(id, company_id)
    on delete restrict,
  constraint company_location_region_assignment_dates_ck check (
    ends_on is null or starts_on is null or ends_on >= starts_on
  ),
  constraint company_location_region_assignment_status_ck check (
    assignment_status in ('active', 'ended')
  )
);

create unique index if not exists company_location_region_open_assignment_uk
  on core.company_location_region_assignment(company_location_id)
  where ends_on is null;

create index if not exists company_location_region_effective_idx
  on core.company_location_region_assignment(
    company_id,
    company_location_id,
    starts_on,
    ends_on
  );

alter table core.company_operating_division enable row level security;
alter table core.company_operating_region enable row level security;
alter table core.company_location_region_assignment enable row level security;

drop policy if exists company_operating_division_select_access
  on core.company_operating_division;
create policy company_operating_division_select_access
on core.company_operating_division
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

drop policy if exists company_operating_division_write_admin
  on core.company_operating_division;
create policy company_operating_division_write_admin
on core.company_operating_division
for all to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));

drop policy if exists company_operating_region_select_access
  on core.company_operating_region;
create policy company_operating_region_select_access
on core.company_operating_region
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

drop policy if exists company_operating_region_write_admin
  on core.company_operating_region;
create policy company_operating_region_write_admin
on core.company_operating_region
for all to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));

drop policy if exists company_location_region_assignment_select_access
  on core.company_location_region_assignment;
create policy company_location_region_assignment_select_access
on core.company_location_region_assignment
for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id));

drop policy if exists company_location_region_assignment_write_admin
  on core.company_location_region_assignment;
create policy company_location_region_assignment_write_admin
on core.company_location_region_assignment
for all to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id));

revoke all on table core.company_operating_division from public, anon;
revoke all on table core.company_operating_region from public, anon;
revoke all on table core.company_location_region_assignment from public, anon;
grant select, insert, update on table core.company_operating_division to authenticated;
grant select, insert, update on table core.company_operating_region to authenticated;
grant select, insert, update on table core.company_location_region_assignment to authenticated;

insert into core.company_operating_division (
  company_id,
  division_name,
  division_code,
  division_status,
  source_system,
  source_record_id
)
select
  company.id,
  'Northeast',
  'NEDIV',
  'active',
  'itg-insight',
  'dfd72d14-5819-41c1-aadd-6edcb8e64155'
from core.companies company
where company.company_slug = 'integrated-tech-group'
on conflict (company_id, division_code) do update
set
  division_name = excluded.division_name,
  division_status = 'active',
  source_system = excluded.source_system,
  source_record_id = excluded.source_record_id,
  updated_at = now();

insert into core.company_operating_region (
  company_id,
  division_id,
  region_name,
  region_code,
  region_status,
  source_system,
  source_record_id
)
select
  company.id,
  division.id,
  seed.region_name,
  seed.region_code,
  'active',
  'itg-insight',
  seed.source_record_id
from core.companies company
join core.company_operating_division division
  on division.company_id = company.id
 and division.division_code = 'NEDIV'
cross join (
  values
    ('Keystone', 'KSR', 'a7780e8e-ac83-462e-9c5d-71d7dbd6f96d'),
    ('Freedom', 'FDR', '70ed5013-c0da-4d1c-90b2-56aacbd2a3e1')
) as seed(region_name, region_code, source_record_id)
where company.company_slug = 'integrated-tech-group'
on conflict (company_id, region_code) do update
set
  division_id = excluded.division_id,
  region_name = excluded.region_name,
  region_status = 'active',
  source_system = excluded.source_system,
  source_record_id = excluded.source_record_id,
  updated_at = now();

-- Keystone and Freedom are regions, not location names. The durable location
-- facts are the PC codes 410 and 427.
update core.company_location location
set
  location_name = location.location_code,
  updated_at = now()
from core.companies company
where company.id = location.company_id
  and company.company_slug = 'integrated-tech-group'
  and location.location_code in ('410', '427');

insert into core.company_location_region_assignment (
  company_id,
  company_location_id,
  company_region_id,
  starts_on,
  ends_on,
  assignment_status
)
select
  company.id,
  location.id,
  region.id,
  null,
  null,
  'active'
from core.companies company
join core.company_location location
  on location.company_id = company.id
join core.company_operating_region region
  on region.company_id = company.id
 and region.region_code = case location.location_code
   when '410' then 'KSR'
   when '427' then 'FDR'
 end
where company.company_slug = 'integrated-tech-group'
  and location.location_code in ('410', '427')
on conflict (company_location_id) where ends_on is null do update
set
  company_region_id = excluded.company_region_id,
  assignment_status = 'active',
  updated_at = now();

create or replace view public.itf_company_region_v
with (security_invoker = true)
as
select
  region.id as region_id,
  region.company_id,
  company.company_name,
  company.company_slug,
  division.id as division_id,
  division.division_name,
  division.division_code,
  region.region_name,
  region.region_code,
  region.region_status
from core.company_operating_region region
join core.company_operating_division division
  on division.id = region.division_id
 and division.company_id = region.company_id
join core.companies company
  on company.id = region.company_id
join core.company_product company_product
  on company_product.company_id = company.id
 and company_product.participation_status in ('active', 'review')
join ref.insight_products product
  on product.id = company_product.product_id
 and product.product_key = 'insight-telecom-fulfillment';

create or replace view public.itf_company_workforce_unit_v
with (security_invoker = true)
as
select
  location.id as location_id,
  location.company_id,
  company.company_name,
  company.company_slug,
  location.location_code,
  location.location_name,
  location.location_status,
  division.id as division_id,
  division.division_name,
  division.division_code,
  region.id as region_id,
  region.region_name,
  region.region_code,
  assignment.starts_on as region_starts_on,
  assignment.ends_on as region_ends_on
from core.company_location location
join core.companies company
  on company.id = location.company_id
join core.company_product_location product_location
  on product_location.company_location_id = location.id
 and product_location.company_id = location.company_id
 and product_location.location_status = 'active'
join ref.insight_products product
  on product.id = product_location.product_id
 and product.product_key = 'insight-telecom-fulfillment'
left join core.company_location_region_assignment assignment
  on assignment.company_location_id = location.id
 and assignment.company_id = location.company_id
 and (assignment.starts_on is null or assignment.starts_on <= current_date)
 and (assignment.ends_on is null or assignment.ends_on >= current_date)
left join core.company_operating_region region
  on region.id = assignment.company_region_id
 and region.company_id = assignment.company_id
left join core.company_operating_division division
  on division.id = region.division_id
 and division.company_id = region.company_id;

comment on view public.itf_company_workforce_unit_v is
  'Current ITF workforce units composed from stable company locations and effective-dated region/division assignments.';

revoke all on table public.itf_company_region_v from public, anon;
revoke all on table public.itf_company_workforce_unit_v from public, anon;
grant select on table public.itf_company_region_v to authenticated;
grant select on table public.itf_company_workforce_unit_v to authenticated;

create or replace function public.itf_create_company_region(
  p_company_slug text,
  p_division_id uuid,
  p_region_name text,
  p_region_code text
)
returns table (
  region_id uuid,
  division_id uuid,
  division_name text,
  division_code text,
  region_name text,
  region_code text,
  region_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_division core.company_operating_division%rowtype;
  v_region core.company_operating_region%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_region_name, '')), '') is null
     or nullif(btrim(coalesce(p_region_code, '')), '') is null then
    raise exception 'Region name and code are required.';
  end if;

  select division.* into v_division
  from core.company_operating_division division
  where division.id = p_division_id
    and division.company_id = v_company_id
    and division.division_status = 'active';

  if v_division.id is null then
    raise exception 'Active company division not found.';
  end if;

  insert into core.company_operating_region (
    company_id,
    division_id,
    region_name,
    region_code,
    region_status
  )
  values (
    v_company_id,
    v_division.id,
    btrim(p_region_name),
    upper(btrim(p_region_code)),
    'active'
  )
  on conflict (company_id, region_code) do update
  set
    division_id = excluded.division_id,
    region_name = excluded.region_name,
    region_status = 'active',
    updated_at = now()
  returning * into v_region;

  return query
  select
    v_region.id,
    v_division.id,
    v_division.division_name,
    v_division.division_code,
    v_region.region_name,
    v_region.region_code,
    v_region.region_status;
end;
$$;

create or replace function public.itf_assign_company_location_region(
  p_company_slug text,
  p_location_id uuid,
  p_region_id uuid,
  p_effective_from date default current_date
)
returns table (
  location_id uuid,
  location_code text,
  location_name text,
  division_id uuid,
  division_name text,
  division_code text,
  region_id uuid,
  region_name text,
  region_code text,
  effective_from date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_location core.company_location%rowtype;
  v_region core.company_operating_region%rowtype;
  v_division core.company_operating_division%rowtype;
  v_effective_from date := coalesce(p_effective_from, current_date);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  select location.* into v_location
  from core.company_location location
  where location.id = p_location_id
    and location.company_id = v_company_id
    and location.location_status = 'active';

  select region.* into v_region
  from core.company_operating_region region
  where region.id = p_region_id
    and region.company_id = v_company_id
    and region.region_status = 'active';

  if v_location.id is null or v_region.id is null then
    raise exception 'Active company location and region are required.';
  end if;

  select division.* into v_division
  from core.company_operating_division division
  where division.id = v_region.division_id;

  if exists (
    select 1
    from core.company_location_region_assignment assignment
    where assignment.company_location_id = v_location.id
      and assignment.company_region_id = v_region.id
      and (assignment.starts_on is null or assignment.starts_on <= v_effective_from)
      and (assignment.ends_on is null or assignment.ends_on >= v_effective_from)
  ) then
    return query select
      v_location.id,
      v_location.location_code,
      v_location.location_name,
      v_division.id,
      v_division.division_name,
      v_division.division_code,
      v_region.id,
      v_region.region_name,
      v_region.region_code,
      v_effective_from;
    return;
  end if;

  if exists (
    select 1
    from core.company_location_region_assignment assignment
    where assignment.company_location_id = v_location.id
      and assignment.starts_on is not null
      and assignment.starts_on > current_date
  ) then
    raise exception 'This location already has a future regional assignment.';
  end if;

  update core.company_location_region_assignment assignment
  set
    ends_on = v_effective_from - 1,
    assignment_status = case when v_effective_from <= current_date then 'ended' else 'active' end,
    updated_at = now()
  where assignment.company_location_id = v_location.id
    and assignment.ends_on is null;

  insert into core.company_location_region_assignment (
    company_id,
    company_location_id,
    company_region_id,
    starts_on,
    ends_on,
    assignment_status
  )
  values (
    v_company_id,
    v_location.id,
    v_region.id,
    v_effective_from,
    null,
    'active'
  );

  return query select
    v_location.id,
    v_location.location_code,
    v_location.location_name,
    v_division.id,
    v_division.division_name,
    v_division.division_code,
    v_region.id,
    v_region.region_name,
    v_region.region_code,
    v_effective_from;
end;
$$;

revoke all on function public.itf_create_company_region(text, uuid, text, text)
  from public, anon;
revoke all on function public.itf_assign_company_location_region(text, uuid, uuid, date)
  from public, anon;
grant execute on function public.itf_create_company_region(text, uuid, text, text)
  to authenticated;
grant execute on function public.itf_assign_company_location_region(text, uuid, uuid, date)
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
  office.sub_region as office_sub_region,
  roster.seat_type,
  division.id as division_id,
  division.division_name,
  division.division_code,
  region.id as region_id,
  region.region_name,
  region.region_code
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
left join core.company_location_region_assignment region_assignment
  on region_assignment.company_location_id = roster.company_location_id
 and (region_assignment.starts_on is null or region_assignment.starts_on <= current_date)
 and (region_assignment.ends_on is null or region_assignment.ends_on >= current_date)
left join core.company_operating_region region
  on region.id = region_assignment.company_region_id
left join core.company_operating_division division
  on division.id = region.division_id
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
  'Company-authorized ITF roster projection with current division, effective region, stable location, office, seat, reporting line, and provenance.';

revoke all on table public.itf_company_roster_v from public, anon;
grant select on table public.itf_company_roster_v to authenticated;

do $$
declare
  v_structure_count integer;
begin
  select count(*) into v_structure_count
  from public.itf_company_workforce_unit_v unit
  where unit.company_slug = 'integrated-tech-group'
    and (
      (
        unit.location_code = '410'
        and unit.location_name = '410'
        and unit.division_name = 'Northeast'
        and unit.division_code = 'NEDIV'
        and unit.region_name = 'Keystone'
        and unit.region_code = 'KSR'
      )
      or (
        unit.location_code = '427'
        and unit.location_name = '427'
        and unit.division_name = 'Northeast'
        and unit.division_code = 'NEDIV'
        and unit.region_name = 'Freedom'
        and unit.region_code = 'FDR'
      )
    );

  if v_structure_count <> 2 then
    raise exception 'Expected both current ITG workforce-unit joins, found %.',
      v_structure_count;
  end if;
end;
$$;

commit;
