begin;

-- FUSE source files are retained as immutable row snapshots. Reconciliation
-- and application happen through authenticated functions; these core tables
-- are intentionally unavailable through the Data API.
create table core.itf_onboarding_import_batch (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references core.companies(id) on delete restrict,
  source_system text not null default 'fuse-onboarding',
  source_filename text not null,
  source_size_bytes bigint not null,
  source_sha256 text not null,
  source_sheet_name text,
  source_header_row integer,
  import_status text not null default 'reconciled',
  source_row_count integer not null default 0,
  proposed_change_count integer not null default 0,
  review_count integer not null default 0,
  unchanged_count integer not null default 0,
  ignored_count integer not null default 0,
  applied_count integer not null default 0,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint itf_onboarding_import_batch_source_ck check (
    source_system = 'fuse-onboarding'
    and length(btrim(source_filename)) > 0
    and source_size_bytes >= 0
    and source_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint itf_onboarding_import_batch_status_ck check (
    import_status in ('reconciled', 'partially_applied', 'applied')
  ),
  constraint itf_onboarding_import_batch_file_uk unique (
    workspace_company_id, source_system, source_sha256
  )
);

create table core.itf_onboarding_candidate_version (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  workspace_company_id uuid not null references core.companies(id) on delete restrict,
  roster_company_id uuid not null references core.companies(id) on delete restrict,
  roster_id uuid references core.company_roster(id) on delete set null,
  source_system text not null default 'fuse-onboarding',
  source_identity_key text not null,
  full_name text not null,
  tech_id text,
  fuse_personnel_id text,
  location_code text not null,
  source_office text not null,
  contractor_type text,
  fuse_processing_start_date date not null,
  fuse_status text not null,
  note_update_date date,
  last_note text,
  status_update_at timestamp without time zone,
  source_status_effective_at timestamp without time zone,
  source_payload jsonb not null,
  source_payload_hash text not null,
  local_disposition text not null default 'active',
  local_disposition_reason text,
  local_disposition_at timestamptz,
  local_disposition_by_profile_id uuid references core.profiles(id) on delete set null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  supersedes_version_id uuid references core.itf_onboarding_candidate_version(id) on delete restrict,
  source_batch_id uuid not null references core.itf_onboarding_import_batch(id) on delete restrict,
  source_row_id uuid,
  created_by_profile_id uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint itf_onboarding_candidate_version_name_ck check (length(btrim(full_name)) > 0),
  constraint itf_onboarding_candidate_version_identity_ck check (length(btrim(source_identity_key)) > 0),
  constraint itf_onboarding_candidate_version_local_ck check (
    local_disposition in ('active', 'inactive', 'filed')
  ),
  constraint itf_onboarding_candidate_version_interval_ck check (
    valid_to is null or valid_to >= valid_from
  )
);

create table core.itf_onboarding_import_row (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references core.itf_onboarding_import_batch(id) on delete cascade,
  source_row_number integer not null,
  source_payload jsonb not null,
  source_payload_hash text not null,
  full_name text not null,
  tech_id text,
  fuse_personnel_id text,
  source_company_name text not null,
  resolved_company_id uuid references core.companies(id) on delete restrict,
  location_code text,
  source_office text,
  fuse_processing_start_date date,
  fuse_status text,
  note_update_date date,
  last_note text,
  status_update_at timestamp without time zone,
  source_status_effective_at timestamp without time zone,
  source_action text not null,
  matched_roster_id uuid references core.company_roster(id) on delete set null,
  matched_candidate_id uuid,
  proposed_action text not null,
  reconciliation_reason text not null,
  review_detail jsonb not null default '[]'::jsonb,
  decision text not null default 'pending',
  applied_version_id uuid references core.itf_onboarding_candidate_version(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint itf_onboarding_import_row_number_uk unique (batch_id, source_row_number),
  constraint itf_onboarding_import_row_action_ck check (
    proposed_action in ('insert', 'version', 'unchanged', 'ignore', 'review', 'stale')
  ),
  constraint itf_onboarding_import_row_source_action_ck check (
    source_action in ('insert_or_update', 'update_existing_only', 'ignore')
  ),
  constraint itf_onboarding_import_row_decision_ck check (
    decision in ('pending', 'approved', 'ignored', 'applied')
  )
);

alter table core.itf_onboarding_candidate_version
  add constraint itf_onboarding_candidate_version_source_row_fk
  foreign key (source_row_id) references core.itf_onboarding_import_row(id) on delete restrict;

create unique index itf_onboarding_candidate_current_uk
  on core.itf_onboarding_candidate_version (workspace_company_id, candidate_id)
  where valid_to is null;

create index itf_onboarding_candidate_lookup_idx
  on core.itf_onboarding_candidate_version (
    workspace_company_id, roster_company_id, source_identity_key, valid_to
  );

create index itf_onboarding_candidate_roster_idx
  on core.itf_onboarding_candidate_version (roster_id, valid_to)
  where roster_id is not null;

create index itf_onboarding_import_row_batch_action_idx
  on core.itf_onboarding_import_row (batch_id, proposed_action, source_row_number);

alter table core.itf_onboarding_import_batch enable row level security;
alter table core.itf_onboarding_import_row enable row level security;
alter table core.itf_onboarding_candidate_version enable row level security;

revoke all on table core.itf_onboarding_import_batch from public, anon, authenticated;
revoke all on table core.itf_onboarding_import_row from public, anon, authenticated;
revoke all on table core.itf_onboarding_candidate_version from public, anon, authenticated;

create or replace function core.itf_onboarding_batch_result(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'batchId', batch.id,
    'status', batch.import_status,
    'filename', batch.source_filename,
    'createdAt', batch.created_at,
    'appliedAt', batch.applied_at,
    'counts', jsonb_build_object(
      'total', batch.source_row_count,
      'changes', batch.proposed_change_count,
      'review', batch.review_count,
      'unchanged', batch.unchanged_count,
      'ignored', batch.ignored_count,
      'applied', batch.applied_count
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', source.id,
        'rowNumber', source.source_row_number,
        'candidate', source.full_name,
        'company', source.source_company_name,
        'resolvedCompanyId', source.resolved_company_id,
        'locationCode', source.location_code,
        'fuseStatus', source.fuse_status,
        'techId', source.tech_id,
        'fusePersonnelId', source.fuse_personnel_id,
        'matchedRosterId', source.matched_roster_id,
        'matchedCandidateId', source.matched_candidate_id,
        'action', source.proposed_action,
        'reason', source.reconciliation_reason,
        'decision', source.decision,
        'appliedVersionId', source.applied_version_id,
        'localDisposition', current.local_disposition
      ) order by source.source_row_number)
      from core.itf_onboarding_import_row source
      left join core.itf_onboarding_candidate_version current
        on current.workspace_company_id = batch.workspace_company_id
       and current.candidate_id = source.matched_candidate_id
       and current.valid_to is null
      where source.batch_id = batch.id
    ), '[]'::jsonb)
  )
  from core.itf_onboarding_import_batch batch
  where batch.id = p_batch_id;
