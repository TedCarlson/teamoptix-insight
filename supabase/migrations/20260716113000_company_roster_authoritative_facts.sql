-- Workforce Record Ownership Refactor — Sprint 1
-- Establish company-roster-owned personal and license warehouses.

create table if not exists core.company_roster_personal_fact (
  roster_id uuid primary key references core.company_roster(id) on delete cascade,
  date_of_birth date,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.company_roster_license_fact (
  roster_id uuid primary key references core.company_roster(id) on delete cascade,
  license_number text,
  issuing_state text,
  issue_date date,
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_roster_license_fact_number_ck
    check (license_number is null or length(btrim(license_number)) > 0),
  constraint company_roster_license_fact_state_ck
    check (issuing_state is null or length(btrim(issuing_state)) > 0)
);

create index if not exists company_roster_personal_fact_updated_idx
  on core.company_roster_personal_fact(updated_at desc);

create index if not exists company_roster_license_fact_number_idx
  on core.company_roster_license_fact(lower(btrim(license_number)))
  where nullif(btrim(license_number), '') is not null;

create index if not exists company_roster_license_fact_expiration_idx
  on core.company_roster_license_fact(expiration_date)
  where expiration_date is not null;

alter table core.company_roster_personal_fact enable row level security;
alter table core.company_roster_license_fact enable row level security;

drop policy if exists company_roster_personal_fact_select_access
  on core.company_roster_personal_fact;
create policy company_roster_personal_fact_select_access
  on core.company_roster_personal_fact
  for select to authenticated
  using (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_access_company(r.company_id)
    )
  );

drop policy if exists company_roster_personal_fact_write_admin
  on core.company_roster_personal_fact;
create policy company_roster_personal_fact_write_admin
  on core.company_roster_personal_fact
  for all to authenticated
  using (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_admin_company(r.company_id)
    )
  )
  with check (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_admin_company(r.company_id)
    )
  );

drop policy if exists company_roster_license_fact_select_access
  on core.company_roster_license_fact;
create policy company_roster_license_fact_select_access
  on core.company_roster_license_fact
  for select to authenticated
  using (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_access_company(r.company_id)
    )
  );

drop policy if exists company_roster_license_fact_write_admin
  on core.company_roster_license_fact;
create policy company_roster_license_fact_write_admin
  on core.company_roster_license_fact
  for all to authenticated
  using (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_admin_company(r.company_id)
    )
  )
  with check (
    core.is_platform_owner()
    or exists (
      select 1
      from core.company_roster r
      where r.id = roster_id
        and core.can_admin_company(r.company_id)
    )
  );

-- Heal existing company records from linked profile warehouses only where
-- the company-owned record does not already exist.
insert into core.company_roster_personal_fact (
  roster_id,
  date_of_birth,
  address_line_1,
  address_line_2,
  city,
  state_region,
  postal_code,
  created_at,
  updated_at
)
select
  r.id,
  pf.date_of_birth,
  pf.address_line_1,
  pf.address_line_2,
  pf.city,
  pf.state_region,
  pf.postal_code,
  coalesce(pf.created_at, now()),
  coalesce(pf.updated_at, now())
from core.company_roster r
join core.profile_private_fact pf
  on pf.profile_id = r.profile_id
where r.profile_id is not null
on conflict (roster_id) do nothing;

insert into core.company_roster_license_fact (
  roster_id,
  license_number,
  issuing_state,
  issue_date,
  expiration_date,
  created_at,
  updated_at
)
select
  r.id,
  dl.license_number,
  dl.issuing_state,
  dl.issue_date,
  dl.expiration_date,
  dl.created_at,
  dl.updated_at
from core.company_roster r
join lateral (
  select l.*
  from core.profile_driver_license l
  where l.profile_id = r.profile_id
  order by l.created_at desc, l.id desc
  limit 1
) dl on true
where r.profile_id is not null
on conflict (roster_id) do nothing;

