begin;

-- Event 2: relationship-aware ITF workforce assignments.
-- Companies continue to own their roster.  This event adds the dated seam that
-- projects a company-owned worker into a prime relationship and its locations.

insert into ref.lines_of_business (
  industry_id, lob_key, lob_label, description, sort_order
)
select
  industry.id,
  'fulfillment',
  'Fulfillment',
  'Telecom fulfillment workforce and operating metrics.',
  10
from ref.industries industry
where industry.industry_key = 'telecom-fulfillment'
on conflict (industry_id, lob_key) do update
set lob_label = excluded.lob_label,
    description = excluded.description,
    is_active = true,
    updated_at = now();

create table if not exists core.company_engagement_participant (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references core.company_engagement(id) on delete restrict,
  company_id uuid not null references core.companies(id) on delete restrict,
  upstream_participant_id uuid references core.company_engagement_participant(id) on delete restrict,
  source_relationship_id uuid not null references core.company_relationship(id) on delete restrict,
  reporting_company_id uuid not null references core.companies(id) on delete restrict,
  participant_kind text not null default 'direct_provider',
  participant_status text not null default 'review',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_engagement_participant_kind_ck
    check (participant_kind in ('direct_provider', 'downstream_provider')),
  constraint company_engagement_participant_status_ck
    check (participant_status in ('review', 'active', 'suspended', 'ended')),
  constraint company_engagement_participant_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint company_engagement_participant_path_ck check (
    (participant_kind = 'direct_provider' and upstream_participant_id is null)
    or (participant_kind = 'downstream_provider' and upstream_participant_id is not null)
  ),
  constraint company_engagement_participant_engagement_company_uk
    unique (engagement_id, company_id)
);

create index if not exists company_engagement_participant_company_idx
  on core.company_engagement_participant (company_id, participant_status, engagement_id);
create index if not exists company_engagement_participant_reporting_idx
  on core.company_engagement_participant (reporting_company_id, participant_status, engagement_id);
create index if not exists company_engagement_participant_upstream_idx
  on core.company_engagement_participant (upstream_participant_id)
  where upstream_participant_id is not null;
create index if not exists company_engagement_participant_relationship_idx
  on core.company_engagement_participant (source_relationship_id);

create or replace function core.validate_company_engagement_participant()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_engagement_relationship_id uuid;
  v_principal_company_id uuid;
  v_provider_company_id uuid;
  v_upstream_company_id uuid;
  v_upstream_engagement_id uuid;
  v_upstream_reporting_company_id uuid;
  v_source_principal_company_id uuid;
  v_source_provider_company_id uuid;
begin
  select engagement.relationship_id, relationship.principal_company_id, relationship.provider_company_id
  into v_engagement_relationship_id, v_principal_company_id, v_provider_company_id
  from core.company_engagement engagement
  join core.company_relationship relationship on relationship.id = engagement.relationship_id
  where engagement.id = new.engagement_id;

  select relationship.principal_company_id, relationship.provider_company_id
  into v_source_principal_company_id, v_source_provider_company_id
  from core.company_relationship relationship
  where relationship.id = new.source_relationship_id;

  if new.participant_kind = 'direct_provider' then
    if new.company_id <> v_provider_company_id
       or new.source_relationship_id <> v_engagement_relationship_id
       or new.reporting_company_id <> v_provider_company_id then
      raise exception 'A direct participant must be the engagement provider and report as that provider.';
    end if;
  else
    select participant.company_id, participant.engagement_id, participant.reporting_company_id
    into v_upstream_company_id, v_upstream_engagement_id, v_upstream_reporting_company_id
    from core.company_engagement_participant participant
    where participant.id = new.upstream_participant_id;

    if v_upstream_engagement_id is distinct from new.engagement_id
       or v_source_principal_company_id is distinct from v_upstream_company_id
       or v_source_provider_company_id is distinct from new.company_id
       or new.reporting_company_id is distinct from v_upstream_reporting_company_id then
      raise exception 'A downstream participant must follow an active company relationship through its upstream participant.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_company_engagement_participant_before_write
  on core.company_engagement_participant;
