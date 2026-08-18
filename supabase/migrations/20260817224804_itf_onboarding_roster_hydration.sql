begin;

-- An onboarding candidate is supplemental lifecycle data attached to the
-- company-owned roster. It is not a second roster and it does not create a
-- workforce assignment until an operator handles the Started transition.
create or replace function core.itf_ensure_onboarding_roster(
  p_workspace_company_id uuid,
  p_roster_company_id uuid,
  p_candidate_id uuid,
  p_full_name text,
  p_tech_id text,
  p_fuse_personnel_id text,
  p_location_code text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roster_id uuid;
  v_source_engagement_id uuid;
  v_company_location_id uuid;
  v_identifier_matches uuid[];
begin
  select version.roster_id
  into v_roster_id
  from core.itf_onboarding_candidate_version version
  where version.workspace_company_id = p_workspace_company_id
    and version.candidate_id = p_candidate_id
    and version.roster_id is not null
  order by version.valid_from desc
  limit 1;

  if v_roster_id is null then
    select provenance.roster_id
    into v_roster_id
    from core.company_roster_entry_provenance provenance
    where provenance.source_system = 'fuse-onboarding'
      and provenance.source_record_id = p_candidate_id::text;
  end if;

  if v_roster_id is null then
    select coalesce(array_agg(distinct matched.roster_id), '{}'::uuid[])
    into v_identifier_matches
    from (
      select identifier.roster_id
      from core.company_roster_identifier identifier
      join core.company_roster roster on roster.id = identifier.roster_id
      where roster.company_id = p_roster_company_id
        and (
          (nullif(btrim(coalesce(p_fuse_personnel_id, '')), '') is not null
            and identifier.identifier_type = 'fuse_emp_id'
            and upper(btrim(identifier.identifier_value)) = upper(btrim(p_fuse_personnel_id)))
          or
          (nullif(btrim(coalesce(p_tech_id, '')), '') is not null
            and identifier.identifier_type = 'tech_id'
            and upper(btrim(identifier.identifier_value)) = upper(btrim(p_tech_id)))
        )
    ) matched;

    if cardinality(v_identifier_matches) > 1 then
      raise exception 'Onboarding identifiers resolve to more than one roster row.';
    elsif cardinality(v_identifier_matches) = 1 then
      v_roster_id := v_identifier_matches[1];
    end if;
  end if;

  if p_roster_company_id = p_workspace_company_id then
    select location.id
    into v_company_location_id
    from core.company_location location
    where location.company_id = p_workspace_company_id
      and location.location_code = p_location_code
      and location.location_status = 'active'
    limit 1;
  else
    select engagement.id
    into v_source_engagement_id
    from core.company_engagement_participant participant
    join core.company_engagement engagement on engagement.id = participant.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    join core.company_engagement_location engagement_location on engagement_location.engagement_id = engagement.id
    join core.company_location location on location.id = engagement_location.principal_company_location_id
    where participant.company_id = p_roster_company_id
      and relationship.principal_company_id = p_workspace_company_id
      and location.location_code = p_location_code
      and relationship.relationship_status in ('proposed', 'active')
      and engagement.engagement_status in ('draft', 'active')
      and participant.participant_status in ('review', 'active')
      and engagement_location.location_status in ('review', 'active')
    order by
      (relationship.relationship_status = 'active') desc,
      (engagement.engagement_status = 'active') desc,
      engagement.created_at
    limit 1;

    if v_source_engagement_id is null then
      raise exception 'The onboarding company has no governed ITF relationship for location %.', p_location_code;
    end if;
  end if;

  if v_roster_id is null then
    insert into core.company_roster (
      company_id, full_name, worker_type, job_title, employment_status,
      hire_date, invite_status, compliance_summary, notes,
      roster_record_kind, company_location_id, seat_type
    ) values (
      p_roster_company_id, btrim(p_full_name), 'TECH', 'Technician', 'Candidate',
      null, 'Not Invited', 'Missing',
      'Created from an approved FUSE onboarding candidate. Placement is pending.',
      'INTERNAL', v_company_location_id, null
    )
    returning id into v_roster_id;

    insert into core.company_roster_entry_provenance (
      roster_id, roster_owner_company_id, entry_authority, entry_channel,
      entered_by_company_id, entered_by_profile_id, source_engagement_id,
      source_system, source_record_id
    ) values (
      v_roster_id, p_roster_company_id,
      case when p_roster_company_id = p_workspace_company_id then 'owner_company' else 'principal_on_behalf' end,
      'csv_import', p_workspace_company_id, p_actor_profile_id,
      v_source_engagement_id, 'fuse-onboarding', p_candidate_id::text
    );

    insert into core.company_roster_event (
      company_id, roster_id, event_category, event_type, event_detail,
      event_metadata, created_by_profile_id
    ) values (
      p_roster_company_id, v_roster_id, 'onboarding',
      'onboarding_roster_identity_created',
      'Company-owned roster identity created from approved FUSE onboarding data.',
      jsonb_build_object(
        'workspace_company_id', p_workspace_company_id,
        'candidate_id', p_candidate_id,
        'location_code', p_location_code,
        'assignment_created', false
      ),
      p_actor_profile_id
    );
  end if;

  if nullif(btrim(coalesce(p_tech_id, '')), '') is not null then
    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (v_roster_id, 'tech_id', upper(btrim(p_tech_id)))
    on conflict (roster_id, identifier_type) do nothing;
  end if;

  if nullif(btrim(coalesce(p_fuse_personnel_id, '')), '') is not null then
    insert into core.company_roster_identifier (roster_id, identifier_type, identifier_value)
    values (v_roster_id, 'fuse_emp_id', btrim(p_fuse_personnel_id))
    on conflict (roster_id, identifier_type) do nothing;
  end if;

  return v_roster_id;
end;
$$;

revoke all on function core.itf_ensure_onboarding_roster(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated;

-- Apply now means: warehouse the source version and connect it to exactly one
-- company roster identity. It still does not make a placement decision.
create or replace function public.itf_apply_onboarding_import(
  p_company_slug text,
  p_batch_id uuid,
  p_approved_row_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_profile_id uuid;
  v_source core.itf_onboarding_import_row%rowtype;
  v_current core.itf_onboarding_candidate_version%rowtype;
  v_candidate_id uuid;
  v_roster_id uuid;
  v_version_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select company.id into v_workspace_company_id from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_workspace_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from core.itf_onboarding_import_batch batch
    where batch.id = p_batch_id and batch.workspace_company_id = v_workspace_company_id
  ) then raise exception 'Import batch not found.'; end if;

  v_profile_id := core.current_profile_id();

  update core.itf_onboarding_import_row
  set decision = 'ignored'
  where batch_id = p_batch_id
    and proposed_action in ('insert', 'version')
    and decision = 'pending'
    and not (id = any(coalesce(p_approved_row_ids, '{}'::uuid[])));

  for v_source in
    select * from core.itf_onboarding_import_row
    where batch_id = p_batch_id
      and id = any(coalesce(p_approved_row_ids, '{}'::uuid[]))
      and proposed_action in ('insert', 'version')
      and decision = 'pending'
    order by source_row_number
    for update
  loop
    v_current := null;
    if v_source.matched_candidate_id is not null then
      select current.* into v_current
      from core.itf_onboarding_candidate_version current
      where current.workspace_company_id = v_workspace_company_id
        and current.candidate_id = v_source.matched_candidate_id
        and current.valid_to is null
      for update;
    end if;

    if v_source.proposed_action = 'version' and v_current.id is null then
      raise exception 'Current onboarding version changed after reconciliation. Compare the file again.';
    end if;
    if v_current.id is not null and v_current.source_payload_hash = v_source.source_payload_hash then
      update core.itf_onboarding_import_row
      set decision = 'ignored', proposed_action = 'unchanged', reconciliation_reason = 'No source fields changed.'
      where id = v_source.id;
      continue;
    end if;

    if v_current.id is not null then
      v_candidate_id := v_current.candidate_id;
    else
      v_candidate_id := gen_random_uuid();
    end if;

    v_roster_id := coalesce(
      v_source.matched_roster_id,
      v_current.roster_id,
      core.itf_ensure_onboarding_roster(
        v_workspace_company_id, v_source.resolved_company_id, v_candidate_id,
        v_source.full_name, v_source.tech_id, v_source.fuse_personnel_id,
        v_source.location_code, v_profile_id
      )
    );

    if v_current.id is not null then
      update core.itf_onboarding_candidate_version set valid_to = v_now where id = v_current.id;
    end if;

    insert into core.itf_onboarding_candidate_version (
      candidate_id, workspace_company_id, roster_company_id, roster_id,
      source_identity_key, full_name, tech_id, fuse_personnel_id,
      location_code, source_office, contractor_type,
      fuse_processing_start_date, fuse_status, note_update_date, last_note,
      status_update_at, source_status_effective_at, source_payload,
      source_payload_hash, local_disposition, local_disposition_reason,
      local_disposition_at, local_disposition_by_profile_id, valid_from,
      supersedes_version_id, source_batch_id, source_row_id, created_by_profile_id
    ) values (
      v_candidate_id, v_workspace_company_id, v_source.resolved_company_id, v_roster_id,
      case when v_source.fuse_personnel_id is not null then 'personnel:' || lower(v_source.fuse_personnel_id)
           when v_source.tech_id is not null then 'tech:' || lower(v_source.tech_id)
           else 'name:' || regexp_replace(lower(v_source.full_name), '[^a-z0-9]+', '', 'g') end,
      v_source.full_name, v_source.tech_id, v_source.fuse_personnel_id,
      v_source.location_code, coalesce(v_source.source_office, v_source.location_code),
      v_source.source_payload->>'Contractor Type', v_source.fuse_processing_start_date,
      v_source.fuse_status, v_source.note_update_date, v_source.last_note,
      v_source.status_update_at, v_source.source_status_effective_at,
      v_source.source_payload, v_source.source_payload_hash,
      coalesce(v_current.local_disposition, 'active'),
      v_current.local_disposition_reason, v_current.local_disposition_at,
      v_current.local_disposition_by_profile_id, v_now,
      v_current.id, p_batch_id, v_source.id, v_profile_id
    ) returning id into v_version_id;

    insert into core.company_roster_event (
      company_id, roster_id, event_category, event_type, event_detail,
      event_metadata, created_by_profile_id
    ) values (
      v_source.resolved_company_id, v_roster_id, 'onboarding',
      'fuse_onboarding_status_recorded',
      'FUSE onboarding status attached to the company roster identity.',
      jsonb_build_object(
        'workspace_company_id', v_workspace_company_id,
        'candidate_id', v_candidate_id,
        'candidate_version_id', v_version_id,
        'fuse_status', v_source.fuse_status,
        'status_update_at', v_source.status_update_at
      ),
      v_profile_id
    );

    update core.itf_onboarding_import_row
    set decision = 'applied', applied_version_id = v_version_id,
        matched_roster_id = v_roster_id
    where id = v_source.id;
  end loop;

  update core.itf_onboarding_import_batch batch
  set applied_count = counts.applied,
      import_status = case when counts.pending_changes = 0 then 'applied' else 'partially_applied' end,
      applied_at = case when counts.pending_changes = 0 then v_now else batch.applied_at end
  from (
    select count(*) filter (where decision = 'applied')::integer applied,
      count(*) filter (where proposed_action in ('insert', 'version') and decision = 'pending')::integer pending_changes
    from core.itf_onboarding_import_row where batch_id = p_batch_id
  ) counts
  where batch.id = p_batch_id;

  return core.itf_onboarding_batch_result(p_batch_id);
end;
$$;

revoke all on function public.itf_apply_onboarding_import(text, uuid, uuid[]) from public, anon;
grant execute on function public.itf_apply_onboarding_import(text, uuid, uuid[]) to authenticated;

-- Current lifecycle data is projected separately and merged into roster rows
-- by roster_id. This preserves one roster while keeping FUSE status scoped to
-- the onboarding subsystem.
create or replace function public.itf_workspace_onboarding_lifecycle(p_company_slug text)
returns table (
  candidate_id uuid,
  roster_id uuid,
  roster_company_id uuid,
  fuse_status text,
  fuse_processing_start_date date,
  note_update_date date,
  last_note text,
  status_update_at timestamp without time zone,
  local_disposition text,
  location_code text,
  engagement_participant_id uuid,
  relationship_id uuid,
  relationship_name text,
  relationship_status text,
  engagement_location_id uuid,
  company_location_id uuid,
  engagement_office_id uuid,
  company_location_office_id uuid,
  has_current_assignment boolean,
  requires_placement boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select current.candidate_id, current.roster_id, current.roster_company_id,
         current.fuse_status, current.fuse_processing_start_date,
         current.note_update_date, current.last_note, current.status_update_at,
         current.local_disposition, current.location_code,
         context.engagement_participant_id, context.relationship_id,
         context.relationship_name, context.relationship_status,
         context.engagement_location_id, context.company_location_id,
         context.engagement_office_id, context.company_location_office_id,
         (assignment.id is not null) as has_current_assignment,
         (current.fuse_status = 'Started'
           and current.local_disposition = 'active'
           and assignment.id is null) as requires_placement
  from core.itf_onboarding_candidate_version current
  left join ref.insight_products product on product.product_key = 'insight-telecom-fulfillment'
  left join core.itf_workforce_assignment assignment
    on assignment.roster_id = current.roster_id
   and assignment.product_id = product.id
   and assignment.effective_end is null
  left join lateral (
    select participant.id as engagement_participant_id,
           relationship.id as relationship_id,
           principal.company_name || ' · ' || engagement.engagement_name as relationship_name,
           relationship.relationship_status,
           engagement_location.id as engagement_location_id,
           location.id as company_location_id,
           engagement_office.id as engagement_office_id,
           office.id as company_location_office_id
    from core.company_engagement_participant participant
    join core.company_engagement engagement on engagement.id = participant.engagement_id
    join core.company_relationship relationship on relationship.id = engagement.relationship_id
    join core.companies principal on principal.id = relationship.principal_company_id
    join core.company_engagement_location engagement_location on engagement_location.engagement_id = engagement.id
    join core.company_location location on location.id = engagement_location.principal_company_location_id
    left join core.company_engagement_office engagement_office
      on engagement_office.engagement_location_id = engagement_location.id
     and engagement_office.office_status in ('review', 'active')
    left join core.company_location_office office
      on office.id = engagement_office.principal_company_location_office_id
    where participant.company_id = current.roster_company_id
      and relationship.principal_company_id = current.workspace_company_id
      and location.location_code = current.location_code
      and relationship.relationship_status in ('proposed', 'active')
      and engagement.engagement_status in ('draft', 'active')
      and participant.participant_status in ('review', 'active')
      and engagement_location.location_status in ('review', 'active')
    order by (relationship.relationship_status = 'active') desc,
             (engagement.engagement_status = 'active') desc,
             (office.id is not null) desc,
             engagement.created_at
    limit 1
  ) context on current.roster_company_id <> current.workspace_company_id
  where current.valid_to is null
    and current.roster_id is not null
    and (current.workspace_company_id = v_company_id or current.roster_company_id = v_company_id)
  order by current.fuse_processing_start_date, current.full_name;
end;
$$;

revoke all on function public.itf_workspace_onboarding_lifecycle(text) from public, anon;
grant execute on function public.itf_workspace_onboarding_lifecycle(text) to authenticated;

create or replace function public.itf_workspace_roster(p_company_slug text)
returns setof public.itf_company_roster_v
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if v_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;

  return query
  select projection.*
  from public.itf_company_roster_v projection
  where projection.company_id = v_company_id
     or exists (
       select 1
       from core.itf_workforce_assignment assignment
       join core.company_engagement_participant participant on participant.id = assignment.engagement_participant_id
       join core.company_engagement engagement on engagement.id = participant.engagement_id
       join core.company_relationship relationship on relationship.id = engagement.relationship_id
       where assignment.id = projection.assignment_id
         and assignment.effective_end is null
         and relationship.principal_company_id = v_company_id
     )
     or exists (
       select 1
       from core.itf_onboarding_candidate_version candidate
       where candidate.roster_id = projection.roster_member_id
         and candidate.valid_to is null
         and candidate.workspace_company_id = v_company_id
     )
  order by projection.full_name, projection.roster_member_id;
end;
$$;

revoke all on function public.itf_workspace_roster(text) from public, anon;
grant execute on function public.itf_workspace_roster(text) to authenticated;

-- Existing applied candidates from the first warehouse pass are repaired in
-- place. Exact identifier matches attach to existing rows; only unmatched
-- candidates receive a new Candidate roster identity. No assignments are made.
do $$
declare
  v_candidate core.itf_onboarding_candidate_version%rowtype;
  v_roster_id uuid;
  v_actor_profile_id uuid;
begin
  select profile.id into v_actor_profile_id
  from core.profiles profile
  where profile.is_platform_owner
  order by profile.created_at
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'A platform owner profile is required for onboarding roster backfill provenance.';
  end if;

  for v_candidate in
    select current.*
    from core.itf_onboarding_candidate_version current
    where current.valid_to is null
      and current.roster_id is null
      and current.roster_company_id is not null
    order by current.created_at
    for update
  loop
    v_roster_id := core.itf_ensure_onboarding_roster(
      v_candidate.workspace_company_id, v_candidate.roster_company_id,
      v_candidate.candidate_id, v_candidate.full_name, v_candidate.tech_id,
      v_candidate.fuse_personnel_id, v_candidate.location_code,
      coalesce(v_candidate.created_by_profile_id, v_actor_profile_id)
    );

    update core.itf_onboarding_candidate_version version
    set roster_id = v_roster_id
    where version.workspace_company_id = v_candidate.workspace_company_id
      and version.candidate_id = v_candidate.candidate_id
      and version.roster_id is null;
  end loop;
end;
$$;

commit;
