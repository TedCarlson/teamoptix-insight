-- Durable walk-on roster identities and date-bounded support assignments.
--
-- A walk-on needs a company-scoped roster UUID so dispatch, DSW production,
-- and payroll can meet on one identity. The record kind keeps that technical
-- identity out of the company's employee and candidate populations.

alter table core.company_roster
  add column if not exists roster_record_kind text not null default 'INTERNAL';

alter table core.company_roster
  drop constraint if exists company_roster_employment_status_check;

alter table core.company_roster
  add constraint company_roster_employment_status_check check (
    employment_status = any (
      array['Active'::text, 'Candidate'::text, 'Trainee'::text, 'Former'::text, 'Support'::text]
    )
  );

alter table core.company_roster
  drop constraint if exists company_roster_record_kind_ck;

alter table core.company_roster
  add constraint company_roster_record_kind_ck check (
    roster_record_kind = any (array['INTERNAL'::text, 'WALK_ON'::text])
  );

update core.company_roster roster
set
  roster_record_kind = 'WALK_ON',
  employment_status = 'Support'
where exists (
  select 1
  from core.walk_on_driver walk_on
  where walk_on.candidate_roster_id = roster.id
)
or exists (
  select 1
  from core.company_roster_event event
  where event.roster_id = roster.id
    and event.event_type = 'walk_on_created'
);

create table if not exists core.company_walk_on_workforce_unit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  unit_name text not null,
  normalized_name text not null,
  linked_company_id uuid references core.companies(id) on delete set null,
  status text not null default 'ACTIVE',
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_walk_on_workforce_unit_name_ck check (
    length(btrim(unit_name)) > 0
  ),
  constraint company_walk_on_workforce_unit_status_ck check (
    status = any (array['ACTIVE'::text, 'ARCHIVED'::text])
  ),
  constraint company_walk_on_workforce_unit_company_name_uq unique (
    company_id,
    normalized_name
  )
);

alter table core.walk_on_driver
  add column if not exists workforce_unit_id uuid
    references core.company_walk_on_workforce_unit(id) on delete set null;

create unique index if not exists walk_on_driver_company_roster_uq
  on core.walk_on_driver (company_id, candidate_roster_id)
  where candidate_roster_id is not null;

create table if not exists core.company_walk_on_assignment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  walk_on_driver_id uuid not null references core.walk_on_driver(id) on delete cascade,
  roster_member_id uuid not null references core.company_roster(id) on delete cascade,
  workforce_unit_id uuid references core.company_walk_on_workforce_unit(id) on delete set null,
  service_date date not null,
  assignment_status text not null default 'ACTIVE',
  note text,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_walk_on_assignment_status_ck check (
    assignment_status = any (array['ACTIVE'::text, 'REVERSED'::text])
  ),
  constraint company_walk_on_assignment_company_roster_date_uq unique (
    company_id,
    roster_member_id,
    service_date
  )
);

create index if not exists company_walk_on_assignment_period_idx
  on core.company_walk_on_assignment (company_id, service_date, assignment_status);

alter table core.company_walk_on_workforce_unit enable row level security;
alter table core.company_walk_on_assignment enable row level security;

drop policy if exists walk_on_driver_select_access on core.walk_on_driver;
create policy walk_on_driver_select_access
  on core.walk_on_driver
  for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

drop policy if exists company_walk_on_workforce_unit_select_access
  on core.company_walk_on_workforce_unit;
create policy company_walk_on_workforce_unit_select_access
  on core.company_walk_on_workforce_unit
  for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

drop policy if exists company_walk_on_assignment_select_access
  on core.company_walk_on_assignment;
create policy company_walk_on_assignment_select_access
  on core.company_walk_on_assignment
  for select to authenticated
  using (core.is_platform_owner() or core.can_access_company(company_id));

create or replace view core.company_roster_view as
select
  roster.id as roster_member_id,
  roster.company_id,
  roster.profile_id,
  roster.full_name,
  roster.email,
  roster.phone,
  roster.worker_type,
  roster.job_title,
  roster.employment_status,
  roster.market_code,
  supervisor.full_name as reports_to_name,
  roster.hire_date,
  roster.invite_status,
  roster.compliance_summary,
  fx.identifier_value as fx_id,
  dsw.identifier_value as dswid,
  roster.person_id,
  roster.reports_to_roster_id,
  roster.separation_date,
  roster.onboarding_completed_at,
  roster.created_at,
  roster.notes,
  roster.roster_record_kind