create trigger validate_company_engagement_participant_before_write
before insert or update on core.company_engagement_participant
for each row execute function core.validate_company_engagement_participant();

create table if not exists core.company_engagement_location (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references core.company_engagement(id) on delete restrict,
  principal_company_location_id uuid not null references core.company_location(id) on delete restrict,
  location_status text not null default 'review',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_engagement_location_status_ck
    check (location_status in ('review', 'active', 'suspended', 'ended')),
  constraint company_engagement_location_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint company_engagement_location_uk unique (engagement_id, principal_company_location_id)
);

create index if not exists company_engagement_location_location_idx
  on core.company_engagement_location (principal_company_location_id, location_status);

create or replace function core.validate_company_engagement_location()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if not exists (
    select 1
    from core.company_engagement engagement
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    join core.company_location location
      on location.id = new.principal_company_location_id
     and location.company_id = relationship.principal_company_id
    where engagement.id = new.engagement_id
  ) then
    raise exception 'An engagement location must belong to the principal company.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_company_engagement_location_before_write
  on core.company_engagement_location;
create trigger validate_company_engagement_location_before_write
before insert or update on core.company_engagement_location
for each row execute function core.validate_company_engagement_location();

create table if not exists core.company_engagement_office (
  id uuid primary key default gen_random_uuid(),
  engagement_location_id uuid not null references core.company_engagement_location(id) on delete restrict,
  principal_company_location_office_id uuid not null references core.company_location_office(id) on delete restrict,
  office_status text not null default 'review',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_engagement_office_status_ck
    check (office_status in ('review', 'active', 'suspended', 'ended')),
  constraint company_engagement_office_dates_ck
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint company_engagement_office_uk
    unique (engagement_location_id, principal_company_location_office_id)
);

create index if not exists company_engagement_office_office_idx
  on core.company_engagement_office (principal_company_location_office_id, office_status);

create or replace function core.validate_company_engagement_office()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if not exists (
    select 1
    from core.company_engagement_location engagement_location
    join core.company_location_office office
      on office.id = new.principal_company_location_office_id
     and office.company_location_id = engagement_location.principal_company_location_id
    where engagement_location.id = new.engagement_location_id
  ) then
    raise exception 'An engagement office must belong to its engagement location.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_company_engagement_office_before_write
  on core.company_engagement_office;
create trigger validate_company_engagement_office_before_write
before insert or update on core.company_engagement_office
for each row execute function core.validate_company_engagement_office();

create table if not exists core.itf_workforce_assignment (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references ref.insight_products(id) on delete restrict,
  roster_id uuid not null references core.company_roster(id) on delete restrict,
  roster_company_id uuid not null references core.companies(id) on delete restrict,
  engagement_participant_id uuid references core.company_engagement_participant(id) on delete restrict,
  company_location_id uuid references core.company_location(id) on delete restrict,
  company_location_office_id uuid references core.company_location_office(id) on delete restrict,
  engagement_location_id uuid references core.company_engagement_location(id) on delete restrict,
  engagement_office_id uuid references core.company_engagement_office(id) on delete restrict,
  job_title text not null,
  seat_type text not null,
  assignment_status text not null default 'active',
  reports_to_roster_id uuid references core.company_roster(id) on delete restrict,
  effective_start date not null,
  effective_end date,
  source_channel text not null default 'manual',
  supersedes_assignment_id uuid references core.itf_workforce_assignment(id) on delete restrict,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itf_workforce_assignment_status_ck
    check (assignment_status in ('active', 'pending', 'inactive', 'archived')),
  constraint itf_workforce_assignment_seat_ck
    check (seat_type in ('FIELD', 'LEADERSHIP', 'SUPPORT', 'TRAVEL', 'DROP_BURY', 'TRAINING', 'FMLA')),
  constraint itf_workforce_assignment_dates_ck
    check (effective_end is null or effective_end >= effective_start),
  constraint itf_workforce_assignment_location_path_ck check (
    (
      engagement_participant_id is null
      and engagement_location_id is null
      and engagement_office_id is null
    ) or (
      engagement_participant_id is not null
      and engagement_location_id is not null
      and company_location_id is null
      and company_location_office_id is null
    )
  ),
  constraint itf_workforce_assignment_direct_office_ck
    check (company_location_office_id is null or company_location_id is not null),
  constraint itf_workforce_assignment_engagement_office_ck
    check (engagement_office_id is null or engagement_location_id is not null)
);

