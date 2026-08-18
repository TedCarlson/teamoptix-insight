begin;

create or replace function public.itf_update_roster_status(
  p_company_slug text,
  p_roster_id uuid,
  p_employment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_direct_report_count integer;
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

  if p_employment_status not in ('Active', 'Candidate', 'Trainee', 'Former') then
    raise exception 'Unsupported roster status.';
  end if;

  select roster.* into v_roster
  from core.company_roster roster
  where roster.id = p_roster_id
    and roster.company_id = v_company_id
  for update;

  if v_roster.id is null then
    raise exception 'Roster record not found.';
  end if;

  if p_employment_status = 'Former' then
    select count(*)::integer into v_direct_report_count
    from core.company_roster roster
    where roster.company_id = v_company_id
      and roster.reports_to_roster_id = v_roster.id
      and roster.employment_status <> 'Former';

    if v_direct_report_count > 0 then
      raise exception 'This leader has % direct reports. Use the retirement reassignment workflow.', v_direct_report_count;
    end if;
  end if;

  update core.company_roster
  set
    employment_status = p_employment_status,
    separation_date = case
      when p_employment_status = 'Former' then coalesce(separation_date, current_date)
      else null
    end
  where id = v_roster.id;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_company_id,
    v_roster.id,
    case when p_employment_status = 'Former' then 'separation' else 'operations' end,
    'roster_status_changed',
    'Roster status changed through the ITF roster workspace.',
    jsonb_build_object(
      'previous_status', v_roster.employment_status,
      'new_status', p_employment_status
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster.id,
    'previous_status', v_roster.employment_status,
    'employment_status', p_employment_status
  );
end;
$$;

create or replace function public.itf_retire_roster_leader(
  p_company_slug text,
  p_leader_roster_id uuid,
  p_replacement_roster_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_leader core.company_roster%rowtype;
  v_replacement core.company_roster%rowtype;
  v_direct_report_count integer;
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

  select roster.* into v_leader
  from core.company_roster roster
  where roster.id = p_leader_roster_id
    and roster.company_id = v_company_id
  for update;

  if v_leader.id is null then
    raise exception 'Leader roster record not found.';
  end if;

  select count(*)::integer into v_direct_report_count
  from core.company_roster roster
  where roster.company_id = v_company_id
    and roster.reports_to_roster_id = v_leader.id
    and roster.employment_status <> 'Former';

  if v_direct_report_count > 0 and p_replacement_roster_id is null then
    raise exception 'A replacement leader is required for % direct reports.', v_direct_report_count;
  end if;

  if p_replacement_roster_id is not null then
    if p_replacement_roster_id = v_leader.id then
      raise exception 'The retiring leader cannot replace themself.';
    end if;

    select roster.* into v_replacement
    from core.company_roster roster
    where roster.id = p_replacement_roster_id
      and roster.company_id = v_company_id
      and roster.employment_status = 'Active'
    for update;

    if v_replacement.id is null then
      raise exception 'An active replacement leader in this company is required.';
    end if;

    if v_replacement.job_title not in (
      'BP Supervisor',
      'BP Lead',
      'BP Owner',
      'ITG Supervisor',
      'QA Supervisor',
      'Project Manager',
      'Regional Manager',
      'Director',
      'VP',
      'Admin'
    ) then
      raise exception 'The replacement roster member is not assigned a leadership position.';
    end if;

    if v_replacement.company_location_id is not null
       and v_replacement.company_location_id is distinct from v_leader.company_location_id then
      raise exception 'The replacement must belong to the same location or company-wide leadership.';
    end if;
  end if;

  if v_direct_report_count > 0 then
    insert into core.company_roster_event (
      company_id,
      roster_id,
      event_category,
      event_type,
      event_detail,
      event_metadata,
      created_by_profile_id
    )
    select
      v_company_id,
      report.id,
      'operations',
      'leader_bulk_reassigned',
      'Reporting responsibility reassigned during leader retirement.',
      jsonb_build_object(
        'former_leader_roster_id', v_leader.id,
        'former_leader_name', v_leader.full_name,
        'replacement_leader_roster_id', v_replacement.id,
        'replacement_leader_name', v_replacement.full_name
      ),
      core.current_profile_id()
    from core.company_roster report
    where report.company_id = v_company_id
      and report.reports_to_roster_id = v_leader.id
      and report.employment_status <> 'Former';

    update core.company_roster report
    set reports_to_roster_id = v_replacement.id
    where report.company_id = v_company_id
      and report.reports_to_roster_id = v_leader.id
      and report.employment_status <> 'Former'
      and report.id <> v_replacement.id;

    if v_replacement.reports_to_roster_id = v_leader.id then
      update core.company_roster
      set reports_to_roster_id = v_leader.reports_to_roster_id
      where id = v_replacement.id;
    end if;
  end if;

  update core.company_roster
  set
    employment_status = 'Former',
    separation_date = coalesce(separation_date, current_date)
  where id = v_leader.id;

  insert into core.company_roster_event (
    company_id,
    roster_id,
    event_category,
    event_type,
    event_detail,
    event_metadata,
    created_by_profile_id
  ) values (
    v_company_id,
    v_leader.id,
    'separation',
    'leader_retired_and_team_reassigned',
    'Leader retired from active duty; reporting history was preserved.',
    jsonb_build_object(
      'direct_report_count', v_direct_report_count,
      'replacement_leader_roster_id', v_replacement.id,
      'replacement_leader_name', v_replacement.full_name,
      'retired_on', current_date
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'leader_roster_id', v_leader.id,
    'leader_name', v_leader.full_name,
    'replacement_leader_roster_id', v_replacement.id,
    'replacement_leader_name', v_replacement.full_name,
    'reassigned_count', v_direct_report_count,
    'retired_on', current_date
  );
end;
$$;

revoke all on function public.itf_update_roster_status(text, uuid, text) from public, anon;
grant execute on function public.itf_update_roster_status(text, uuid, text) to authenticated;
revoke all on function public.itf_retire_roster_leader(text, uuid, uuid) from public, anon;
grant execute on function public.itf_retire_roster_leader(text, uuid, uuid) to authenticated;

commit;
