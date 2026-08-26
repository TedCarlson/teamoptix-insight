begin;

-- Company roster facts are the sole authority for company-facing personal and
-- license data. Preserve every company-owned value, then fill only gaps from
-- the linked user profile before removing profile storage from roster reads.
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
  roster.id,
  profile_fact.date_of_birth,
  nullif(btrim(profile_fact.address_line_1), ''),
  nullif(btrim(profile_fact.address_line_2), ''),
  nullif(btrim(profile_fact.city), ''),
  nullif(btrim(profile_fact.state_region), ''),
  nullif(btrim(profile_fact.postal_code), ''),
  coalesce(profile_fact.created_at, now()),
  now()
from core.company_roster roster
join core.profile_private_fact profile_fact
  on profile_fact.profile_id = roster.profile_id
where roster.profile_id is not null
on conflict (roster_id) do update set
  date_of_birth = coalesce(
    core.company_roster_personal_fact.date_of_birth,
    excluded.date_of_birth
  ),
  address_line_1 = coalesce(
    nullif(btrim(core.company_roster_personal_fact.address_line_1), ''),
    excluded.address_line_1
  ),
  address_line_2 = coalesce(
    nullif(btrim(core.company_roster_personal_fact.address_line_2), ''),
    excluded.address_line_2
  ),
  city = coalesce(
    nullif(btrim(core.company_roster_personal_fact.city), ''),
    excluded.city
  ),
  state_region = coalesce(
    nullif(btrim(core.company_roster_personal_fact.state_region), ''),
    excluded.state_region
  ),
  postal_code = coalesce(
    nullif(btrim(core.company_roster_personal_fact.postal_code), ''),
    excluded.postal_code
  ),
  updated_at = now();

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
  roster.id,
  nullif(btrim(profile_license.license_number), ''),
  nullif(btrim(profile_license.issuing_state), ''),
  profile_license.issue_date,
  profile_license.expiration_date,
  profile_license.created_at,
  now()
from core.company_roster roster
join lateral (
  select candidate.*
  from core.profile_driver_license candidate
  where candidate.profile_id = roster.profile_id
  order by candidate.created_at desc, candidate.id desc
  limit 1
) profile_license on true
where roster.profile_id is not null
on conflict (roster_id) do update set
  license_number = coalesce(
    nullif(btrim(core.company_roster_license_fact.license_number), ''),
    excluded.license_number
  ),
  issuing_state = coalesce(
    nullif(btrim(core.company_roster_license_fact.issuing_state), ''),
    excluded.issuing_state
  ),
  issue_date = coalesce(
    core.company_roster_license_fact.issue_date,
    excluded.issue_date
  ),
  expiration_date = coalesce(
    core.company_roster_license_fact.expiration_date,
    excluded.expiration_date
  ),
  updated_at = now();

-- Abort before changing consumers if any profile-only field failed to reach
-- the company-owned record. Conflicting nonblank values deliberately retain
-- the company value because the company record is authoritative.
do $$
begin
  if exists (
    select 1
    from core.company_roster roster
    join core.profile_private_fact profile_fact
      on profile_fact.profile_id = roster.profile_id
    left join core.company_roster_personal_fact company_fact
      on company_fact.roster_id = roster.id
    where (profile_fact.date_of_birth is not null and company_fact.date_of_birth is null)
       or (nullif(btrim(profile_fact.address_line_1), '') is not null and nullif(btrim(company_fact.address_line_1), '') is null)
       or (nullif(btrim(profile_fact.address_line_2), '') is not null and nullif(btrim(company_fact.address_line_2), '') is null)
       or (nullif(btrim(profile_fact.city), '') is not null and nullif(btrim(company_fact.city), '') is null)
       or (nullif(btrim(profile_fact.state_region), '') is not null and nullif(btrim(company_fact.state_region), '') is null)
       or (nullif(btrim(profile_fact.postal_code), '') is not null and nullif(btrim(company_fact.postal_code), '') is null)
  ) then
    raise exception 'Roster authority cutover blocked: personal fact coverage is incomplete.';
  end if;

  if exists (
    select 1
    from core.company_roster roster
    join lateral (
      select candidate.*
      from core.profile_driver_license candidate
      where candidate.profile_id = roster.profile_id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) profile_license on true
    left join core.company_roster_license_fact company_license
      on company_license.roster_id = roster.id
    where (nullif(btrim(profile_license.license_number), '') is not null and nullif(btrim(company_license.license_number), '') is null)
       or (nullif(btrim(profile_license.issuing_state), '') is not null and nullif(btrim(company_license.issuing_state), '') is null)
       or (profile_license.issue_date is not null and company_license.issue_date is null)
       or (profile_license.expiration_date is not null and company_license.expiration_date is null)
  ) then
    raise exception 'Roster authority cutover blocked: license fact coverage is incomplete.';
  end if;
end;
$$;

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
  personal.date_of_birth,
  personal.address_line_1,
  personal.address_line_2,
  personal.city,
  personal.state_region,
  personal.postal_code,
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
left join core.company_roster_personal_fact personal
  on personal.roster_id = roster.roster_member_id
left join core.company_roster_license_fact license
  on license.roster_id = roster.roster_member_id;

revoke all privileges on table public.company_roster_view from public, anon;
grant select on table public.company_roster_view to authenticated, service_role;

