begin;

alter table core.candidate_interview
  alter column application_id drop not null,
  add column if not exists interviewee_name text,
  add column if not exists interviewee_email text,
  add column if not exists interviewee_phone text;

alter table core.candidate_interview
  drop constraint if exists candidate_interview_subject_ck;
alter table core.candidate_interview
  add constraint candidate_interview_subject_ck check (
    application_id is not null
    or nullif(btrim(coalesce(interviewee_name, '')), '') is not null
  );

drop policy if exists candidate_interview_select_owner_or_company
on core.candidate_interview;
create policy candidate_interview_select_owner_or_company
on core.candidate_interview for select to authenticated
using (
  core.is_platform_owner()
  or (company_id is not null and core.can_access_company(company_id))
  or exists (
    select 1 from core.candidate_application application
    where application.id = application_id
      and application.profile_id = core.current_profile_id()
  )
);

create or replace view public.candidate_interviews_v
with (security_invoker = true) as
select
  interview.id,
  interview.application_id,
  interview.company_id,
  interview.slot_id,
  interview.interviewer_profile_id,
  interview.interview_type,
  interview.interview_status,
  interview.starts_at,
  interview.ends_at,
  interview.timezone,
  interview.meeting_provider,
  interview.meeting_url,
  interview.bypass_reason,
  interview.outcome,
  interview.next_step,
  interview.completed_at,
  interview.created_at,
  interview.updated_at,
  coalesce(application.first_name, interview.interviewee_name) as first_name,
  application.last_name,
  coalesce(application.email, interview.interviewee_email) as email,
  application.role_interest,
  coalesce(application.source_type, 'manual') as source_type,
  coalesce(profile.display_name, concat_ws(' ', profile.first_name, profile.last_name)) as interviewer_name,
  coalesce(application.phone, interview.interviewee_phone) as phone,
  application.location_interest,
  application.application_status,
  interview.interviewee_name as manual_name
from core.candidate_interview interview
left join core.candidate_application application on application.id = interview.application_id
left join core.profiles profile on profile.id = interview.interviewer_profile_id;

grant select on public.candidate_interviews_v to authenticated, service_role;

drop function if exists public.schedule_candidate_interview_manually(
  text, uuid, timestamptz, timestamptz, text, text, text, uuid, uuid
);

create function public.schedule_candidate_interview_manually(
  p_company_slug text,
  p_application_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_meeting_provider text,
  p_meeting_url text,
  p_slot_id uuid,
  p_interview_id uuid,
  p_interviewee_name text,
  p_interviewee_email text,
  p_interviewee_phone text
) returns jsonb
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_owner_profile_id uuid;
  v_application core.candidate_application%rowtype;
  v_slot core.candidate_interview_slot%rowtype;
  v_interview core.candidate_interview%rowtype;
  v_previous_slot_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_timezone text;
  v_meeting_provider text;
  v_meeting_url text;
  v_interviewee_name text;
  v_interviewee_email text;
  v_interviewee_phone text;