create unique index if not exists itf_workforce_assignment_open_uk
  on core.itf_workforce_assignment (product_id, roster_id)
  where effective_end is null;
create index if not exists itf_workforce_assignment_roster_company_idx
  on core.itf_workforce_assignment (roster_company_id, product_id, effective_end, effective_start desc);
create index if not exists itf_workforce_assignment_participant_idx
  on core.itf_workforce_assignment (engagement_participant_id, effective_end)
  where engagement_participant_id is not null;
create index if not exists itf_workforce_assignment_company_location_idx
  on core.itf_workforce_assignment (company_location_id, effective_end)
  where company_location_id is not null;
create index if not exists itf_workforce_assignment_company_office_idx
  on core.itf_workforce_assignment (company_location_office_id, effective_end)
  where company_location_office_id is not null;
create index if not exists itf_workforce_assignment_engagement_location_idx
  on core.itf_workforce_assignment (engagement_location_id, effective_end)
  where engagement_location_id is not null;
create index if not exists itf_workforce_assignment_engagement_office_idx
  on core.itf_workforce_assignment (engagement_office_id, effective_end)
  where engagement_office_id is not null;
create index if not exists itf_workforce_assignment_reports_to_idx
  on core.itf_workforce_assignment (reports_to_roster_id, effective_end)
  where reports_to_roster_id is not null;
create index if not exists itf_workforce_assignment_supersedes_idx
  on core.itf_workforce_assignment (supersedes_assignment_id)
  where supersedes_assignment_id is not null;

create or replace function core.validate_itf_workforce_assignment()
returns trigger
language plpgsql
set search_path = core, public
as $$
declare
  v_participant_company_id uuid;
  v_engagement_id uuid;
  v_principal_company_id uuid;
  v_reports_to_company_id uuid;
begin
  if not exists (
    select 1 from core.company_roster roster
    where roster.id = new.roster_id and roster.company_id = new.roster_company_id
  ) then
    raise exception 'The ITF assignment must retain company roster ownership.';
  end if;

  if new.engagement_participant_id is null then
    if new.company_location_id is not null and not exists (
      select 1 from core.company_location location
      where location.id = new.company_location_id and location.company_id = new.roster_company_id
    ) then
      raise exception 'A direct assignment location must belong to the roster company.';
    end if;
    if new.company_location_office_id is not null and not exists (
      select 1 from core.company_location_office office
      where office.id = new.company_location_office_id
        and office.company_location_id = new.company_location_id
    ) then
      raise exception 'A direct assignment office must belong to the selected location.';
    end if;
  else
    select participant.company_id, participant.engagement_id, relationship.principal_company_id
    into v_participant_company_id, v_engagement_id, v_principal_company_id
    from core.company_engagement_participant participant
    join core.company_engagement engagement on engagement.id = participant.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    where participant.id = new.engagement_participant_id;

    if v_participant_company_id is distinct from new.roster_company_id then
      raise exception 'The relationship participant must own the roster member.';
    end if;
    if not exists (
      select 1 from core.company_engagement_location location
      where location.id = new.engagement_location_id and location.engagement_id = v_engagement_id
    ) then
      raise exception 'The relationship location is not part of this engagement.';
    end if;
    if new.engagement_office_id is not null and not exists (
      select 1 from core.company_engagement_office office
      where office.id = new.engagement_office_id
        and office.engagement_location_id = new.engagement_location_id
    ) then
      raise exception 'The relationship office is not part of this location.';
    end if;
  end if;

  if new.reports_to_roster_id is not null then
    select roster.company_id into v_reports_to_company_id
    from core.company_roster roster where roster.id = new.reports_to_roster_id;
    if v_reports_to_company_id is distinct from new.roster_company_id
       and (new.engagement_participant_id is null or v_reports_to_company_id is distinct from v_principal_company_id) then
      raise exception 'Reports to must be a leader in the roster company or the engagement principal.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_itf_workforce_assignment_before_write
  on core.itf_workforce_assignment;
