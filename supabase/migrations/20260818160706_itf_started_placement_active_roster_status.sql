begin;

-- A FUSE Started handoff is a roster activation event. Training and travel
-- describe the active seat; they do not leave the person in onboarding.
create or replace function public.itf_place_started_onboarding_candidate(
  p_company_slug text,
  p_candidate_id uuid,
  p_placement text,
  p_company_location_id uuid,
  p_company_location_office_id uuid,
  p_engagement_participant_id uuid,
  p_engagement_location_id uuid,
  p_engagement_office_id uuid,
  p_reports_to_roster_id uuid,
  p_effective_from date,
  p_full_name text,
  p_email text,
  p_phone text,
  p_identifiers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_product_id uuid;
  v_candidate core.itf_onboarding_candidate_version%rowtype;
  v_assignment_id uuid;
  v_seat_type text;
  v_is_relationship boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;
  if p_effective_from is null then raise exception 'An effective placement date is required.'; end if;
  if p_placement not in ('training', 'field', 'travel') then
    raise exception 'Choose Active Training, Active Field, or Active Travel Tech.';
  end if;

  select current.* into v_candidate
  from core.itf_onboarding_candidate_version current
  where current.candidate_id = p_candidate_id
    and current.valid_to is null
    and current.roster_id is not null
    and (current.workspace_company_id = v_company_id or current.roster_company_id = v_company_id)
  for update;
  if v_candidate.id is null then raise exception 'Current onboarding candidate not found.'; end if;
  if v_candidate.fuse_status <> 'Started' then
    raise exception 'Workforce placement becomes available only when FUSE reaches Started.';
  end if;

  select product.id into v_product_id
  from ref.insight_products product
  where product.product_key = 'insight-telecom-fulfillment';

  if exists (
    select 1 from core.itf_workforce_assignment assignment
    where assignment.product_id = v_product_id
      and assignment.roster_id = v_candidate.roster_id
      and assignment.effective_end is null
  ) then
    raise exception 'This candidate already has a current workforce placement.';
  end if;

  v_is_relationship := v_candidate.roster_company_id <> v_candidate.workspace_company_id;

  if v_is_relationship then
    if not exists (
      select 1
      from core.company_engagement_participant participant
      join core.company_engagement engagement on engagement.id = participant.engagement_id
      join core.company_relationship relationship on relationship.id = engagement.relationship_id
      join core.company_engagement_location engagement_location
        on engagement_location.id = p_engagement_location_id
       and engagement_location.engagement_id = engagement.id
      join core.company_location location on location.id = engagement_location.principal_company_location_id
      left join core.company_engagement_office engagement_office
        on engagement_office.id = p_engagement_office_id
       and engagement_office.engagement_location_id = engagement_location.id
      where participant.id = p_engagement_participant_id
        and participant.company_id = v_candidate.roster_company_id
        and relationship.principal_company_id = v_candidate.workspace_company_id
        and location.location_code = v_candidate.location_code
        and relationship.relationship_status in ('proposed', 'active')
        and engagement.engagement_status in ('draft', 'active')
        and participant.participant_status in ('review', 'active')
        and engagement_location.location_status in ('review', 'active')
        and (p_engagement_office_id is null or engagement_office.office_status in ('review', 'active'))
    ) then
      raise exception 'The selected company relationship and location do not match this onboarding candidate.';
    end if;
  else
    if not exists (
      select 1 from core.company_location location
      where location.id = p_company_location_id
        and location.company_id = v_candidate.roster_company_id
        and location.location_code = v_candidate.location_code
        and location.location_status = 'active'
    ) then
      raise exception 'The selected company location does not match this onboarding candidate.';
    end if;
    if p_company_location_office_id is not null and not exists (
      select 1 from core.company_location_office office
      where office.id = p_company_location_office_id
        and office.company_id = v_candidate.roster_company_id
        and office.company_location_id = p_company_location_id
        and office.office_status = 'active'
    ) then
      raise exception 'The selected office is not active for this location.';
    end if;
  end if;

  if p_reports_to_roster_id is not null and not exists (
    select 1 from public.itf_workspace_roster(p_company_slug) visible
    where visible.roster_member_id = p_reports_to_roster_id
      and visible.employment_status = 'Active'
  ) then
    raise exception 'Reports to must be an active leader visible in this company workspace.';
  end if;

  v_seat_type := case p_placement
    when 'training' then 'TRAINING'
    when 'travel' then 'TRAVEL'
    else 'FIELD'
  end;

  perform core.itf_write_onboarding_roster_identity(
    v_candidate.roster_id, p_full_name, p_email, p_phone, p_identifiers
  );

  update core.company_roster
  set worker_type = 'TECH', job_title = 'Technician',
      employment_status = 'Active', seat_type = v_seat_type,
      reports_to_roster_id = p_reports_to_roster_id
  where id = v_candidate.roster_id;

  insert into core.itf_workforce_assignment (
    product_id, roster_id, roster_company_id, engagement_participant_id,
    company_location_id, company_location_office_id, engagement_location_id,
    engagement_office_id, job_title, seat_type, assignment_status,
    reports_to_roster_id, effective_start, source_channel,
    created_by_profile_id
  ) values (
    v_product_id, v_candidate.roster_id, v_candidate.roster_company_id,
    case when v_is_relationship then p_engagement_participant_id else null end,
    case when v_is_relationship then null else p_company_location_id end,
    case when v_is_relationship then null else p_company_location_office_id end,
    case when v_is_relationship then p_engagement_location_id else null end,
    case when v_is_relationship then p_engagement_office_id else null end,
    'Technician', v_seat_type, 'active', p_reports_to_roster_id,
    p_effective_from, 'fuse_onboarding_placement', core.current_profile_id()
  ) returning id into v_assignment_id;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, created_by_profile_id
  ) values (
    v_candidate.roster_company_id, v_candidate.roster_id, 'operations',
    'onboarding_candidate_placed',
    'Started onboarding candidate activated in the selected ITF workforce seat.',
    jsonb_build_object(
      'workspace_company_id', v_candidate.workspace_company_id,
      'candidate_id', v_candidate.candidate_id,
      'placement', p_placement,
      'roster_status', 'Active',
      'seat_type', v_seat_type,
      'assignment_id', v_assignment_id,
      'effective_from', p_effective_from
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true, 'candidate_id', v_candidate.candidate_id,
    'roster_id', v_candidate.roster_id, 'assignment_id', v_assignment_id,
    'roster_status', 'Active', 'seat_type', v_seat_type,
    'placement', p_placement, 'effective_from', p_effective_from
  );
end;
$$;

revoke all on function public.itf_place_started_onboarding_candidate(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, date,
  text, text, text, jsonb
) from public, anon;
grant execute on function public.itf_place_started_onboarding_candidate(
  text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, date,
  text, text, text, jsonb
) to authenticated;

commit;