$$;

create or replace function public.itf_stage_onboarding_import(
  p_company_slug text,
  p_filename text,
  p_size_bytes bigint,
  p_sha256 text,
  p_sheet_name text,
  p_header_row integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_batch_id uuid;
  v_profile_id uuid;
  v_row jsonb;
  v_source jsonb;
  v_normalized jsonb;
  v_row_id uuid;
  v_row_number integer;
  v_company_name text;
  v_company_key text;
  v_resolved_company_id uuid;
  v_location_code text;
  v_full_name text;
  v_tech_id text;
  v_personnel_id text;
  v_source_action text;
  v_fuse_status text;
  v_payload_hash text;
  v_identity_key text;
  v_roster_ids uuid[];
  v_roster_id uuid;
  v_name_roster_id uuid;
  v_candidate core.itf_onboarding_candidate_version%rowtype;
  v_proposed_action text;
  v_reason text;
  v_review jsonb;
  v_status_effective timestamp without time zone;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select company.id into v_workspace_company_id
  from core.companies company
  where company.company_slug = btrim(p_company_slug)
    and company.company_status = 'active';

  if v_workspace_company_id is null then raise exception 'Company not found.'; end if;
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be an array.'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Source row limit exceeded.'; end if;

  v_profile_id := core.current_profile_id();

  select batch.id into v_batch_id
  from core.itf_onboarding_import_batch batch
  where batch.workspace_company_id = v_workspace_company_id
    and batch.source_system = 'fuse-onboarding'
    and batch.source_sha256 = lower(btrim(p_sha256));

  if v_batch_id is not null then
    return core.itf_onboarding_batch_result(v_batch_id);
  end if;

  insert into core.itf_onboarding_import_batch (
    workspace_company_id, source_filename, source_size_bytes, source_sha256,
    source_sheet_name, source_header_row, created_by_profile_id
  ) values (
    v_workspace_company_id, btrim(p_filename), p_size_bytes, lower(btrim(p_sha256)),
    nullif(btrim(p_sheet_name), ''), p_header_row, v_profile_id
  ) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_source := coalesce(v_row->'source', '{}'::jsonb);
    v_normalized := coalesce(v_row->'normalized', '{}'::jsonb);
    v_row_number := coalesce((v_row->>'rowNumber')::integer, 0);
    v_company_name := btrim(coalesce(v_normalized->>'companyName', v_source->>'Company Name', ''));
    v_company_key := regexp_replace(lower(v_company_name), '[^a-z0-9]+', '', 'g');
    v_full_name := btrim(coalesce(v_normalized->>'fullName', ''));
    v_tech_id := nullif(upper(btrim(coalesce(v_normalized->>'techId', ''))), '');
    v_personnel_id := nullif(btrim(coalesce(v_normalized->>'fuseEmployeeId', '')), '');
    v_location_code := nullif(btrim(coalesce(v_normalized->>'locationCode', '')), '');
    v_fuse_status := btrim(coalesce(v_normalized->>'fuseStatus', ''));
    v_source_action := coalesce(v_normalized->>'sourceAction', 'ignore');
    v_payload_hash := md5(v_source::text);
    v_status_effective := nullif(v_normalized->>'statusEffectiveAt', '')::timestamp without time zone;
    v_review := coalesce(v_row->'issues', '[]'::jsonb);

    select resolved.company_id into v_resolved_company_id
    from (
      select alias.company_id, 1 as precedence
      from core.company_external_alias alias
      where alias.source_entity_type = 'company'
        and alias.source_value_normalized = v_company_key
      union all
      select company.id, 2
      from core.companies company
      where company.company_status = 'active'
        and regexp_replace(lower(company.company_name), '[^a-z0-9]+', '', 'g') = v_company_key
      union all
      select company.id, 3
      from core.companies company
      where company.company_status = 'active'
        and company.legal_name is not null
        and regexp_replace(lower(company.legal_name), '[^a-z0-9]+', '', 'g') = v_company_key
    ) resolved
    order by resolved.precedence
    limit 1;

    v_roster_ids := '{}'::uuid[];
    if v_resolved_company_id is not null then
      select coalesce(array_agg(distinct match.roster_id), '{}'::uuid[])
      into v_roster_ids
      from (
        select identifier.roster_id
        from core.company_roster_identifier identifier
        join core.company_roster roster on roster.id = identifier.roster_id
        where roster.company_id = v_resolved_company_id
          and (
            (v_personnel_id is not null and identifier.identifier_type = 'fuse_emp_id' and upper(btrim(identifier.identifier_value)) = upper(v_personnel_id))
            or (v_tech_id is not null and identifier.identifier_type = 'tech_id' and upper(btrim(identifier.identifier_value)) = v_tech_id)
          )
      ) match;

      select roster.id into v_name_roster_id
      from core.company_roster roster
      where roster.company_id = v_resolved_company_id
        and regexp_replace(lower(btrim(roster.full_name)), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(v_full_name), '[^a-z0-9]+', '', 'g')
      order by (roster.employment_status = 'Active') desc, roster.created_at desc
      limit 1;
    else
      v_name_roster_id := null;
    end if;

    v_roster_id := case when cardinality(v_roster_ids) = 1 then v_roster_ids[1] else null end;
    v_identity_key := case
      when v_personnel_id is not null then 'personnel:' || lower(v_personnel_id)
      when v_tech_id is not null then 'tech:' || lower(v_tech_id)
      else 'name:' || regexp_replace(lower(v_full_name), '[^a-z0-9]+', '', 'g')
    end;

    v_candidate := null;
    if v_resolved_company_id is not null then
      select current.* into v_candidate
      from core.itf_onboarding_candidate_version current
      where current.workspace_company_id = v_workspace_company_id
        and current.roster_company_id = v_resolved_company_id
        and current.valid_to is null
        and (
          (v_roster_id is not null and current.roster_id = v_roster_id)
          or (v_personnel_id is not null and upper(current.fuse_personnel_id) = upper(v_personnel_id))
          or (v_tech_id is not null and upper(current.tech_id) = v_tech_id)
          or current.source_identity_key = v_identity_key
        )
      order by (current.roster_id = v_roster_id) desc nulls last, current.created_at desc
      limit 1;
    end if;

    if jsonb_path_exists(v_review, '$[*] ? (@.severity == "error")') then
      v_proposed_action := 'review';
      v_reason := 'The source row failed structural validation.';
    elsif v_resolved_company_id is null then
      v_proposed_action := 'review';
      v_reason := 'Company is not resolved to the governed catalogue.';
    elsif not exists (
      select 1 from core.company_location location
      where location.company_id = v_workspace_company_id
        and location.location_code = v_location_code
        and location.location_status = 'active'
    ) then
      v_proposed_action := 'review';
      v_reason := 'Location is not active in this ITF workspace.';
    elsif cardinality(v_roster_ids) > 1 then
      v_proposed_action := 'review';
      v_reason := 'Personnel and Tech IDs point to different roster records.';
    elsif v_roster_id is null and v_name_roster_id is not null then
      v_proposed_action := 'review';
      v_reason := 'Name matches a roster row, but a governed identifier is required to connect it.';
    elsif v_source_action = 'ignore' then
      v_proposed_action := 'ignore';
      v_reason := 'FUSE status is outside the governed action contract.';
    elsif v_candidate.id is null and v_source_action = 'update_existing_only' then
      v_proposed_action := 'ignore';
      v_reason := 'Inactive FUSE state has no current onboarding record to close.';
    elsif v_candidate.id is null then
      v_proposed_action := 'insert';
      v_reason := case when v_roster_id is null then 'New onboarding candidate.' else 'Connect onboarding history to the matched roster row.' end;
    elsif v_candidate.fuse_status = 'Started' and v_fuse_status <> 'Terminated' then
      v_proposed_action := 'unchanged';
      v_reason := 'Started is stable; only a later termination may replace it.';
    elsif v_candidate.source_payload_hash = v_payload_hash then
      v_proposed_action := 'unchanged';
      v_reason := 'No source fields changed.';
    elsif v_candidate.source_status_effective_at is not null
      and v_status_effective is not null
      and v_status_effective < v_candidate.source_status_effective_at then
      v_proposed_action := 'stale';
      v_reason := 'A newer FUSE status is already authoritative.';
    else
      v_proposed_action := 'version';
      v_reason := 'FUSE source fields changed; the current version will be closed.';
    end if;

    insert into core.itf_onboarding_import_row (
      batch_id, source_row_number, source_payload, source_payload_hash,
      full_name, tech_id, fuse_personnel_id, source_company_name,
      resolved_company_id, location_code, source_office,
      fuse_processing_start_date, fuse_status, note_update_date, last_note,
      status_update_at, source_status_effective_at, source_action,
      matched_roster_id, matched_candidate_id, proposed_action,
      reconciliation_reason, review_detail
    ) values (
      v_batch_id, v_row_number, v_source, v_payload_hash,
      v_full_name, v_tech_id, v_personnel_id, v_company_name,
      v_resolved_company_id, v_location_code, v_normalized->>'sourceOffice',
      nullif(v_normalized->>'startDate', '')::date, v_fuse_status,
      nullif(v_normalized->>'noteUpdatedOn', '')::date, nullif(v_normalized->>'lastNote', ''),
      nullif(v_normalized->>'statusUpdatedAt', '')::timestamp without time zone,
      v_status_effective, v_source_action, v_roster_id,
      case when v_candidate.id is null then null else v_candidate.candidate_id end,
      v_proposed_action, v_reason, v_review
    ) returning id into v_row_id;
  end loop;

  update core.itf_onboarding_import_batch batch
  set source_row_count = counts.total,
      proposed_change_count = counts.changes,
      review_count = counts.review,
      unchanged_count = counts.unchanged,
      ignored_count = counts.ignored
  from (
    select count(*)::integer total,
      count(*) filter (where proposed_action in ('insert', 'version'))::integer changes,
      count(*) filter (where proposed_action = 'review')::integer review,
      count(*) filter (where proposed_action in ('unchanged', 'stale'))::integer unchanged,
      count(*) filter (where proposed_action = 'ignore')::integer ignored
    from core.itf_onboarding_import_row where batch_id = v_batch_id
  ) counts
  where batch.id = v_batch_id;

  return core.itf_onboarding_batch_result(v_batch_id);
end;
$$;

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
      update core.itf_onboarding_import_row set decision = 'ignored', proposed_action = 'unchanged', reconciliation_reason = 'No source fields changed.' where id = v_source.id;
      continue;
    end if;

    if v_current.id is not null then
      update core.itf_onboarding_candidate_version set valid_to = v_now where id = v_current.id;
      v_candidate_id := v_current.candidate_id;
    else
      v_candidate_id := gen_random_uuid();
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
      v_candidate_id, v_workspace_company_id, v_source.resolved_company_id,
      v_source.matched_roster_id,
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

    update core.itf_onboarding_import_row
    set decision = 'applied', applied_version_id = v_version_id
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

-- A manager's local filing decision is versioned independently from FUSE.
-- Future FUSE versions copy it forward and never reactivate the candidate.
create or replace function public.itf_set_onboarding_local_disposition(
  p_company_slug text,
  p_candidate_id uuid,
  p_disposition text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_company_id uuid;
  v_current core.itf_onboarding_candidate_version%rowtype;
  v_new_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_disposition not in ('active', 'inactive', 'filed') then raise exception 'Unsupported local disposition.'; end if;
  select company.id into v_workspace_company_id from core.companies company
  where company.company_slug = btrim(p_company_slug) and company.company_status = 'active';
  if not (core.is_platform_owner() or core.can_admin_company(v_workspace_company_id)) then
    raise exception 'Company management access is required.' using errcode = '42501';
  end if;

  select current.* into v_current
  from core.itf_onboarding_candidate_version current
  where current.workspace_company_id = v_workspace_company_id
    and current.candidate_id = p_candidate_id
    and current.valid_to is null
  for update;
  if v_current.id is null then raise exception 'Current onboarding record not found.'; end if;
  if v_current.local_disposition = p_disposition and v_current.local_disposition_reason is not distinct from nullif(btrim(p_reason), '') then
    return jsonb_build_object('candidateId', p_candidate_id, 'versionId', v_current.id, 'localDisposition', p_disposition, 'changed', false);
  end if;

  update core.itf_onboarding_candidate_version set valid_to = v_now where id = v_current.id;
  insert into core.itf_onboarding_candidate_version (
    candidate_id, workspace_company_id, roster_company_id, roster_id, source_system,
    source_identity_key, full_name, tech_id, fuse_personnel_id, location_code,
    source_office, contractor_type, fuse_processing_start_date, fuse_status,
    note_update_date, last_note, status_update_at, source_status_effective_at,
    source_payload, source_payload_hash, local_disposition,
    local_disposition_reason, local_disposition_at, local_disposition_by_profile_id,
    valid_from, supersedes_version_id, source_batch_id, source_row_id, created_by_profile_id
  ) select
    candidate_id, workspace_company_id, roster_company_id, roster_id, source_system,
    source_identity_key, full_name, tech_id, fuse_personnel_id, location_code,
    source_office, contractor_type, fuse_processing_start_date, fuse_status,
    note_update_date, last_note, status_update_at, source_status_effective_at,
    source_payload, source_payload_hash, p_disposition, nullif(btrim(p_reason), ''),
    v_now, core.current_profile_id(), v_now, v_current.id, source_batch_id,
    source_row_id, core.current_profile_id()
  from core.itf_onboarding_candidate_version where id = v_current.id
  returning id into v_new_id;

  return jsonb_build_object('candidateId', p_candidate_id, 'versionId', v_new_id, 'localDisposition', p_disposition, 'changed', true);
end;
$$;

revoke all on function core.itf_onboarding_batch_result(uuid) from public, anon, authenticated;
revoke all on function public.itf_stage_onboarding_import(text, text, bigint, text, text, integer, jsonb) from public, anon;
revoke all on function public.itf_apply_onboarding_import(text, uuid, uuid[]) from public, anon;
revoke all on function public.itf_set_onboarding_local_disposition(text, uuid, text, text) from public, anon;
grant execute on function public.itf_stage_onboarding_import(text, text, bigint, text, text, integer, jsonb) to authenticated;
grant execute on function public.itf_apply_onboarding_import(text, uuid, uuid[]) to authenticated;
grant execute on function public.itf_set_onboarding_local_disposition(text, uuid, text, text) to authenticated;

commit;