create trigger validate_itf_workforce_assignment_before_write
before insert or update on core.itf_workforce_assignment
for each row execute function core.validate_itf_workforce_assignment();

alter table core.company_engagement_participant enable row level security;
alter table core.company_engagement_location enable row level security;
alter table core.company_engagement_office enable row level security;
alter table core.itf_workforce_assignment enable row level security;

create policy company_engagement_participant_select_access
on core.company_engagement_participant for select to authenticated
using (core.is_platform_owner() or core.can_access_company(company_id) or core.can_access_company(reporting_company_id));
create policy company_engagement_participant_all_admin
on core.company_engagement_participant for all to authenticated
using (core.is_platform_owner() or core.can_admin_company(company_id) or core.can_admin_company(reporting_company_id))
with check (core.is_platform_owner() or core.can_admin_company(company_id) or core.can_admin_company(reporting_company_id));

create policy company_engagement_location_select_access
on core.company_engagement_location for select to authenticated
using (
  core.is_platform_owner() or exists (
    select 1 from core.company_engagement engagement
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    where engagement.id = company_engagement_location.engagement_id
      and (core.can_access_company(relationship.principal_company_id) or core.can_access_company(relationship.provider_company_id))
  )
);
create policy company_engagement_location_all_admin
on core.company_engagement_location for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());

create policy company_engagement_office_select_access
on core.company_engagement_office for select to authenticated
using (
  core.is_platform_owner() or exists (
    select 1 from core.company_engagement_location engagement_location
    join core.company_engagement engagement on engagement.id = engagement_location.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    where engagement_location.id = company_engagement_office.engagement_location_id
      and (core.can_access_company(relationship.principal_company_id) or core.can_access_company(relationship.provider_company_id))
  )
);
create policy company_engagement_office_all_admin
on core.company_engagement_office for all to authenticated
using (core.is_platform_owner()) with check (core.is_platform_owner());

create policy itf_workforce_assignment_select_access
on core.itf_workforce_assignment for select to authenticated
using (
  core.is_platform_owner() or core.can_access_company(roster_company_id) or exists (
    select 1 from core.company_engagement_participant participant
    where participant.id = itf_workforce_assignment.engagement_participant_id
      and core.can_access_company(participant.reporting_company_id)
  )
);
create policy itf_workforce_assignment_all_admin
on core.itf_workforce_assignment for all to authenticated
using (core.is_platform_owner() or core.can_admin_company(roster_company_id))
with check (core.is_platform_owner() or core.can_admin_company(roster_company_id));

revoke all on table core.company_engagement_participant, core.company_engagement_location,
  core.company_engagement_office, core.itf_workforce_assignment from public, anon;
grant select, insert, update on table core.company_engagement_participant to authenticated;
grant select, insert, update on table core.company_engagement_location to authenticated;
grant select, insert, update on table core.company_engagement_office to authenticated;
grant select, insert, update on table core.itf_workforce_assignment to authenticated;

-- Draft the authentic ITG/JComm fulfillment path.  Review status intentionally
-- prevents worker assignment until the relationship is accepted and activated.
with target as (
  select relationship.id as relationship_id,
         relationship.principal_company_id,
         relationship.provider_company_id,
         industry.id as industry_id,
         lob.id as lob_id
  from core.company_relationship relationship
  join core.companies principal on principal.id = relationship.principal_company_id
  join core.companies provider on provider.id = relationship.provider_company_id
  join ref.industries industry on industry.industry_key = 'telecom-fulfillment'
  join ref.lines_of_business lob on lob.industry_id = industry.id and lob.lob_key = 'fulfillment'
  where principal.company_slug = 'integrated-tech-group'
    and provider.company_slug = 'jcomm'
    and relationship.relationship_kind = 'subcontractor'
    and relationship.relationship_status in ('proposed', 'active', 'suspended')
)
insert into core.company_engagement (
  relationship_id, engagement_key, engagement_name, industry_id,
  line_of_business_id, engagement_status, starts_on, created_by_profile_id
)
select relationship_id, 'itg-telecom-fulfillment', 'ITG Telecom Fulfillment',
       industry_id, lob_id, 'draft', date '2025-12-22', core.current_profile_id()