from core.company_roster roster
left join core.company_roster supervisor
  on supervisor.id = roster.reports_to_roster_id
left join core.company_roster_identifier fx
  on fx.roster_id = roster.id
 and fx.identifier_type = 'fx_id'
left join core.company_roster_identifier dsw
  on dsw.roster_id = roster.id
 and dsw.identifier_type = 'dswid';

create or replace view public.company_roster_view
with (security_invoker = true) as
select
  roster.roster_member_id,
  roster.company_id,
  roster.profile_id,
  roster.full_name,
  roster.email,
  roster.phone,
  roster.worker_type,
  roster.job_title,
  roster.employment_status,
  roster.market_code,
  roster.reports_to_name,
  roster.hire_date,
  roster.invite_status,
  roster.compliance_summary,
  roster.fx_id,
  roster.dswid,
  private.date_of_birth,
  private.address_line_1,
  private.address_line_2,
  private.city,
  private.state_region,
  private.postal_code,
  license.license_number,
  license.issuing_state,
  license.issue_date as license_issue_date,
  license.expiration_date as license_expiration_date,
  roster.person_id,
  roster.reports_to_roster_id,
  roster.separation_date,
  roster.onboarding_completed_at,
  roster.created_at,
  roster.notes,
  roster.roster_record_kind
from core.company_roster_view roster
left join core.profile_private_fact private
  on private.profile_id = roster.profile_id
left join lateral (
  select
    item.license_number,
    item.issuing_state,
    item.issue_date,
    item.expiration_date
  from core.profile_driver_license item
  where item.profile_id = roster.profile_id
  order by item.created_at desc
  limit 1
) license on true;

create or replace view public.company_walk_on_workforce_unit_v
with (security_invoker = true) as
select
  unit.id as workforce_unit_id,
  unit.company_id,
  unit.unit_name,
  unit.linked_company_id,
  linked.company_slug as linked_company_slug,
  unit.status,
  unit.created_at,
  unit.updated_at
from core.company_walk_on_workforce_unit unit
left join core.companies linked on linked.id = unit.linked_company_id;

create or replace view public.company_walk_on_roster_v
with (security_invoker = true) as
select
  walk_on.id as walk_on_driver_id,
  walk_on.company_id,
  company.company_slug,
  walk_on.candidate_roster_id as roster_member_id,
  roster.full_name,
  identity.dswid,
  walk_on.workforce_unit_id,
  unit.unit_name as workforce_unit_name,
  walk_on.first_seen_date,
  walk_on.last_seen_date,
  walk_on.dispatch_count,
  walk_on.status,
  walk_on.created_at,
  walk_on.updated_at
from core.walk_on_driver walk_on
join core.companies company on company.id = walk_on.company_id
join core.company_roster roster
  on roster.id = walk_on.candidate_roster_id
 and roster.company_id = walk_on.company_id
left join core.company_roster_identity_v identity
  on identity.roster_id = roster.id
left join core.company_walk_on_workforce_unit unit
  on unit.id = walk_on.workforce_unit_id;

