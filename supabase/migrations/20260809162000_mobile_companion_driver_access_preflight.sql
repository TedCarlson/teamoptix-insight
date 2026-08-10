begin;

create or replace function public.mobile_companion_driver_access()
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  roster_member_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_profile as (
    select profile.id
    from core.profiles profile
    where profile.auth_user_id = auth.uid()
      and profile.profile_status = 'active'
    limit 1
  ),
  eligible as (
    select
      company.id as company_id,
      company.company_name,
      company.company_slug,
      roster.id as roster_member_id,
      count(*) over (partition by company.id) as eligible_roster_count
    from active_profile profile
    join core.company_memberships membership
      on membership.profile_id = profile.id
     and membership.membership_status = 'active'
    join core.companies company
      on company.id = membership.company_id
     and company.company_status = 'active'
    join core.company_roster roster
      on roster.company_id = company.id
     and roster.profile_id = profile.id
     and roster.employment_status in ('Active', 'Trainee')
     and roster.roster_record_kind = 'INTERNAL'
    where exists (
      select 1
      from public.company_terminal terminal
      where terminal.company_id = company.id
        and terminal.is_active = true
        and nullif(btrim(terminal.timezone), '') is not null
    )
  )
  select
    eligible.company_id,
    eligible.company_name,
    eligible.company_slug,
    eligible.roster_member_id
  from eligible
  where eligible.eligible_roster_count = 1
  order by eligible.company_name, eligible.company_id;
$$;

comment on function public.mobile_companion_driver_access() is
  'Returns only active companies where the authenticated profile resolves to exactly one eligible INTERNAL Active/Trainee driver roster record and an active terminal timezone. Used to preflight Mobile Companion duty tracking without weakening sync authority.';

revoke all on function public.mobile_companion_driver_access()
  from public, anon;
grant execute on function public.mobile_companion_driver_access()
  to authenticated, service_role;

commit;
