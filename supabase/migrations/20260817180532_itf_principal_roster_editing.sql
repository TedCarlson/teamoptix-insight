begin;

-- The open workspace governs which roster rows may be edited. The roster owner
-- remains unchanged; a principal may edit only provider rows currently assigned
-- through that principal's ITF relationship.
create or replace function public.itf_save_workspace_roster_member(
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
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_product_id uuid;
  v_roster_id uuid := p_roster_id;
  v_roster core.company_roster%rowtype;
  v_current core.itf_workforce_assignment%rowtype;
  v_replacement core.company_roster%rowtype;
  v_new_assignment_id uuid;
  v_identifier record;
  v_direct_report record;
  v_direct_report_count integer := 0;
  v_assignment_changed boolean := false;
  v_assignment_versioned boolean := false;
  v_uses_relationship boolean;
  v_is_on_behalf boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id
  into v_workspace_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_workspace_company_id is null then
    raise exception 'Company not found.';
  end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from core.companies company
    where company.id = p_roster_company_id and company.company_status = 'active'
  ) then
    raise exception 'Roster owner company not found.';
  end if;

  v_uses_relationship := p_engagement_participant_id is not null;
  v_is_on_behalf := p_roster_company_id is distinct from v_workspace_company_id;

  if nullif(btrim(coalesce(p_full_name, '')), '') is null then
    raise exception 'A full name is required.';
  end if;
  if p_effective_from is null then
    raise exception 'An effective date is required.';
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
  if p_assignment_status not in ('pending', 'active', 'inactive') then
    raise exception 'Unsupported assignment status.';
  end if;

  select product.id
  into v_product_id
  from ref.insight_products product
  where product.product_key = 'insight-telecom-fulfillment';

  if p_roster_id is not null then
    select roster.*
    into v_roster
    from core.company_roster roster
    where roster.id = p_roster_id
      and roster.company_id = p_roster_company_id
    for update;

    if v_roster.id is null then
      raise exception 'Roster record not found.';
    end if;

    if v_is_on_behalf and not exists (
      select 1
      from core.itf_workforce_assignment assignment
      join core.company_engagement_participant participant
        on participant.id = assignment.engagement_participant_id
      join core.company_engagement engagement
        on engagement.id = participant.engagement_id
      join core.company_relationship relationship
        on relationship.id = engagement.relationship_id
      where assignment.product_id = v_product_id
        and assignment.roster_id = v_roster.id
        and assignment.effective_end is null
        and relationship.principal_company_id = v_workspace_company_id
    ) then
      raise exception 'This provider roster row is not assigned to the active company workspace.' using errcode = '42501';
    end if;
  end if;

  if v_uses_relationship then
    if not exists (
      select 1
      from core.company_engagement_participant participant
      join core.company_engagement engagement
        on engagement.id = participant.engagement_id
      join core.company_relationship relationship
        on relationship.id = engagement.relationship_id
      join core.company_engagement_location engagement_location
        on engagement_location.id = p_engagement_location_id
       and engagement_location.engagement_id = engagement.id
      left join core.company_engagement_office engagement_office
        on engagement_office.id = p_engagement_office_id
       and engagement_office.engagement_location_id = engagement_location.id
      where participant.id = p_engagement_participant_id
        and participant.company_id = p_roster_company_id
        and (
          (not v_is_on_behalf and participant.company_id = v_workspace_company_id)
          or (v_is_on_behalf and relationship.principal_company_id = v_workspace_company_id)
        )
        and relationship.relationship_status in ('proposed', 'active')
        and engagement.engagement_status in ('draft', 'active')
        and participant.participant_status in ('review', 'active')
        and engagement_location.location_status in ('review', 'active')
        and (
          p_engagement_office_id is null
          or engagement_office.office_status in ('review', 'active')
        )
    ) then
      raise exception 'The selected provider assignment path is not available to this company workspace.';
    end if;
  else
    if v_is_on_behalf then
      raise exception 'A principal may add a provider roster row only through a provider relationship path.';
    end if;
    if p_company_location_id is not null and not exists (
      select 1
      from core.company_location location
      where location.id = p_company_location_id
        and location.company_id = v_workspace_company_id
        and location.location_status = 'active'
    ) then
      raise exception 'The workforce unit is not active for this company.';
    end if;
    if p_company_location_office_id is not null and not exists (
      select 1
      from core.company_location_office office
      where office.id = p_company_location_office_id
        and office.company_id = v_workspace_company_id
        and office.company_location_id = p_company_location_id
        and office.office_status = 'active'
    ) then
      raise exception 'The office is not active for the selected workforce unit.';
    end if;
  end if;

  if p_reports_to_roster_id = v_roster_id then
    raise exception 'A roster member cannot report to themself.';
  end if;
  if p_reports_to_roster_id is not null and not exists (
    select 1
    from public.itf_workspace_roster(p_company_slug) visible
    where visible.roster_member_id = p_reports_to_roster_id
      and visible.employment_status = 'Active'
  ) then
    raise exception 'Reports to must be an active leader visible in this company workspace.';
  end if;

  if p_roster_id is null then
    insert into core.company_roster (
      company_id, full_name, email, phone, worker_type, job_title,
      employment_status, hire_date, reports_to_roster_id, roster_record_kind,
      company_location_id, company_location_office_id, seat_type
    ) values (
      p_roster_company_id,
      btrim(p_full_name),
      nullif(lower(btrim(coalesce(p_email, ''))), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      p_job_title,
      p_job_title,
      p_employment_status,
      p_effective_from,
      p_reports_to_roster_id,
      'INTERNAL',
      case when v_uses_relationship then null else p_company_location_id end,
      case when v_uses_relationship then null else p_company_location_office_id end,
      p_seat_type
    ) returning * into v_roster;
    v_roster_id := v_roster.id;

    insert into core.company_roster_entry_provenance (
      roster_id, roster_owner_company_id, entry_authority, entry_channel,
      entered_by_company_id, entered_by_profile_id
    ) values (
      v_roster_id,
      p_roster_company_id,
      case when v_is_on_behalf then 'principal_on_behalf' else 'owner_company' end,
      'manual',
      v_workspace_company_id,
      core.current_profile_id()
    );
  else
    select count(*)::integer
    into v_direct_report_count
    from core.itf_workforce_assignment report_assignment
    join core.company_roster report_roster
      on report_roster.id = report_assignment.roster_id
    where report_assignment.product_id = v_product_id
      and report_assignment.reports_to_roster_id = v_roster_id
      and report_assignment.effective_end is null
      and report_roster.employment_status <> 'Former'
      and (
        report_roster.company_id = v_workspace_company_id
        or exists (
          select 1
          from core.company_engagement_participant participant
          join core.company_engagement engagement on engagement.id = participant.engagement_id
          join core.company_relationship relationship on relationship.id = engagement.relationship_id
          where participant.id = report_assignment.engagement_participant_id
            and relationship.principal_company_id = v_workspace_company_id
        )
      );

    if p_employment_status = 'Former' and v_direct_report_count > 0 then
      if p_replacement_roster_id is null then
        raise exception 'A replacement leader is required for % direct reports.', v_direct_report_count;
      end if;
      if p_replacement_roster_id = v_roster_id then
        raise exception 'The retiring leader cannot replace themself.';
      end if;

      select roster.*
      into v_replacement
      from core.company_roster roster
      join public.itf_workspace_roster(p_company_slug) visible
        on visible.roster_member_id = roster.id
      where roster.id = p_replacement_roster_id
        and roster.employment_status = 'Active'
        and coalesce(visible.job_title, roster.job_title) in (
          'BP Supervisor', 'BP Lead', 'BP Owner', 'ITG Supervisor',
          'QA Supervisor', 'Project Manager', 'Regional Manager',
          'Director', 'VP', 'Admin'
        )
      limit 1;

      if v_replacement.id is null then
        raise exception 'An active replacement leader visible in this workspace is required.';
      end if;

      for v_direct_report in
        select report_assignment.*
        from core.itf_workforce_assignment report_assignment
        join core.company_roster report_roster on report_roster.id = report_assignment.roster_id
        where report_assignment.product_id = v_product_id
          and report_assignment.reports_to_roster_id = v_roster_id
          and report_assignment.effective_end is null
          and report_roster.employment_status <> 'Former'
          and (
            report_roster.company_id = v_workspace_company_id
            or exists (
              select 1
              from core.company_engagement_participant participant
              join core.company_engagement engagement on engagement.id = participant.engagement_id
              join core.company_relationship relationship on relationship.id = engagement.relationship_id
              where participant.id = report_assignment.engagement_participant_id
                and relationship.principal_company_id = v_workspace_company_id
            )
          )
        for update of report_assignment
      loop
        update core.company_roster
        set reports_to_roster_id = v_replacement.id
        where id = v_direct_report.roster_id;

        insert into core.company_roster_event (
          company_id, roster_id, event_category, event_type, event_detail,
          event_metadata, created_by_profile_id
        ) values (
          v_direct_report.roster_company_id,
          v_direct_report.roster_id,
          'operations',
          'leader_bulk_reassigned',
          'Reporting responsibility reassigned during leader retirement.',
          jsonb_build_object(
            'workspace_company_id', v_workspace_company_id,
            'former_leader_roster_id', v_roster_id,
            'replacement_leader_roster_id', v_replacement.id
          ),
          core.current_profile_id()
        );

        if p_effective_from < v_direct_report.effective_start then
          raise exception 'Team reassignment date cannot precede an affected assignment start date.';
        elsif p_effective_from = v_direct_report.effective_start then
          update core.itf_workforce_assignment
          set reports_to_roster_id = v_replacement.id, updated_at = now()
          where id = v_direct_report.id;
        else
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
            v_direct_report.product_id, v_direct_report.roster_id,
            v_direct_report.roster_company_id, v_direct_report.engagement_participant_id,
            v_direct_report.company_location_id, v_direct_report.company_location_office_id,
            v_direct_report.engagement_location_id, v_direct_report.engagement_office_id,
            v_direct_report.job_title, v_direct_report.seat_type,
            v_direct_report.assignment_status, v_replacement.id, p_effective_from,
            'leader_reassignment', v_direct_report.id, core.current_profile_id()
          );
        end if;
      end loop;
    end if;

    update core.company_roster
    set full_name = btrim(p_full_name),
        email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
        phone = nullif(btrim(coalesce(p_phone, '')), ''),
        employment_status = p_employment_status,
        company_location_id = case when v_uses_relationship then null else p_company_location_id end,
        company_location_office_id = case when v_uses_relationship then null else p_company_location_office_id end,
        job_title = p_job_title,
        seat_type = p_seat_type,
        reports_to_roster_id = p_reports_to_roster_id,
        separation_date = case
          when p_employment_status = 'Former' then coalesce(separation_date, p_effective_from)
          else null
        end
    where id = v_roster_id;
  end if;

  delete from core.company_roster_identifier
  where roster_id = v_roster_id
    and identifier_type in ('tech_id', 'fuse_emp_id', 'nt_login', 'csg');

  for v_identifier in
    select key as identifier_type, btrim(value) as identifier_value
    from jsonb_each_text(coalesce(p_identifiers, '{}'::jsonb))
    where key in ('tech_id', 'fuse_emp_id', 'nt_login', 'csg')
      and nullif(btrim(value), '') is not null
  loop
    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (v_roster_id, v_identifier.identifier_type, v_identifier.identifier_value);
  end loop;

  select assignment.*
  into v_current
  from core.itf_workforce_assignment assignment
  where assignment.product_id = v_product_id
    and assignment.roster_id = v_roster_id
    and assignment.effective_end is null
  for update;

  v_assignment_changed := v_current.id is null
    or v_current.roster_company_id is distinct from p_roster_company_id
    or v_current.engagement_participant_id is distinct from p_engagement_participant_id
    or v_current.company_location_id is distinct from (case when v_uses_relationship then null else p_company_location_id end)
    or v_current.company_location_office_id is distinct from (case when v_uses_relationship then null else p_company_location_office_id end)
    or v_current.engagement_location_id is distinct from p_engagement_location_id
    or v_current.engagement_office_id is distinct from p_engagement_office_id
    or v_current.job_title is distinct from p_job_title
    or v_current.seat_type is distinct from p_seat_type
    or v_current.assignment_status is distinct from p_assignment_status
    or v_current.reports_to_roster_id is distinct from p_reports_to_roster_id;

  if v_assignment_changed then
    if v_current.id is null then
      null;
    elsif p_effective_from < v_current.effective_start then
      raise exception 'Assignment changes cannot precede the current assignment start date (%).', v_current.effective_start;
    elsif p_effective_from = v_current.effective_start then
      update core.itf_workforce_assignment
      set roster_company_id = p_roster_company_id,
          engagement_participant_id = p_engagement_participant_id,
          company_location_id = case when v_uses_relationship then null else p_company_location_id end,
          company_location_office_id = case when v_uses_relationship then null else p_company_location_office_id end,
          engagement_location_id = p_engagement_location_id,
          engagement_office_id = p_engagement_office_id,
          job_title = p_job_title,
          seat_type = p_seat_type,
          assignment_status = p_assignment_status,
          reports_to_roster_id = p_reports_to_roster_id,
          updated_at = now()
      where id = v_current.id;
      v_new_assignment_id := v_current.id;
    else
      update core.itf_workforce_assignment
      set effective_end = p_effective_from - 1, updated_at = now()
      where id = v_current.id;
      v_assignment_versioned := true;
    end if;

    if v_current.id is null or p_effective_from > v_current.effective_start then
      insert into core.itf_workforce_assignment (
        product_id, roster_id, roster_company_id, engagement_participant_id,
        company_location_id, company_location_office_id, engagement_location_id,
        engagement_office_id, job_title, seat_type, assignment_status,
        reports_to_roster_id, effective_start, source_channel,
        supersedes_assignment_id, created_by_profile_id
      ) values (
        v_product_id, v_roster_id, p_roster_company_id, p_engagement_participant_id,
        case when v_uses_relationship then null else p_company_location_id end,
        case when v_uses_relationship then null else p_company_location_office_id end,
        p_engagement_location_id, p_engagement_office_id, p_job_title,
        p_seat_type, p_assignment_status, p_reports_to_roster_id,
        p_effective_from,
        case when v_is_on_behalf then 'principal_on_behalf' else 'manual' end,
        v_current.id, core.current_profile_id()
      ) returning id into v_new_assignment_id;
    end if;
  else
    v_new_assignment_id := v_current.id;
  end if;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail,
    event_metadata, created_by_profile_id
  ) values (
    p_roster_company_id,
    v_roster_id,
    case when p_employment_status = 'Former' then 'separation' else 'operations' end,
    case
      when p_employment_status = 'Former' and v_direct_report_count > 0
        then 'leader_retired_and_team_reassigned'
      when v_is_on_behalf then 'roster_member_saved_on_behalf'
      else 'roster_member_saved'
    end,
    'Roster member saved through the ITF company workspace.',
    jsonb_build_object(
      'workspace_company_id', v_workspace_company_id,
      'roster_owner_company_id', p_roster_company_id,
      'entry_authority', case when v_is_on_behalf then 'principal_on_behalf' else 'owner_company' end,
      'assignment_id', v_new_assignment_id,
      'assignment_versioned', v_assignment_versioned
    ),
    core.current_profile_id()
  );

  return jsonb_build_object(
    'ok', true,
    'roster_id', v_roster_id,
    'assignment_id', v_new_assignment_id,
    'assignment_versioned', v_assignment_versioned,
    'edited_on_behalf', v_is_on_behalf,
    'effective_from', p_effective_from
  );
