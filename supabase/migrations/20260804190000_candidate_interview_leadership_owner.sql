begin;

create or replace function public.create_candidate_interview_slot(
  p_company_slug text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_meeting_provider text,
  p_meeting_url text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_owner_profile_id uuid;
  v_slot core.candidate_interview_slot%rowtype;
begin
  select id into v_company_id from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then raise exception 'Forbidden.'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Interview end must be after start.'; end if;

  select coalesce(assignment.profile_id, roster.profile_id)
  into v_owner_profile_id
  from core.company_leadership_assignment assignment
  left join core.company_roster roster
    on roster.id = assignment.roster_member_id
   and roster.company_id = assignment.company_id
  where assignment.company_id = v_company_id
    and assignment.role_key in ('hr', 'business_contact')
    and coalesce(assignment.profile_id, roster.profile_id) is not null
  order by case assignment.role_key when 'hr' then 1 else 2 end
  limit 1;

  v_owner_profile_id := coalesce(v_owner_profile_id, core.current_profile_id());

  insert into core.candidate_interview_slot (
    company_id, interviewer_profile_id, starts_at, ends_at, timezone,
    meeting_provider, meeting_url, created_by_profile_id
  ) values (
    v_company_id, v_owner_profile_id, p_starts_at, p_ends_at,
    coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York'),
    coalesce(nullif(btrim(coalesce(p_meeting_provider, '')), ''), 'insight'),
    nullif(btrim(coalesce(p_meeting_url, '')), ''), core.current_profile_id()
  ) returning * into v_slot;

  return to_jsonb(v_slot);
end;
$$;

comment on function public.create_candidate_interview_slot(text, timestamptz, timestamptz, text, text, text) is
  'Publishes candidate interview availability owned by the company HR leadership assignment, then Business Contact, then the creating administrator.';

create or replace function public.get_candidate_interview_owner(p_company_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_owner jsonb;
begin
  select id into v_company_id from core.companies where company_slug = lower(btrim(p_company_slug));
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then raise exception 'Forbidden.'; end if;

  select jsonb_build_object(
    'role_key', assignment.role_key,
    'profile_id', coalesce(assignment.profile_id, roster.profile_id),
    'roster_member_id', assignment.roster_member_id,
    'full_name', coalesce(profile.display_name, nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), roster.full_name),
    'email', coalesce(profile.email, roster.email)
  )
  into v_owner
  from core.company_leadership_assignment assignment
  left join core.company_roster roster
    on roster.id = assignment.roster_member_id and roster.company_id = assignment.company_id
  left join core.profiles profile
    on profile.id = coalesce(assignment.profile_id, roster.profile_id)
  where assignment.company_id = v_company_id
    and assignment.role_key in ('hr', 'business_contact')
    and coalesce(assignment.profile_id, roster.profile_id) is not null
  order by case assignment.role_key when 'hr' then 1 else 2 end
  limit 1;

  return coalesce(v_owner, jsonb_build_object(
    'role_key', null,
    'profile_id', null,
    'roster_member_id', null,
    'full_name', null,
    'email', null
  ));
end;
$$;

revoke all on function public.get_candidate_interview_owner(text) from public, anon;
grant execute on function public.get_candidate_interview_owner(text) to authenticated, service_role;

commit;
