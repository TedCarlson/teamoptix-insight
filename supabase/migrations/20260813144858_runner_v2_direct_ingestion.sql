begin;

-- Runner 2.0 opens a collection cycle before the first file arrives. This
-- removes the legacy whole-batch barrier while keeping company ownership in
-- Postgres rather than trusting a slug or filename supplied by the runner.
create or replace function public.start_operations_runner_cycle_v2(
  p_runner_key text,
  p_cycle_id uuid,
  p_company_id uuid,
  p_company_slug text,
  p_request_type text,
  p_service_date date,
  p_started_at timestamptz,
  p_requested_reports text[],
  p_request_payload jsonb
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_company_id uuid;
  v_schedule_company_slug text;
  v_row public.operations_collection_request_v;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select schedule.company_id, company.company_slug
  into v_schedule_company_id, v_schedule_company_slug
  from core.operations_runner_schedule schedule
  join core.companies company on company.id = schedule.company_id
  where schedule.runner_key = trim(p_runner_key);

  if v_schedule_company_id is null
    or v_schedule_company_id <> p_company_id
    or v_schedule_company_slug <> trim(p_company_slug)
  then
    raise exception 'Runner, company id, and company slug do not match.'
      using errcode = '42501';
  end if;

  if upper(trim(coalesce(p_request_type, ''))) not in (
    'PREVIOUS_DAY_CLOSE',
    'OPERATIONS_PULSE',
    'DRO_AM',
    'TARGETED_RECOVERY',
    'HISTORICAL_BACKFILL'
  ) then
    raise exception 'Unsupported Runner 2.0 cycle type.';
  end if;

  insert into core.operations_collection_request (
    id,
    company_id,
    request_type,
    request_status,
    priority,
    service_date,
    requested_reports,
    request_payload,
    claimed_by,
    claimed_at,
    started_at,
    created_at,
    updated_at,
    output_receipt_json
  )
  values (
    p_cycle_id,
    p_company_id,
    upper(trim(p_request_type)),
    'RUNNING',
    case upper(trim(p_request_type))
      when 'TARGETED_RECOVERY' then 40
      when 'PREVIOUS_DAY_CLOSE' then 60
      else 100
    end,
    p_service_date,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb) || jsonb_build_object(
      'payload_contract_version', 'operations_collection_v2',
      'source', 'continuous_runner_v2',
      'runner_key', trim(p_runner_key)
    ),
    trim(p_runner_key),
    p_started_at,
    p_started_at,
    p_started_at,
    now(),
    jsonb_build_object(
      'schema_version', 2,
      'runner_version', 'continuous-runner-v2',
      'cycle_id', p_cycle_id,
      'company_slug', v_schedule_company_slug,
      'started_at', p_started_at
    )
  )
  on conflict (id) do nothing;

  if exists (
    select 1
    from core.operations_collection_request request
    where request.id = p_cycle_id
      and (
        request.company_id <> p_company_id
        or request.claimed_by is distinct from trim(p_runner_key)
      )
  ) then
    raise exception 'Runner 2.0 cycle is already owned by another tenant or runner.'
      using errcode = '42501';
  end if;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_cycle_id;

  return v_row;
end;
$$;