begin
  select id into v_company_id
  from core.companies
  where company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Forbidden.';
  end if;

  if p_application_id is not null then
    select * into v_application
    from core.candidate_application
    where id = p_application_id
      and company_id = v_company_id
    for update;

    if v_application.id is null then raise exception 'Candidate application not found.'; end if;
    if v_application.application_status in ('declined', 'withdrawn') then
      raise exception 'This candidate journey is no longer active.';
    end if;

    v_interviewee_name := concat_ws(' ', v_application.first_name, v_application.last_name);
    v_interviewee_email := v_application.email;
    v_interviewee_phone := v_application.phone;
  else
    v_interviewee_name := nullif(btrim(coalesce(p_interviewee_name, '')), '');
    v_interviewee_email := nullif(lower(btrim(coalesce(p_interviewee_email, ''))), '');
    v_interviewee_phone := nullif(btrim(coalesce(p_interviewee_phone, '')), '');
    if v_interviewee_name is null then raise exception 'Interviewee name is required.'; end if;
  end if;

  if p_interview_id is not null then
    select * into v_interview
    from core.candidate_interview
    where id = p_interview_id
      and company_id = v_company_id
    for update;

    if v_interview.id is null then raise exception 'Interview not found.'; end if;
  elsif v_application.id is not null then
    select * into v_interview
    from core.candidate_interview
    where application_id = v_application.id
      and company_id = v_company_id
      and interview_status in ('scheduling_required', 'scheduled')
    order by case interview_status when 'scheduled' then 1 else 2 end, created_at desc
    limit 1
    for update;
  end if;

  v_previous_slot_id := v_interview.slot_id;

  if p_slot_id is not null then
    select * into v_slot
    from core.candidate_interview_slot
    where id = p_slot_id
      and company_id = v_company_id
      and (
        slot_status = 'open'
        or (slot_status = 'booked' and v_interview.id is not null and v_interview.slot_id = id)
      )
    for update;

    if v_slot.id is null then raise exception 'The selected interview time is no longer available.'; end if;

    v_starts_at := v_slot.starts_at;
    v_ends_at := v_slot.ends_at;
    v_timezone := v_slot.timezone;
    v_meeting_provider := v_slot.meeting_provider;
    v_meeting_url := v_slot.meeting_url;
  else
    v_starts_at := p_starts_at;
    v_ends_at := p_ends_at;
    v_timezone := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), 'America/New_York');
    v_meeting_provider := coalesce(nullif(btrim(coalesce(p_meeting_provider, '')), ''), 'insight');
    v_meeting_url := nullif(btrim(coalesce(p_meeting_url, '')), '');
  end if;

  if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
    raise exception 'Interview end must be after start.';
  end if;
  if v_starts_at < now() then raise exception 'Choose a future interview time.'; end if;
  if v_meeting_provider not in ('insight', 'google_meet', 'microsoft_teams', 'phone', 'in_person') then
    raise exception 'Choose a supported interview place.';
  end if;

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

  v_owner_profile_id := coalesce(v_owner_profile_id, v_interview.interviewer_profile_id, core.current_profile_id());

  if v_previous_slot_id is not null and v_previous_slot_id is distinct from p_slot_id then
    update core.candidate_interview_slot
    set slot_status = 'open'
    where id = v_previous_slot_id
      and company_id = v_company_id
      and slot_status = 'booked';
  end if;

  if p_slot_id is not null and p_slot_id is distinct from v_previous_slot_id then
    update core.candidate_interview_slot
    set slot_status = 'booked'
    where id = p_slot_id
      and company_id = v_company_id
      and slot_status = 'open';
  end if;

  if v_interview.id is null then
    insert into core.candidate_interview (
      application_id, company_id, slot_id, interviewer_profile_id,
      interview_status, starts_at, ends_at, timezone, meeting_provider, meeting_url,
      interviewee_name, interviewee_email, interviewee_phone
    ) values (
      v_application.id, v_company_id, p_slot_id, v_owner_profile_id,
      'scheduled', v_starts_at, v_ends_at, v_timezone, v_meeting_provider, v_meeting_url,
      v_interviewee_name, v_interviewee_email, v_interviewee_phone
    ) returning * into v_interview;
  else
    update core.candidate_interview
    set application_id = v_application.id,
        slot_id = p_slot_id,
        interviewer_profile_id = v_owner_profile_id,
        interview_status = 'scheduled',
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        timezone = v_timezone,
        meeting_provider = v_meeting_provider,
        meeting_url = v_meeting_url,
        interviewee_name = v_interviewee_name,
        interviewee_email = v_interviewee_email,
        interviewee_phone = v_interviewee_phone,
        bypass_reason = null,
        outcome = null,
        next_step = null,
        completed_at = null
    where id = v_interview.id
    returning * into v_interview;
  end if;

  if v_application.id is not null then
    update core.candidate_application
    set application_status = 'interview_scheduled'
    where id = v_application.id
      and application_status not in ('advanced', 'declined', 'withdrawn');
  end if;

  return jsonb_build_object(
    'ok', true,
    'interview', to_jsonb(v_interview),
    'interviewee', jsonb_build_object(
      'application_id', v_application.id,
      'name', v_interviewee_name,
      'email', v_interviewee_email,
      'phone', v_interviewee_phone
    )
  );
end;
$$;

revoke all on function public.schedule_candidate_interview_manually(
  text, uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.schedule_candidate_interview_manually(
  text, uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, text, text, text
) to authenticated, service_role;

comment on function public.schedule_candidate_interview_manually(
  text, uuid, timestamptz, timestamptz, text, text, text, uuid, uuid, text, text, text
) is 'Lets company hiring administrators schedule an existing Foyer candidate or manually enter an interviewee before the candidate adopts the digital journey.';

notify pgrst, 'reload schema';

commit;