-- Candidate is an explicit hiring choice. It no longer depends on the roster
-- import contract, whose approval fields made the incubating function skip new
-- walk-ons after the reconciliation refactor.
create or replace function public.create_walk_on_roster_candidate(
  p_company_slug text,
  p_full_name text,
  p_seen_date date default current_date,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_roster_id uuid;
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  if v_full_name is null then
    raise exception 'Candidate name is required.';
  end if;

  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;

  select roster.id into v_roster_id
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.roster_record_kind = 'INTERNAL'
    and roster.employment_status = 'Candidate'
    and lower(regexp_replace(btrim(roster.full_name), '\s+', ' ', 'g')) =
        lower(regexp_replace(v_full_name, '\s+', ' ', 'g'))
  order by roster.created_at desc
  limit 1;

  if v_roster_id is null then
    insert into core.company_roster (
      company_id,
      full_name,
      worker_type,
      job_title,
      employment_status,
      invite_status,
      compliance_summary,
      notes,
      roster_record_kind
    ) values (
      v_company_id,
      v_full_name,
      'Driver',
      'Driver',
      'Candidate',
      'Not Invited',
      'Missing',
      coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Candidate created from Dispatch walk-on action.'),
      'INTERNAL'
    ) returning id into v_roster_id;
  end if;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at,
    created_by_profile_id
  ) values (
    v_company_id,
    v_roster_id,
    'hiring',
    'walk_on_candidate_created',
    'Candidate created from the Dispatch walk-on action.',
    jsonb_build_object('source', 'dispatch_walk_on', 'seen_date', coalesce(p_seen_date, current_date)),
    now(),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'record_mode', 'CANDIDATE',
    'roster_member_id', v_roster_id,
    'full_name', v_full_name
  );
end;
$$;