revoke all on function public.start_operations_runner_cycle_v2(
  text, uuid, uuid, text, text, date, timestamptz, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.start_operations_runner_cycle_v2(
  text, uuid, uuid, text, text, date, timestamptz, text[], jsonb
) to service_role;

-- Creates the compact durable receipt used by the direct-ingestion endpoint.
-- The source lane selects a parser; it does not establish payload identity.
create or replace function public.begin_operations_runner_direct_artifact_ingest(
  p_artifact_id uuid,
  p_collection_request_id uuid,
  p_company_id uuid,
  p_company_slug text,
  p_runner_key text,
  p_requested_service_date date,
  p_source_lane text,
  p_source_filename text,
  p_transport_filename text,
  p_artifact_key text,
  p_report_family_key text,
  p_report_shape_key text,
  p_report_frame text,
  p_content_type text,
  p_size_bytes bigint,
  p_source_hash text,
  p_runner_artifact_json jsonb default '{}'::jsonb
)
returns public.operations_collection_artifact_v
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing core.operations_collection_artifact;
  v_company_slug text;
  v_row public.operations_collection_artifact_v;
  v_runner_json jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select company.company_slug
  into v_company_slug
  from core.operations_collection_request request
  join core.companies company on company.id = request.company_id
  where request.id = p_collection_request_id
    and request.company_id = p_company_id
    and request.claimed_by = trim(p_runner_key)
    and request.request_status in ('RUNNING', 'ARTIFACTS_READY', 'INGESTING');

  if v_company_slug is null or v_company_slug <> trim(p_company_slug) then
    raise exception 'Artifact tenant does not match the open Runner 2.0 cycle.'
      using errcode = '42501';
  end if;

  if p_artifact_id is null
    or p_requested_service_date is null
    or nullif(trim(coalesce(p_source_lane, '')), '') is null
    or nullif(trim(coalesce(p_source_filename, '')), '') is null
    or nullif(trim(coalesce(p_transport_filename, '')), '') is null
    or coalesce(p_size_bytes, 0) <= 0
    or coalesce(p_source_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Runner 2.0 artifact receipt is incomplete.';
  end if;

  v_runner_json := coalesce(p_runner_artifact_json, '{}'::jsonb)
    || jsonb_build_object(
      'handoff_contract', 'operations_artifact_handoff_v2',
      'handoff_mode', 'DIRECT_INGESTION',
      'artifact_id', p_artifact_id,
      'artifact_key', upper(trim(p_artifact_key)),
      'report_family_key', upper(trim(p_report_family_key)),
      'report_shape_key', nullif(trim(coalesce(p_report_shape_key, '')), ''),
      'report_frame', nullif(trim(coalesce(p_report_frame, '')), ''),
      'source_lane', upper(trim(p_source_lane)),
      'source_download_filename', trim(p_source_filename),
      'transport_filename', trim(p_transport_filename),
      'requested_service_date', p_requested_service_date,
      'payload_authority', 'INGESTION_PIPELINE'
    );

  select artifact.* into v_existing
  from core.operations_collection_artifact artifact
  where artifact.id = p_artifact_id;

  if found then
    if v_existing.collection_request_id <> p_collection_request_id
      or v_existing.company_id <> p_company_id
      or v_existing.source_hash is distinct from lower(p_source_hash)
    then
      raise exception 'Artifact idempotency key conflicts with an existing receipt.';
    end if;

    if v_existing.artifact_status not in ('INGESTED', 'IGNORED') then
      update core.operations_collection_artifact
      set
        artifact_status = 'INGESTING',
        runner_artifact_json = v_runner_json,
        ingest_metadata_json = coalesce(ingest_metadata_json, '{}'::jsonb)
          || jsonb_build_object(
            'source', 'runner_v2_direct_ingestion',
            'phase', 'INGESTING',
            'received_at', now()
          ),
        error_message = null,
        attempt_count = attempt_count + 1,
        ingest_started_at = now(),
        ingest_completed_at = null,
        updated_at = now()
      where id = p_artifact_id;
    end if;
  else
    insert into core.operations_collection_artifact (
      id,
      collection_request_id,
      company_id,
      service_date,
      artifact_kind,
      report_family_key,
      report_shape_key,
      report_frame,
      artifact_status,
      storage_bucket,
      storage_path,
      original_filename,
      normalized_filename,
      content_type,
      size_bytes,
      source_hash,
      runner_key,
      runner_artifact_json,
      ingest_metadata_json,
      ingest_priority,
      attempt_count,
      ingest_started_at
    ) values (
      p_artifact_id,
      p_collection_request_id,
      p_company_id,
      p_requested_service_date,
      'REPORT_FILE',
      upper(trim(p_report_family_key)),
      nullif(trim(coalesce(p_report_shape_key, '')), ''),
      nullif(trim(coalesce(p_report_frame, '')), ''),
      'INGESTING',
      'direct-ingestion-v2',
      'receipt/' || p_artifact_id::text,
      trim(p_source_filename),
      trim(p_transport_filename),
      nullif(trim(coalesce(p_content_type, '')), ''),
      p_size_bytes,
      lower(p_source_hash),
      trim(p_runner_key),
      v_runner_json,
      jsonb_build_object(
        'source', 'runner_v2_direct_ingestion',
        'phase', 'INGESTING',
        'received_at', now()
      ),
      public.collection_artifact_ingest_priority(
        upper(trim(p_report_family_key)),
        trim(p_source_filename),
        trim(p_transport_filename),
        v_runner_json
      ),
      1,
      now()
    );
  end if;

  select * into v_row
  from public.operations_collection_artifact_v
  where id = p_artifact_id;

  return v_row;
end;
$$;

revoke all on function public.begin_operations_runner_direct_artifact_ingest(
  uuid, uuid, uuid, text, text, date, text, text, text, text, text,
  text, text, text, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_operations_runner_direct_artifact_ingest(
  uuid, uuid, uuid, text, text, date, text, text, text, text, text,
  text, text, text, bigint, text, jsonb
) to service_role;

-- Terminal reconciliation registers only fallback artifacts; direct receipts
-- already exist. Existing successful direct receipts are never reset.
create or replace function public.record_operations_runner_cycle_terminal_v2(
  p_runner_key text,
  p_cycle_id uuid,
  p_completed_at timestamptz,
  p_outcome text,
  p_receipt_json jsonb,
  p_artifacts_json jsonb default '[]'::jsonb,
  p_error_message text default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_company_slug text;
  v_outcome text := upper(trim(coalesce(p_outcome, 'FAILED')));
  v_status text;
  v_artifact_count integer;
  v_failed_count integer;
  v_success_count integer;
  v_pending_count integer;
  v_row public.operations_collection_request_v;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if v_outcome not in ('COMPLETE', 'FAILED', 'CANCELLED', 'INTERRUPTED') then
    raise exception 'Unsupported Runner 2.0 outcome.';
  end if;
  if jsonb_typeof(coalesce(p_artifacts_json, '[]'::jsonb)) <> 'array' then
    raise exception 'Artifacts must be a JSON array.';
  end if;

  select request.company_id, company.company_slug
  into v_company_id, v_company_slug
  from core.operations_collection_request request
  join core.companies company on company.id = request.company_id
  where request.id = p_cycle_id
    and request.claimed_by = trim(p_runner_key);

  if v_company_id is null then
    raise exception 'Runner 2.0 cycle was not opened by this runner.'
      using errcode = '42501';
  end if;

  insert into core.operations_collection_artifact (
    id, collection_request_id, company_id, service_date, artifact_kind,
    report_family_key, report_shape_key, report_frame, artifact_status,
    storage_bucket, storage_path, original_filename, normalized_filename,
    content_type, size_bytes, source_hash, runner_key, runner_artifact_json,
    ingest_priority, runner_elapsed_ms, runner_cpu_ms
  )
  select
    (artifact ->> 'artifact_id')::uuid,
    p_cycle_id,
    v_company_id,
    nullif(artifact ->> 'service_date', '')::date,
    coalesce(nullif(artifact ->> 'kind', ''), 'REPORT_FILE'),
    nullif(artifact ->> 'report_family_key', ''),
    nullif(artifact ->> 'report_shape_key', ''),
    nullif(artifact ->> 'report_frame', ''),
    'READY_FOR_INGEST',
    artifact ->> 'storage_bucket',
    artifact ->> 'storage_path',
    coalesce(
      nullif(artifact ->> 'source_download_filename', ''),
      artifact ->> 'filename'
    ),
    artifact ->> 'filename',
    nullif(artifact ->> 'content_type', ''),
    coalesce((artifact ->> 'size_bytes')::bigint, 0),
    nullif(artifact ->> 'source_hash', ''),
    trim(p_runner_key),
    artifact,
    public.collection_artifact_ingest_priority(
      artifact ->> 'report_family_key',
      coalesce(
        nullif(artifact ->> 'source_download_filename', ''),
        artifact ->> 'filename'
      ),
      artifact ->> 'filename',
      artifact
    ),
    case when coalesce(artifact ->> 'runner_elapsed_ms', '') ~ '^\d+$'
      then (artifact ->> 'runner_elapsed_ms')::integer else null end,
    case when coalesce(artifact ->> 'runner_cpu_ms', '') ~ '^\d+$'
      then (artifact ->> 'runner_cpu_ms')::integer else null end
  from jsonb_array_elements(coalesce(p_artifacts_json, '[]'::jsonb)) artifact
  where artifact ->> 'handoff_mode' = 'STORAGE_FALLBACK'
  on conflict (id) do update set
    artifact_status = case
      when core.operations_collection_artifact.artifact_status in ('INGESTED', 'IGNORED')
        then core.operations_collection_artifact.artifact_status
      else 'READY_FOR_INGEST'
    end,
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    original_filename = excluded.original_filename,
    normalized_filename = excluded.normalized_filename,
    content_type = excluded.content_type,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_artifact_json = excluded.runner_artifact_json,
    error_message = null,
    updated_at = now();

  select
    count(*)::integer,
    count(*) filter (where artifact_status = 'FAILED')::integer,
    count(*) filter (where artifact_status in ('INGESTED', 'IGNORED'))::integer,
    count(*) filter (where artifact_status in ('UPLOADED', 'READY_FOR_INGEST', 'INGESTING'))::integer
  into v_artifact_count, v_failed_count, v_success_count, v_pending_count
  from core.operations_collection_artifact
  where collection_request_id = p_cycle_id;

  v_status := case
    when v_outcome = 'CANCELLED' then 'CANCELLED'
    when v_outcome <> 'COMPLETE' then 'FAILED'
    when v_artifact_count = 0 then 'FAILED'
    when v_pending_count > 0 then 'ARTIFACTS_READY'
    when v_success_count = 0 and v_failed_count > 0 then 'FAILED'
    else 'COMPLETE'
  end;

  update core.operations_collection_request
  set
    request_status = v_status,
    completed_at = p_completed_at,
    error_message = case
      when v_status in ('FAILED', 'CANCELLED') then coalesce(
        nullif(trim(coalesce(p_error_message, '')), ''),
        'Runner 2.0 cycle did not complete successfully.'
      )
      when v_failed_count > 0 then v_failed_count || ' artifact(s) require attention.'
      else null
    end,
    output_receipt_json = coalesce(p_receipt_json, '{}'::jsonb)
      || jsonb_build_object(
        'schema_version', 2,
        'runner_version', 'continuous-runner-v2',
        'company_slug', v_company_slug,
        'cycle_id', p_cycle_id,
        'outcome', v_outcome,
        'runner_completed_at', p_completed_at,
        'artifact_count', v_artifact_count,
        'ingested_count', v_success_count,
        'failed_count', v_failed_count,
        'pending_count', v_pending_count
      ),
    report_batch_ids = array(
      select artifact.report_batch_id
      from core.operations_collection_artifact artifact
      where artifact.collection_request_id = p_cycle_id
        and artifact.report_batch_id is not null
    ),
    updated_at = now()
  where id = p_cycle_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_cycle_id;
  return v_row;
end;
$$;

revoke all on function public.record_operations_runner_cycle_terminal_v2(
  text, uuid, timestamptz, text, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_operations_runner_cycle_terminal_v2(
  text, uuid, timestamptz, text, jsonb, jsonb, text
) to service_role;

comment on function public.start_operations_runner_cycle_v2(
  text, uuid, uuid, text, text, date, timestamptz, text[], jsonb
) is 'Opens a tenant-verified Runner 2.0 cycle before file-by-file ingestion.';

comment on function public.begin_operations_runner_direct_artifact_ingest(
  uuid, uuid, uuid, text, text, date, text, text, text, text, text,
  text, text, text, bigint, text, jsonb
) is 'Creates an idempotent tenant-verified receipt for one direct-ingestion artifact.';

comment on function public.record_operations_runner_cycle_terminal_v2(
  text, uuid, timestamptz, text, jsonb, jsonb, text
) is 'Reconciles a Runner 2.0 cycle without re-warehousing successful direct artifacts.';

commit;