comment on view public.company_roster_view is
  'Company roster read model. Personal and license fields resolve exclusively from company-owned roster facts; linked profile storage is never a company read authority.';

-- Retire the ambiguous legacy entry points. The remaining 20-argument
-- contract requires p_replace_blank_values and writes company-owned facts.
drop function if exists public.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date,
  text, text, text, text, text, text, text, date, date
);
drop function if exists core.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date,
  text, text, text, text, text, text, text, date, date
);
drop function if exists public.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, date, date
);
drop function if exists core.update_company_roster_details(
  text, uuid, text, text, text, text, text, text, date, date,
  text, text, text, text, text, text, text, date, date
);

-- Linked profiles are a secondary projection only. Company writes may fill
-- missing profile fields, but never overwrite a profile value and never read
-- profile storage back into the company interface after this cutover.
create or replace function core.mirror_roster_personal_to_profile_missing()
returns trigger
language plpgsql
security definer
set search_path to core, public
as $$
declare
  v_profile_id uuid;
begin
  select roster.profile_id into v_profile_id
  from core.company_roster roster
  where roster.id = new.roster_id;

  if v_profile_id is null then
    return new;
  end if;

  insert into core.profile_private_fact (
    profile_id,
    date_of_birth,
    address_line_1,
    address_line_2,
    city,
    state_region,
    postal_code,
    updated_at
  ) values (
    v_profile_id,
    new.date_of_birth,
    new.address_line_1,
    new.address_line_2,
    new.city,
    new.state_region,
    new.postal_code,
    now()
  )
  on conflict (profile_id) do update set
    date_of_birth = coalesce(core.profile_private_fact.date_of_birth, excluded.date_of_birth),
    address_line_1 = coalesce(nullif(btrim(core.profile_private_fact.address_line_1), ''), excluded.address_line_1),
    address_line_2 = coalesce(nullif(btrim(core.profile_private_fact.address_line_2), ''), excluded.address_line_2),
    city = coalesce(nullif(btrim(core.profile_private_fact.city), ''), excluded.city),
    state_region = coalesce(nullif(btrim(core.profile_private_fact.state_region), ''), excluded.state_region),
    postal_code = coalesce(nullif(btrim(core.profile_private_fact.postal_code), ''), excluded.postal_code),
    updated_at = case
      when core.profile_private_fact.date_of_birth is null and excluded.date_of_birth is not null
        or nullif(btrim(core.profile_private_fact.address_line_1), '') is null and excluded.address_line_1 is not null
        or nullif(btrim(core.profile_private_fact.address_line_2), '') is null and excluded.address_line_2 is not null
        or nullif(btrim(core.profile_private_fact.city), '') is null and excluded.city is not null
        or nullif(btrim(core.profile_private_fact.state_region), '') is null and excluded.state_region is not null
        or nullif(btrim(core.profile_private_fact.postal_code), '') is null and excluded.postal_code is not null
      then now()
      else core.profile_private_fact.updated_at
    end;

  return new;
end;
$$;

create or replace function core.mirror_roster_license_to_profile_missing()
returns trigger
language plpgsql
security definer
set search_path to core, public
as $$
declare
  v_profile_id uuid;
  v_license_id uuid;
begin
  select roster.profile_id into v_profile_id
  from core.company_roster roster
  where roster.id = new.roster_id;

  if v_profile_id is null then
    return new;
  end if;

  select license.id into v_license_id
  from core.profile_driver_license license
  where license.profile_id = v_profile_id
  order by license.created_at desc, license.id desc
  limit 1;

  if v_license_id is not null then
    update core.profile_driver_license
    set
      issue_date = coalesce(issue_date, new.issue_date),
      updated_at = case
        when issue_date is null and new.issue_date is not null then now()
        else updated_at
      end
    where id = v_license_id;
  elsif nullif(btrim(new.license_number), '') is not null
    and nullif(btrim(new.issuing_state), '') is not null
    and new.expiration_date is not null then
    insert into core.profile_driver_license (
      profile_id,
      license_number,
      issuing_state,
      issue_date,
      expiration_date,
      updated_at
    ) values (
      v_profile_id,
      btrim(new.license_number),
      btrim(new.issuing_state),
      new.issue_date,
      new.expiration_date,
      now()
    );
  end if;

  return new;
end;
$$;

revoke all on function core.mirror_roster_personal_to_profile_missing()
  from public, anon, authenticated, service_role;
revoke all on function core.mirror_roster_license_to_profile_missing()
  from public, anon, authenticated, service_role;

drop trigger if exists company_roster_personal_profile_projection
  on core.company_roster_personal_fact;
create trigger company_roster_personal_profile_projection
after insert or update on core.company_roster_personal_fact
for each row execute function core.mirror_roster_personal_to_profile_missing();

drop trigger if exists company_roster_license_profile_projection
  on core.company_roster_license_fact;
create trigger company_roster_license_profile_projection
after insert or update on core.company_roster_license_fact
for each row execute function core.mirror_roster_license_to_profile_missing();

comment on table core.profile_private_fact is
  'User-profile personal facts. May receive fill-missing projections from linked company roster records; never authoritative for company roster reads.';
comment on table core.profile_driver_license is
  'User-profile license facts. May receive a missing record from linked company roster records; never authoritative for company roster reads.';

commit;
