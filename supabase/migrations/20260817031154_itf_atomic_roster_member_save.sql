begin;

-- The roster policies already restrict every write to company administrators
-- and the platform owner. These grants let SECURITY INVOKER workflows reach
-- those policies instead of rolling the entire transaction back at the audit
-- or identifier step.
grant insert on table core.company_roster_event to authenticated;
grant insert, update, delete on table core.company_roster_identifier to authenticated;

create or replace function public.itf_save_roster_member(
  p_company_slug text,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_employment_status text,
  p_company_location_id uuid,
  p_company_location_office_id uuid,
  p_job_title text,
  p_seat_type text,
  p_reports_to_roster_id uuid,
  p_identifiers jsonb,
  p_replacement_roster_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_roster core.company_roster%rowtype;
  v_reports_to core.company_roster%rowtype;
  v_replacement core.company_roster%rowtype;
  v_direct_report_count integer := 0;
  v_identifier record;
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

  select roster.* into v_roster
  from core.company_roster roster
  where roster.id = p_roster_id
    and roster.company_id = v_company_id
  for update;

  if v_roster.id is null then
    raise exception 'Roster record not found.';
  end if;

  if nullif(btrim(coalesce(p_full_name, '')), '') is null then
    raise exception 'A full name is required.';
  end if;

  if p_employment_status not in ('Active', 'Candidate', 'Trainee', 'Former') then
    raise exception 'Unsupported roster status.';
  end if;

  if p_job_title not in (
    'Technician', 'Drop Bury', 'BP Supervisor', 'BP Lead', 'BP Owner',
    'ITG Supervisor', 'QA Supervisor', 'Project Manager', 'Regional Manager',
    'Director', 'VP', 'Admin', 'Unknown'
  ) then
    raise exception 'Unsupported position title.';
  end if;

  if p_seat_type not in (
    'FIELD', 'LEADERSHIP', 'SUPPORT', 'TRAVEL', 'DROP_BURY', 'TRAINING', 'FMLA'
  ) then
    raise exception 'Unsupported seat.';
  end if;

  if p_company_location_id is not null and not exists (
    select 1
    from core.company_location location
    where location.id = p_company_location_id
      and location.company_id = v_company_id
      and location.location_status = 'active'
  ) then
    raise exception 'The workforce unit is not active for this company.';
  end if;

  if p_company_location_office_id is not null and not exists (
    select 1
    from core.company_location_office office
    where office.id = p_company_location_office_id
      and office.company_id = v_company_id
      and office.company_location_id = p_company_location_id
      and office.office_status = 'active'
  ) then
    raise exception 'The office is not active for the selected workforce unit.';
  end if;

  if p_reports_to_roster_id = v_roster.id then
    raise exception 'A roster member cannot report to themself.';
  end if;

  if p_reports_to_roster_id is not null then
    select roster.* into v_reports_to
    from core.company_roster roster
    where roster.id = p_reports_to_roster_id
      and roster.company_id = v_company_id
      and roster.employment_status = 'Active';

    if v_reports_to.id is null then
      raise exception 'Reports to must be an active leader in this company.';
    end if;
  end if;

  select count(*)::integer into v_direct_report_count
  from core.company_roster report
  where report.company_id = v_company_id
    and report.reports_to_roster_id = v_roster.id
    and report.employment_status <> 'Former';

  if p_employment_status = 'Former' and v_direct_report_count > 0 then
    if p_replacement_roster_id is null then
      raise exception 'A replacement leader is required for % direct reports.', v_direct_report_count;
    end if;

    if p_replacement_roster_id = v_roster.id then
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
      'BP Supervisor', 'BP Lead', 'BP Owner', 'ITG Supervisor', 'QA Supervisor',
      'Project Manager', 'Regional Manager', 'Director', 'VP', 'Admin'
    ) then
      raise exception 'The replacement roster member is not assigned a leadership position.';
    end if;

    if v_replacement.company_location_id is not null
       and v_replacement.company_location_id is distinct from v_roster.company_location_id then
      raise exception 'The replacement must belong to the same location or company-wide leadership.';
    end if;

    insert into core.company_roster_event (
      company_id, roster_id, event_category, event_type, event_detail,
      event_metadata, created_by_profile_id
    )
    select
      v_company_id,
      report.id,
      'operations',
      'leader_bulk_reassigned',
      'Reporting responsibility reassigned during leader retirement.',
      jsonb_build_object(
        'former_leader_roster_id', v_roster.id,
        'former_leader_name', v_roster.full_name,
        'replacement_leader_roster_id', v_replacement.id,
        'replacement_leader_name', v_replacement.full_name
      ),
      core.current_profile_id()
    from core.company_roster report
    where report.company_id = v_company_id
      and report.reports_to_roster_id = v_roster.id
      and report.employment_status <> 'Former';

    update core.company_roster report
    set reports_to_roster_id = v_replacement.id
    where report.company_id = v_company_id
      and report.reports_to_roster_id = v_roster.id
      and report.employment_status <> 'Former'
      and report.id <> v_replacement.id;

    if v_replacement.reports_to_roster_id = v_roster.id then
      update core.company_roster
      set reports_to_roster_id = v_roster.reports_to_roster_id
      where id = v_replacement.id;
    end if;
  end if;

  update core.company_roster
  set
    full_name = btrim(p_full_name),
    email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    employment_status = p_employment_status,
    company_location_id = p_company_location_id,
    company_location_office_id = p_company_location_office_id,
    job_title = p_job_title,
    seat_type = p_seat_type,
    reports_to_roster_id = p_reports_to_roster_id,
    separation_date = case
      when p_employment_status = 'Former' then coalesce(separation_date, current_date)
      else null
    end
  where id = v_roster.id;

  delete from core.company_roster_identifier
  where roster_id = v_roster.id
    and identifier_type in ('tech_id', 'fuse_emp_id', 'nt_login', 'csg');

  for v_identifier in
    select key as identifier_type, btrim(value) as identifier_value
    from jsonb_each_text(coalesce(p_identifiers, '{}'::jsonb))
    where key in ('tech_id', 'fuse_emp_id', 'nt_login', 'csg')
      and nullif(btrim(value), '') is not null
  loop
    insert into core.company_roster_identifier (
      roster_id, identifier_type, identifier_value
    ) values (
      v_roster.id, v_identifier.identifier_type, v_identifier.identifier_value
    );
  end loop;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, created_by_profile_id
  ) values (
    v_company_id,
    v_roster.id,
    case when p_employment_status = 'Former' then 'separation' else 'operations' end,
    case
      when p_employment_status = 'Former' and v_direct_report_count > 0
        then 'leader_retired_and_team_reassigned'
      else 'roster_member_saved'
    end,
    'Roster member saved through the ITF roster workspace.',
    jsonb_build_object(
      'previous_name', v_roster.full_name,
      'full_name', btrim(p_full_name),
      'previous_status', v_roster.employment_status,
      'employment_status', p_employment_status,
      'replacement_leader_roster_id', v_replacement.id,
      'reassigned_count', case
        when p_employment_status = 'Former' then v_direct_report_count
        else 0
      end
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster.id,
    'full_name', btrim(p_full_name),
    'employment_status', p_employment_status,
    'replacement_leader_roster_id', v_replacement.id,
    'reassigned_count', case
      when p_employment_status = 'Former' then v_direct_report_count
      else 0
    end
  );
end;
$$;

revoke all on function public.itf_save_roster_member(
  text, uuid, text, text, text, text, uuid, uuid, text, text, uuid, jsonb, uuid
) from public, anon;
grant execute on function public.itf_save_roster_member(
  text, uuid, text, text, text, text, uuid, uuid, text, text, uuid, jsonb, uuid
) to authenticated;

commit;