from target
on conflict (relationship_id, engagement_key) do update
set engagement_name = excluded.engagement_name,
    industry_id = excluded.industry_id,
    line_of_business_id = excluded.line_of_business_id,
    updated_at = now();

insert into core.company_engagement_participant (
  engagement_id, company_id, source_relationship_id, reporting_company_id,
  participant_kind, participant_status, starts_on
)
select engagement.id, relationship.provider_company_id, relationship.id,
       relationship.provider_company_id, 'direct_provider',
       case when relationship.relationship_status = 'active' and engagement.engagement_status = 'active' then 'active' else 'review' end,
       coalesce(relationship.starts_on, engagement.starts_on)
from core.company_engagement engagement
join core.company_relationship relationship on relationship.id = engagement.relationship_id
join core.companies principal on principal.id = relationship.principal_company_id and principal.company_slug = 'integrated-tech-group'
join core.companies provider on provider.id = relationship.provider_company_id and provider.company_slug = 'jcomm'
where engagement.engagement_key = 'itg-telecom-fulfillment'
on conflict (engagement_id, company_id) do update
set participant_status = excluded.participant_status,
    starts_on = excluded.starts_on,
    updated_at = now();

insert into core.company_engagement_location (
  engagement_id, principal_company_location_id, location_status, starts_on
)
select engagement.id, location.id,
       case when relationship.relationship_status = 'active' and engagement.engagement_status = 'active' then 'active' else 'review' end,
       date '2025-12-22'
from core.company_engagement engagement
join core.company_relationship relationship on relationship.id = engagement.relationship_id
join core.companies principal on principal.id = relationship.principal_company_id and principal.company_slug = 'integrated-tech-group'
join core.companies provider on provider.id = relationship.provider_company_id and provider.company_slug = 'jcomm'
join core.company_location location on location.company_id = principal.id and location.location_code in ('410', '427')
where engagement.engagement_key = 'itg-telecom-fulfillment'
on conflict (engagement_id, principal_company_location_id) do update
set location_status = excluded.location_status,
    starts_on = excluded.starts_on,
    updated_at = now();

insert into core.company_engagement_office (
  engagement_location_id, principal_company_location_office_id, office_status, starts_on
)
select engagement_location.id, office.id, engagement_location.location_status, date '2025-12-22'
from core.company_engagement_location engagement_location
join core.company_engagement engagement on engagement.id = engagement_location.engagement_id
join core.company_relationship relationship on relationship.id = engagement.relationship_id
join core.companies provider on provider.id = relationship.provider_company_id and provider.company_slug = 'jcomm'
join core.company_location location on location.id = engagement_location.principal_company_location_id
join core.company_location_office office on office.company_location_id = location.id
where engagement.engagement_key = 'itg-telecom-fulfillment'
  and ((location.location_code = '410' and office.office_name in ('Harrisburg', 'Pittsburgh'))
    or (location.location_code = '427' and office.office_name in ('Edison', 'Egg Harbor')))
on conflict (engagement_location_id, principal_company_location_office_id) do update
set office_status = excluded.office_status,
    starts_on = excluded.starts_on,
    updated_at = now();

-- Adopt the already-approved ITG roster into the dated assignment contract.
insert into core.itf_workforce_assignment (
  product_id, roster_id, roster_company_id, company_location_id,
  company_location_office_id, job_title, seat_type, assignment_status,
  reports_to_roster_id, effective_start, effective_end, source_channel,
  created_by_profile_id
)
select product.id, roster.id, roster.company_id, roster.company_location_id,
       roster.company_location_office_id, coalesce(roster.job_title, 'Unknown'),
       coalesce(roster.seat_type, 'SUPPORT'),
       case when roster.employment_status = 'Former' then 'inactive'
            when roster.employment_status in ('Candidate', 'Trainee') then 'pending'
            else 'active' end,
       roster.reports_to_roster_id,
       coalesce(roster.hire_date, roster.created_at::date, current_date),
       case when roster.employment_status = 'Former' then coalesce(roster.separation_date, current_date) end,
       coalesce(provenance.entry_channel, 'donor_migration'),
       provenance.entered_by_profile_id