end;
$$;

revoke all on function public.itf_save_workspace_roster_member(
  text, uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid,
  text, text, text, uuid, date, jsonb, uuid
) from public, anon;
grant execute on function public.itf_save_workspace_roster_member(
  text, uuid, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid,
  text, text, text, uuid, date, jsonb, uuid
) to authenticated;

-- Relationship choices are projected from either side of the relationship.
-- Review-state rows are editable for setup; suspended, paused, and ended paths
-- remain locked.
create or replace function public.itf_roster_relationship_context(p_company_slug text)
returns table (
  owner_company_id uuid, owner_company_name text, owner_company_slug text,
  affiliation_type text, engagement_participant_id uuid, relationship_id uuid,
  relationship_label text, relationship_status text, engagement_id uuid,
  engagement_status text, principal_company_name text, reporting_company_name text,
  engagement_location_id uuid, location_id uuid, location_code text,
  location_name text, region_name text, division_name text,
  engagement_office_id uuid, office_id uuid, office_name text, can_assign boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select v_company_id, workspace.company_name, workspace.company_slug, 'W-2'::text,
         null::uuid, null::uuid, 'Direct company workforce'::text, 'active'::text,
         null::uuid, 'active'::text, workspace.company_name, workspace.company_name,
         null::uuid, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name, null::uuid, office.id, office.office_name,
         (coalesce(location.location_status = 'active', true) and coalesce(office.office_status, 'active') = 'active')
  from core.companies workspace
  left join core.company_location location on location.company_id = workspace.id and location.location_status = 'active'
  left join core.company_location_office office on office.company_location_id = location.id and office.office_status = 'active'
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where workspace.id = v_company_id

  union all

  select participant.company_id, owner.company_name, owner.company_slug, 'Business Partner'::text,
         participant.id, relationship.id,
         principal.company_name || ' · ' || engagement.engagement_name,
         relationship.relationship_status, engagement.id, engagement.engagement_status,
         principal.company_name, reporting.company_name,
         engagement_location.id, location.id, location.location_code, location.location_name,
         region.region_name, division.division_name,
         engagement_office.id, office.id, office.office_name,
         relationship.relationship_status in ('proposed', 'active')
           and engagement.engagement_status in ('draft', 'active')
           and participant.participant_status in ('review', 'active')
           and engagement_location.location_status in ('review', 'active')
           and coalesce(engagement_office.office_status, 'review') in ('review', 'active')
  from core.company_engagement_participant participant
  join core.companies owner on owner.id = participant.company_id
  join core.company_engagement engagement on engagement.id = participant.engagement_id
  join core.company_relationship relationship on relationship.id = engagement.relationship_id
  join core.companies principal on principal.id = relationship.principal_company_id
  join core.companies reporting on reporting.id = participant.reporting_company_id
  join core.company_engagement_location engagement_location on engagement_location.engagement_id = engagement.id
  join core.company_location location on location.id = engagement_location.principal_company_location_id
  left join core.company_engagement_office engagement_office on engagement_office.engagement_location_id = engagement_location.id
  left join core.company_location_office office on office.id = engagement_office.principal_company_location_office_id
  left join core.company_location_region_assignment current_region
    on current_region.company_location_id = location.id
   and current_region.ends_on is null
   and current_region.assignment_status = 'active'
  left join core.company_operating_region region on region.id = current_region.company_region_id
  left join core.company_operating_division division on division.id = region.division_id
  where participant.company_id = v_company_id
     or relationship.principal_company_id = v_company_id;
end;
$$;

revoke all on function public.itf_roster_relationship_context(text) from public, anon;
grant execute on function public.itf_roster_relationship_context(text) to authenticated;

commit;
