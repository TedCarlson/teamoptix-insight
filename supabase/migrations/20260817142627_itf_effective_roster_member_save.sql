begin;

grant insert on table core.company_roster_entry_provenance to authenticated;

create or replace function public.itf_save_roster_member_v2(
  p_company_slug text,
  p_roster_id uuid,
  p_roster_company_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_employment_status text,
  p_company_location_id uuid,
  p_company_location_office_id uuid,
  p_engagement_participant_id uuid,
  p_engagement_location_id uuid,
  p_engagement_office_id uuid,
  p_job_title text,
  p_seat_type text,
  p_assignment_status text,
  p_reports_to_roster_id uuid,
  p_effective_from date,
  p_identifiers jsonb,
  p_replacement_roster_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_product_id uuid;
  v_roster_id uuid := p_roster_id;
  v_existing core.company_roster%rowtype;
  v_current core.itf_workforce_assignment%rowtype;
  v_new_assignment_id uuid;
  v_identifier record;
  v_assignment_changed boolean;
  v_direct_report record;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id into v_workspace_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';

  if v_workspace_company_id is null or p_roster_company_id is distinct from v_workspace_company_id then
    raise exception 'Roster company must match the active company workspace.';
  end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_full_name, '')), '') is null then raise exception 'A full name is required.'; end if;
  if p_effective_from is null then raise exception 'An effective date is required.'; end if;

  select product.id into v_product_id
  from ref.insight_products product
  where product.product_key = 'insight-telecom-fulfillment';

  if p_engagement_participant_id is not null and not exists (
    select 1
    from core.company_engagement_participant participant
    join core.company_engagement engagement on engagement.id = participant.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    join core.company_engagement_location engagement_location
      on engagement_location.id = p_engagement_location_id
     and engagement_location.engagement_id = engagement.id
    left join core.company_engagement_office engagement_office
      on engagement_office.id = p_engagement_office_id
     and engagement_office.engagement_location_id = engagement_location.id
    where participant.id = p_engagement_participant_id
      and participant.company_id = p_roster_company_id
      and participant.participant_status = 'active'
      and engagement.engagement_status = 'active'
      and relationship.relationship_status = 'active'
      and engagement_location.location_status = 'active'
      and (p_engagement_office_id is null or engagement_office.office_status = 'active')
  ) then
    raise exception 'The selected relationship path is still in review or is not active.';
  end if;

  if p_roster_id is null then
    insert into core.company_roster (
      company_id, full_name, email, phone, worker_type, job_title,
      employment_status, hire_date, reports_to_roster_id, roster_record_kind,
      company_location_id, company_location_office_id, seat_type
    ) values (
      p_roster_company_id, btrim(p_full_name), nullif(lower(btrim(coalesce(p_email, ''))), ''),
      nullif(btrim(coalesce(p_phone, '')), ''), p_job_title, p_job_title,
      p_employment_status, p_effective_from, p_reports_to_roster_id, 'INTERNAL',
      case when p_engagement_participant_id is null then p_company_location_id end,
      case when p_engagement_participant_id is null then p_company_location_office_id end,
      p_seat_type
    ) returning id into v_roster_id;

    insert into core.company_roster_entry_provenance (
      roster_id, roster_owner_company_id, entry_authority, entry_channel,
      entered_by_company_id, entered_by_profile_id
    ) values (
      v_roster_id, p_roster_company_id, 'owner_company', 'manual',
      p_roster_company_id, core.current_profile_id()
    );
  else
    select roster.* into v_existing
    from core.company_roster roster
    where roster.id = p_roster_id and roster.company_id = p_roster_company_id
    for update;
    if v_existing.id is null then raise exception 'Roster record not found.'; end if;

    select public.itf_save_roster_member(
      p_company_slug,
      p_roster_id,
      p_full_name,
      p_email,
      p_phone,
      p_employment_status,
      case when p_engagement_participant_id is null then p_company_location_id end,
      case when p_engagement_participant_id is null then p_company_location_office_id end,
      p_job_title,
      p_seat_type,
      p_reports_to_roster_id,
      p_identifiers,
      p_replacement_roster_id
    ) into v_result;
  end if;

  if p_roster_id is null then
    for v_identifier in
      select key as identifier_type, btrim(value) as identifier_value
      from jsonb_each_text(coalesce(p_identifiers, '{}'::jsonb))
      where key in ('tech_id', 'fuse_emp_id', 'nt_login', 'csg')
        and nullif(btrim(value), '') is not null
    loop
      insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
      values (v_roster_id, v_identifier.identifier_type, v_identifier.identifier_value);
    end loop;
  end if;

  select assignment.* into v_current
  from core.itf_workforce_assignment assignment
  where assignment.product_id = v_product_id
    and assignment.roster_id = v_roster_id
    and assignment.effective_end is null
  for update;

  v_assignment_changed := v_current.id is null
    or v_current.roster_company_id is distinct from p_roster_company_id
    or v_current.engagement_participant_id is distinct from p_engagement_participant_id
    or v_current.company_location_id is distinct from (case when p_engagement_participant_id is null then p_company_location_id end)
    or v_current.company_location_office_id is distinct from (case when p_engagement_participant_id is null then p_company_location_office_id end)
    or v_current.engagement_location_id is distinct from p_engagement_location_id
    or v_current.engagement_office_id is distinct from p_engagement_office_id
    or v_current.job_title is distinct from p_job_title
    or v_current.seat_type is distinct from p_seat_type
    or v_current.assignment_status is distinct from p_assignment_status
    or v_current.reports_to_roster_id is distinct from p_reports_to_roster_id;

  if v_assignment_changed then
    if v_current.id is not null then
      if p_effective_from <= v_current.effective_start then
        raise exception 'Assignment changes must take effect after the current assignment start date (%). Identity corrections can still be saved without changing the assignment.', v_current.effective_start;
      end if;
      update core.itf_workforce_assignment
      set effective_end = p_effective_from - 1, updated_at = now()
      where id = v_current.id;
    end if;

    insert into core.itf_workforce_assignment (
      product_id, roster_id, roster_company_id, engagement_participant_id,
      company_location_id, company_location_office_id, engagement_location_id,
      engagement_office_id, job_title, seat_type, assignment_status,
      reports_to_roster_id, effective_start, source_channel,
      supersedes_assignment_id, created_by_profile_id
    ) values (
      v_product_id, v_roster_id, p_roster_company_id, p_engagement_participant_id,
      case when p_engagement_participant_id is null then p_company_location_id end,
      case when p_engagement_participant_id is null then p_company_location_office_id end,
      p_engagement_location_id, p_engagement_office_id, p_job_title, p_seat_type,
      p_assignment_status, p_reports_to_roster_id, p_effective_from, 'manual',
      v_current.id, core.current_profile_id()
    ) returning id into v_new_assignment_id;
  else
    v_new_assignment_id := v_current.id;
  end if;

  -- The existing retirement command performs the one-click roster reassignment.
  -- Mirror those changed reporting lines into dated ITF assignments.
  if p_employment_status = 'Former' and p_replacement_roster_id is not null then
    for v_direct_report in
      select assignment.*
      from core.itf_workforce_assignment assignment
      join core.company_roster roster on roster.id = assignment.roster_id
      where assignment.product_id = v_product_id
        and assignment.reports_to_roster_id = v_roster_id
        and assignment.effective_end is null
        and roster.reports_to_roster_id = p_replacement_roster_id
      for update of assignment
    loop
      if p_effective_from <= v_direct_report.effective_start then
        raise exception 'Team reassignment date must follow every affected assignment start date.';
      end if;
      update core.itf_workforce_assignment
      set effective_end = p_effective_from - 1, updated_at = now()
      where id = v_direct_report.id;
      insert into core.itf_workforce_assignment (
        product_id, roster_id, roster_company_id, engagement_participant_id,
        company_location_id, company_location_office_id, engagement_location_id,
        engagement_office_id, job_title, seat_type, assignment_status,
        reports_to_roster_id, effective_start, source_channel,
        supersedes_assignment_id, created_by_profile_id
      ) values (
        v_direct_report.product_id, v_direct_report.roster_id, v_direct_report.roster_company_id,
        v_direct_report.engagement_participant_id, v_direct_report.company_location_id,
        v_direct_report.company_location_office_id, v_direct_report.engagement_location_id,
        v_direct_report.engagement_office_id, v_direct_report.job_title,
        v_direct_report.seat_type, v_direct_report.assignment_status,
        p_replacement_roster_id, p_effective_from, 'leader_reassignment',
        v_direct_report.id, core.current_profile_id()
      );
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster_id,
    'assignment_id', v_new_assignment_id,
    'assignment_versioned', v_assignment_changed,
    'effective_from', p_effective_from
  );
end;
$$;

revoke all on function public.itf_save_roster_member_v2(
  text, uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid,
  text, text, text, uuid, date, jsonb, uuid
) from public, anon;
grant execute on function public.itf_save_roster_member_v2(
  text, uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid,
  text, text, text, uuid, date, jsonb, uuid
) to authenticated;

commit;