from core.company_roster roster
join core.companies company on company.id = roster.company_id and company.company_slug = 'integrated-tech-group'
join ref.insight_products product on product.product_key = 'insight-telecom-fulfillment'
left join core.company_roster_entry_provenance provenance on provenance.roster_id = roster.id
where not exists (
  select 1 from core.itf_workforce_assignment assignment
  where assignment.product_id = product.id and assignment.roster_id = roster.id
);

create or replace function public.itf_roster_relationship_context(p_company_slug text)
returns table (
  owner_company_id uuid,
  owner_company_name text,
  owner_company_slug text,
  affiliation_type text,
  engagement_participant_id uuid,
  relationship_id uuid,
  relationship_label text,
  relationship_status text,
  engagement_id uuid,
  engagement_status text,
  principal_company_name text,
  reporting_company_name text,
  engagement_location_id uuid,
  location_id uuid,
  location_code text,
  location_name text,
  region_name text,
  division_name text,
  engagement_office_id uuid,
  office_id uuid,
  office_name text,
  can_assign boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select v_company_id, workspace.company_name, workspace.company_slug, 'W-2'::text,
         null::uuid, null::uuid, 'Direct company workforce'::text, 'active'::text,
         null::uuid, 'active'::text, workspace.company_name, workspace.company_name,
         null::uuid, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name, null::uuid, office.id, office.office_name,
         (coalesce(location.location_status = 'active', true) and coalesce(office.office_status, 'active') = 'active')
  from core.companies workspace
  left join core.company_location location on location.company_id = workspace.id and location.location_status = 'active'
  left join core.company_location_office office on office.company_location_id = location.id and office.office_status = 'active'
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where workspace.id = v_company_id

  union all

  select participant.company_id, owner.company_name, owner.company_slug, 'Business Partner'::text,
         participant.id, relationship.id,
         principal.company_name || ' · ' || engagement.engagement_name,
         relationship.relationship_status, engagement.id, engagement.engagement_status,
         principal.company_name, reporting.company_name,
         engagement_location.id, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name,
         engagement_office.id, office.id, office.office_name,
         relationship.relationship_status = 'active'
           and engagement.engagement_status = 'active'
           and participant.participant_status = 'active'
           and engagement_location.location_status = 'active'
           and coalesce(engagement_office.office_status, 'active') = 'active'
  from core.company_engagement_participant participant
  join core.companies owner on owner.id = participant.company_id
  join core.company_engagement engagement on engagement.id = participant.engagement_id
  join core.company_relationship relationship on relationship.id = engagement.relationship_id
  join core.companies principal on principal.id = relationship.principal_company_id
  join core.companies reporting on reporting.id = participant.reporting_company_id
  join core.company_engagement_location engagement_location on engagement_location.engagement_id = engagement.id
  join core.company_location location on location.id = engagement_location.principal_company_location_id
  left join core.company_engagement_office engagement_office on engagement_office.engagement_location_id = engagement_location.id
  left join core.company_location_office office on office.id = engagement_office.principal_company_location_office_id
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where participant.company_id = v_company_id;
end;
$$;

revoke all on function public.itf_roster_relationship_context(text) from public, anon;
grant execute on function public.itf_roster_relationship_context(text) to authenticated;

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
  coalesce(assignment.job_title, roster.job_title) as job_title,
  roster.employment_status,
  coalesce(direct_location.id, relationship_location.id) as company_location_id,
  coalesce(direct_location.location_code, relationship_location.location_code) as location_code,
  coalesce(direct_location.location_name, relationship_location.location_name) as location_name,
  assignment.reports_to_roster_id,
  leader.full_name as reports_to_name,
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
  case provenance.entry_channel
    when 'donor_migration' then 'Donor import'
    when 'csv_import' then 'Company added'
    else case when provenance.entry_authority = 'principal_on_behalf' then 'Added on behalf' else 'Company added' end
  end as source_label,
  coalesce(direct_office.id, relationship_office.id) as office_id,
  coalesce(direct_office.office_name, relationship_office.office_name) as office_name,
  coalesce(direct_office.address, relationship_office.address) as office_address,
  coalesce(direct_office.sub_region, relationship_office.sub_region) as office_sub_region,
  coalesce(assignment.seat_type, roster.seat_type) as seat_type,
  division.id as division_id,
  division.division_name,
  division.division_code,
  region.id as region_id,
  region.region_name,
  region.region_code,
  assignment.id as assignment_id,
  assignment.assignment_status,
  assignment.effective_start,
  assignment.effective_end,
  case when assignment.engagement_participant_id is null then 'W-2' else 'Business Partner' end as affiliation_type,
  participant.id as engagement_participant_id,
  relationship.id as relationship_id,
  case when relationship.id is null then 'Direct company workforce'
       else principal.company_name || ' · ' || engagement.engagement_name end as relationship_name,
  relationship.relationship_status,
  engagement.engagement_status
from core.company_roster roster
join core.companies company on company.id = roster.company_id
join ref.insight_products product on product.product_key = 'insight-telecom-fulfillment'
left join core.itf_workforce_assignment assignment
  on assignment.roster_id = roster.id and assignment.product_id = product.id and assignment.effective_end is null
left join core.company_engagement_participant participant on participant.id = assignment.engagement_participant_id
left join core.company_engagement engagement on engagement.id = participant.engagement_id
left join core.company_relationship relationship on relationship.id = engagement.relationship_id
left join core.companies principal on principal.id = relationship.principal_company_id
left join core.company_location direct_location on direct_location.id = assignment.company_location_id
left join core.company_location_office direct_office on direct_office.id = assignment.company_location_office_id
left join core.company_engagement_location engagement_location on engagement_location.id = assignment.engagement_location_id
left join core.company_location relationship_location on relationship_location.id = engagement_location.principal_company_location_id
left join core.company_engagement_office engagement_office on engagement_office.id = assignment.engagement_office_id
left join core.company_location_office relationship_office on relationship_office.id = engagement_office.principal_company_location_office_id
left join core.company_location_region_assignment current_region
  on current_region.company_location_id = coalesce(direct_location.id, relationship_location.id)
 and current_region.ends_on is null
 and current_region.assignment_status = 'active'
left join core.company_operating_region region on region.id = current_region.company_region_id
left join core.company_operating_division division on division.id = region.division_id
left join core.company_roster leader on leader.id = assignment.reports_to_roster_id
left join core.company_roster_entry_provenance provenance on provenance.roster_id = roster.id
left join lateral (
  select max(identifier.identifier_value) filter (where identifier.identifier_type = 'tech_id') as tech_id,
         max(identifier.identifier_value) filter (where identifier.identifier_type = 'fuse_emp_id') as fuse_emp_id,
         max(identifier.identifier_value) filter (where identifier.identifier_type = 'nt_login') as nt_login,
         max(identifier.identifier_value) filter (where identifier.identifier_type = 'csg') as csg,
         max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_person_id') as legacy_person_id,
         max(identifier.identifier_value) filter (where identifier.identifier_type = 'legacy_assignment_id') as legacy_assignment_id
  from core.company_roster_identifier identifier where identifier.roster_id = roster.id
) identifiers on true
left join lateral (
  select event.event_metadata
  from core.company_roster_event event
  where event.roster_id = roster.id and event.event_type = 'donor_roster_imported'
  order by event.occurred_at desc, event.created_at desc
  limit 1
) import_event on true;

revoke all on table public.itf_company_roster_v from public, anon;
grant select on table public.itf_company_roster_v to authenticated;

comment on table core.itf_workforce_assignment is
  'Effective-dated ITF assignment authority. Identity remains on the company-owned roster; every material assignment change closes the prior row and opens a successor.';
comment on table core.company_engagement_participant is
  'Company relationship path for direct and downstream providers. reporting_company_id preserves the upstream rollup identity.';

commit;