create or replace function public.upsert_company_walk_on_roster_member(
  p_company_slug text,
  p_seen_date date default current_date,
  p_roster_member_id uuid default null,
  p_full_name text default null,
  p_dswid text default null,
  p_workforce_unit_id uuid default null,
  p_new_workforce_unit_name text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_company_id uuid;
  v_roster_id uuid := p_roster_member_id;
  v_walk_on_id uuid;
  v_workforce_unit_id uuid := p_workforce_unit_id;
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_dswid text := nullif(btrim(coalesce(p_dswid, '')), '');
  v_unit_name text := nullif(btrim(coalesce(p_new_workforce_unit_name, '')), '');
  v_seen_date date := coalesce(p_seen_date, current_date);
begin
  select id into v_company_id
  from core.companies
  where company_slug = p_company_slug;

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not core.can_admin_company(v_company_id) then raise exception 'Forbidden.'; end if;
  if v_seen_date > current_date then raise exception 'Walk-on service date cannot be in the future.'; end if;

  if v_unit_name is not null then
    insert into core.company_walk_on_workforce_unit (
      company_id,
      unit_name,
      normalized_name,
      created_by_profile_id
    ) values (
      v_company_id,
      v_unit_name,
      lower(regexp_replace(v_unit_name, '\s+', ' ', 'g')),
      core.current_profile_id()
    )
    on conflict (company_id, normalized_name) do update set
      unit_name = excluded.unit_name,
      status = 'ACTIVE',
      updated_at = now()
    returning id into v_workforce_unit_id;
  end if;

  if v_workforce_unit_id is null then
    raise exception 'A lending workforce unit is required.';
  end if;

  if not exists (
    select 1
    from core.company_walk_on_workforce_unit unit
    where unit.id = v_workforce_unit_id
      and unit.company_id = v_company_id
      and unit.status = 'ACTIVE'
  ) then
    raise exception 'Walk-on workforce unit was not found for this company.';
  end if;

  if v_roster_id is not null then
    select roster.id, roster.full_name
    into v_roster_id, v_full_name
    from core.company_roster roster
    where roster.id = v_roster_id
      and roster.company_id = v_company_id
      and roster.roster_record_kind = 'WALK_ON';

    if v_roster_id is null then
      raise exception 'Existing walk-on was not found for this company.';
    end if;
  else
    if v_full_name is null or v_dswid is null then
      raise exception 'A new walk-on requires full name and DSWID.';
    end if;

    select roster.id into v_roster_id
    from core.company_roster roster
    join core.company_roster_identifier identifier
      on identifier.roster_id = roster.id
     and identifier.identifier_type = 'dswid'
    where roster.company_id = v_company_id
      and roster.roster_record_kind = 'WALK_ON'
      and regexp_replace(upper(identifier.identifier_value), '[^A-Z0-9]+', '', 'g') =
          regexp_replace(upper(v_dswid), '[^A-Z0-9]+', '', 'g')
    limit 1;

    if v_roster_id is null then
      insert into core.company_roster (
        company_id,
        full_name,
        worker_type,
        job_title,
        employment_status,
        invite_status,
        compliance_summary,
        notes,
        roster_record_kind
      ) values (
        v_company_id,
        v_full_name,
        'Driver',
        'Support Driver',
        'Support',
        'Not Invited',
        'Missing',
        coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Reusable walk-on support driver.'),
        'WALK_ON'
      ) returning id into v_roster_id;
    end if;
  end if;

  if v_dswid is not null then
    insert into core.company_roster_identifier (
      roster_id,
      identifier_type,
      identifier_value
    ) values (
      v_roster_id,
      'dswid',
      v_dswid
    )
    on conflict (roster_id, identifier_type) do update set
      identifier_value = excluded.identifier_value;
  end if;

  insert into core.walk_on_driver (
    company_id,
    full_name,
    normalized_name,
    first_seen_date,
    last_seen_date,
    dispatch_count,
    status,
    candidate_roster_id,
    workforce_unit_id,
    created_by_profile_id
  ) values (
    v_company_id,
    v_full_name,
    lower(regexp_replace(v_full_name, '\s+', ' ', 'g')),
    v_seen_date,
    v_seen_date,
    1,
    'ACTIVE',
    v_roster_id,
    v_workforce_unit_id,
    core.current_profile_id()
  )
  on conflict (company_id, normalized_name) do update set
    full_name = excluded.full_name,
    first_seen_date = least(core.walk_on_driver.first_seen_date, excluded.first_seen_date),
    last_seen_date = greatest(core.walk_on_driver.last_seen_date, excluded.last_seen_date),
    dispatch_count = core.walk_on_driver.dispatch_count + 1,
    status = 'ACTIVE',
    candidate_roster_id = excluded.candidate_roster_id,
    workforce_unit_id = excluded.workforce_unit_id,
    updated_at = now()
  returning id into v_walk_on_id;

  insert into core.company_walk_on_assignment (
    company_id,
    walk_on_driver_id,
    roster_member_id,
    workforce_unit_id,
    service_date,
    note,
    created_by_profile_id
  ) values (
    v_company_id,
    v_walk_on_id,
    v_roster_id,
    v_workforce_unit_id,
    v_seen_date,
    nullif(btrim(coalesce(p_note, '')), ''),
    core.current_profile_id()
  )
  on conflict (company_id, roster_member_id, service_date) do update set
    walk_on_driver_id = excluded.walk_on_driver_id,
    workforce_unit_id = excluded.workforce_unit_id,
    assignment_status = 'ACTIVE',
    note = coalesce(excluded.note, core.company_walk_on_assignment.note),
    updated_at = now();

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    occurred_at,
    created_by_profile_id
  ) values (
    v_company_id,
    v_roster_id,
    'operations',
    'walk_on_assigned',
    'Walk-on support driver assigned for a service date.',
    jsonb_build_object(
      'source', 'dispatch_walk_on',
      'service_date', v_seen_date,
      'workforce_unit_id', v_workforce_unit_id,
      'dswid', v_dswid
    ),
    now(),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'record_mode', 'WALK_ON',
    'roster_member_id', v_roster_id,
    'walk_on_driver_id', v_walk_on_id,
    'workforce_unit_id', v_workforce_unit_id,
    'full_name', v_full_name,
    'dswid', coalesce(v_dswid, (
      select identity.dswid
      from core.company_roster_identity_v identity
      where identity.roster_id = v_roster_id
    )),
    'service_date', v_seen_date
  );
end;
$$;

revoke all on function public.upsert_company_walk_on_roster_member(
  text, date, uuid, text, text, uuid, text, text
) from public;
grant execute on function public.upsert_company_walk_on_roster_member(
  text, date, uuid, text, text, uuid, text, text
) to authenticated, service_role;

grant select on public.company_walk_on_workforce_unit_v to authenticated, service_role;
grant select on public.company_walk_on_roster_v to authenticated, service_role;

comment on column core.company_roster.roster_record_kind is
  'Classifies a roster UUID as internal workforce or a non-employee walk-on integration identity.';
comment on column core.walk_on_driver.candidate_roster_id is
  'Compatibility-named bridge to the canonical company_roster UUID. Walk-ons are not necessarily candidates.';

notify pgrst, 'reload schema';