create or replace function core.upsert_company_roster_authoritative_facts(
  p_company_slug text,
  p_roster_id uuid,
  p_date_of_birth date default null,
  p_address_line_1 text default null,
  p_address_line_2 text default null,
  p_city text default null,
  p_state_region text default null,
  p_postal_code text default null,
  p_license_number text default null,
  p_issuing_state text default null,
  p_license_issue_date date default null,
  p_license_expiration_date date default null,
  p_replace_blank_values boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to core, public
as $$
declare
  v_company_id uuid;
  v_personal core.company_roster_personal_fact%rowtype;
  v_license core.company_roster_license_fact%rowtype;
begin
  select c.id into v_company_id
  from core.companies c
  where c.company_slug = p_company_slug;

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if not core.can_admin_company(v_company_id) then
    raise exception 'Forbidden.';
  end if;

  if not exists (
    select 1
    from core.company_roster r
    where r.id = p_roster_id
      and r.company_id = v_company_id
  ) then
    raise exception 'Roster record not found.';
  end if;

  insert into core.company_roster_personal_fact (
    roster_id,
    date_of_birth,
    address_line_1,
    address_line_2,
    city,
    state_region,
    postal_code,
    updated_at
  ) values (
    p_roster_id,
    p_date_of_birth,
    nullif(btrim(coalesce(p_address_line_1, '')), ''),
    nullif(btrim(coalesce(p_address_line_2, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_state_region, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    now()
  )
  on conflict (roster_id) do update set
    date_of_birth = case
      when p_replace_blank_values then excluded.date_of_birth
      else coalesce(excluded.date_of_birth, core.company_roster_personal_fact.date_of_birth)
    end,
    address_line_1 = case
      when p_replace_blank_values then excluded.address_line_1
      else coalesce(excluded.address_line_1, core.company_roster_personal_fact.address_line_1)
    end,
    address_line_2 = case
      when p_replace_blank_values then excluded.address_line_2
      else coalesce(excluded.address_line_2, core.company_roster_personal_fact.address_line_2)
    end,
    city = case
      when p_replace_blank_values then excluded.city
      else coalesce(excluded.city, core.company_roster_personal_fact.city)
    end,
    state_region = case
      when p_replace_blank_values then excluded.state_region
      else coalesce(excluded.state_region, core.company_roster_personal_fact.state_region)
    end,
    postal_code = case
      when p_replace_blank_values then excluded.postal_code
      else coalesce(excluded.postal_code, core.company_roster_personal_fact.postal_code)
    end,
    updated_at = now()
  returning * into v_personal;

  if p_replace_blank_values
     or p_license_number is not null
     or p_issuing_state is not null
     or p_license_issue_date is not null
     or p_license_expiration_date is not null then
    insert into core.company_roster_license_fact (
      roster_id,
      license_number,
      issuing_state,
      issue_date,
      expiration_date,
      updated_at
    ) values (
      p_roster_id,
      nullif(btrim(coalesce(p_license_number, '')), ''),
      nullif(btrim(coalesce(p_issuing_state, '')), ''),
      p_license_issue_date,
      p_license_expiration_date,
      now()
    )
    on conflict (roster_id) do update set
      license_number = case
        when p_replace_blank_values then excluded.license_number
        else coalesce(excluded.license_number, core.company_roster_license_fact.license_number)
      end,
      issuing_state = case
        when p_replace_blank_values then excluded.issuing_state
        else coalesce(excluded.issuing_state, core.company_roster_license_fact.issuing_state)
      end,
      issue_date = case
        when p_replace_blank_values then excluded.issue_date
        else coalesce(excluded.issue_date, core.company_roster_license_fact.issue_date)
      end,
      expiration_date = case
        when p_replace_blank_values then excluded.expiration_date
        else coalesce(excluded.expiration_date, core.company_roster_license_fact.expiration_date)
      end,
      updated_at = now()
    returning * into v_license;
  else
    select * into v_license
    from core.company_roster_license_fact
    where roster_id = p_roster_id;
  end if;

  return jsonb_build_object(
    'roster_member_id', p_roster_id,
    'personal', to_jsonb(v_personal),
    'license', case when v_license.roster_id is null then null else to_jsonb(v_license) end
  );
end;
$$;

create or replace function public.upsert_company_roster_authoritative_facts(
  p_company_slug text,
  p_roster_id uuid,
  p_date_of_birth date default null,
  p_address_line_1 text default null,
  p_address_line_2 text default null,
  p_city text default null,
  p_state_region text default null,
  p_postal_code text default null,
  p_license_number text default null,
  p_issuing_state text default null,
  p_license_issue_date date default null,
  p_license_expiration_date date default null,
  p_replace_blank_values boolean default false
) returns jsonb
language sql
security definer
set search_path to core, public
as $$
  select core.upsert_company_roster_authoritative_facts(
    p_company_slug,
    p_roster_id,
    p_date_of_birth,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_state_region,
    p_postal_code,
    p_license_number,
    p_issuing_state,
    p_license_issue_date,
    p_license_expiration_date,
    p_replace_blank_values
  );
$$;

revoke all on function public.upsert_company_roster_authoritative_facts(
  text, uuid, date, text, text, text, text, text, text, text, date, date, boolean
) from public;
grant execute on function public.upsert_company_roster_authoritative_facts(
  text, uuid, date, text, text, text, text, text, text, text, date, date, boolean
) to authenticated, service_role;

grant select, insert, update on core.company_roster_personal_fact to authenticated, service_role;
grant select, insert, update on core.company_roster_license_fact to authenticated, service_role;

comment on table core.company_roster_personal_fact is
  'Company-authoritative personal facts for a roster membership. Profile linkage is optional and non-authoritative.';
comment on table core.company_roster_license_fact is
  'Company-authoritative driver license facts for a roster membership. Profile linkage is optional and non-authoritative.';
