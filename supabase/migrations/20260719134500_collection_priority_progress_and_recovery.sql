alter table core.operations_collection_artifact
  add column if not exists ingest_priority integer not null default 100,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists ingest_started_at timestamptz,
  add column if not exists ingest_completed_at timestamptz,
  add column if not exists runner_elapsed_ms integer,
  add column if not exists runner_cpu_ms integer;

alter table core.operations_collection_artifact
  drop constraint if exists operations_collection_artifact_ingest_priority_ck;

alter table core.operations_collection_artifact
  add constraint operations_collection_artifact_ingest_priority_ck
  check (ingest_priority between 1 and 999);

create index if not exists operations_collection_artifact_ready_priority_idx
  on core.operations_collection_artifact (artifact_status, ingest_priority, created_at)
  where artifact_status in ('READY_FOR_INGEST', 'UPLOADED');

create or replace view public.operations_collection_artifact_v
with (security_invoker = true) as
select
  a.id, a.collection_request_id, a.company_id, a.service_date,
  a.artifact_kind, a.report_family_key, a.report_shape_key, a.report_frame,
  a.artifact_status, a.storage_bucket, a.storage_path, a.original_filename,
  a.normalized_filename, a.content_type, a.size_bytes, a.source_hash,
  a.runner_key, a.runner_artifact_json, a.ingest_metadata_json,
  a.report_batch_id, a.error_message, a.created_at, a.updated_at,
  c.company_slug, r.request_type, r.request_status,
  a.ingest_priority, a.attempt_count,
  a.ingest_started_at, a.ingest_completed_at,
  case
    when a.ingest_started_at is not null and a.ingest_completed_at is not null
      then extract(epoch from (a.ingest_completed_at - a.ingest_started_at))::integer * 1000
    else null::integer
  end as ingest_duration_ms,
  a.runner_elapsed_ms, a.runner_cpu_ms
from core.operations_collection_artifact a
join core.companies c on c.id = a.company_id
join core.operations_collection_request r on r.id = a.collection_request_id;

grant select on table public.operations_collection_artifact_v to authenticated;
grant all on table public.operations_collection_artifact_v to service_role;

create or replace function public.collection_request_lane_priority(p_request_type text)
returns integer
language sql
immutable
as $$
  select case upper(coalesce(p_request_type, ''))
    when 'TARGETED_RECOVERY' then 10
    when 'PREVIOUS_DAY_CLOSE' then 20
    when 'HISTORICAL_BACKFILL' then 30
    when 'OPERATIONS_PULSE' then 40
    else 50
  end;
$$;

create or replace function public.collection_artifact_ingest_priority(
  p_report_family_key text,
  p_original_filename text,
  p_normalized_filename text,
  p_runner_artifact_json jsonb default '{}'::jsonb
)
returns integer
language sql
immutable
as $$
  select case
    when upper(coalesce(p_report_family_key, '')) = 'DSW' then 10
    when upper(coalesce(p_runner_artifact_json ->> 'artifact_key', '')) = 'PICKUP_MANIFEST'
      or lower(coalesce(p_normalized_filename, p_original_filename, '')) like '%pickup%manifest%'
      or lower(coalesce(p_original_filename, '')) ~ '^pm[0-9]'
      then 30
    when upper(coalesce(p_runner_artifact_json ->> 'artifact_key', '')) = 'DELIVERY_MANIFEST'
      or lower(coalesce(p_normalized_filename, p_original_filename, '')) like '%delivery%manifest%'
      then 40
    when upper(coalesce(p_report_family_key, '')) = 'FCC' then 20
    else 100
  end;
$$;

create or replace function public.claim_operations_collection_request(p_runner_key text)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_request_id uuid;
  v_row public.operations_collection_request_v;
begin
  select id into v_request_id
  from core.operations_collection_request
  where request_status = 'QUEUED'
  order by
    public.collection_request_lane_priority(request_type) asc,
    priority asc,
    created_at asc
  for update skip locked
  limit 1;

  if v_request_id is null then
    return null;
  end if;

  update core.operations_collection_request
  set request_status = 'CLAIMED', claimed_by = p_runner_key,
      claimed_at = now(), updated_at = now()
  where id = v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

create or replace function public.register_operations_collection_artifact(
  p_collection_request_id uuid,
  p_company_id uuid,
  p_service_date date,
  p_artifact_kind text,
  p_report_family_key text,
  p_report_shape_key text,
  p_report_frame text,
  p_artifact_status text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_filename text,
  p_normalized_filename text,
  p_content_type text,
  p_size_bytes bigint,
  p_source_hash text,
  p_runner_key text,
  p_runner_artifact_json jsonb default '{}'::jsonb
)
returns public.operations_collection_artifact_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_id uuid;
  v_row public.operations_collection_artifact_v;
  v_priority integer;
begin
  v_priority := public.collection_artifact_ingest_priority(
    p_report_family_key, p_original_filename, p_normalized_filename,
    coalesce(p_runner_artifact_json, '{}'::jsonb)
  );

  insert into core.operations_collection_artifact (
    collection_request_id, company_id, service_date, artifact_kind,
    report_family_key, report_shape_key, report_frame, artifact_status,
    storage_bucket, storage_path, original_filename, normalized_filename,
    content_type, size_bytes, source_hash, runner_key, runner_artifact_json,
    ingest_priority, runner_elapsed_ms, runner_cpu_ms
  ) values (
    p_collection_request_id, p_company_id, p_service_date,
    coalesce(nullif(p_artifact_kind, ''), 'REPORT_FILE'),
    nullif(p_report_family_key, ''), nullif(p_report_shape_key, ''),
    nullif(p_report_frame, ''),
    coalesce(nullif(p_artifact_status, ''), 'READY_FOR_INGEST'),
    p_storage_bucket, p_storage_path, p_original_filename,
    p_normalized_filename, nullif(p_content_type, ''),
    coalesce(p_size_bytes, 0), nullif(p_source_hash, ''), p_runner_key,
    coalesce(p_runner_artifact_json, '{}'::jsonb), v_priority,
    case
      when coalesce(p_runner_artifact_json ->> 'runner_elapsed_ms', '') ~ '^\d+$'
        then (p_runner_artifact_json ->> 'runner_elapsed_ms')::integer
      else null
    end,
    case
      when coalesce(p_runner_artifact_json ->> 'runner_cpu_ms', '') ~ '^\d+$'
        then (p_runner_artifact_json ->> 'runner_cpu_ms')::integer
      else null
    end
  )
  on conflict (storage_bucket, storage_path) do update set
    artifact_status = excluded.artifact_status,
    size_bytes = excluded.size_bytes,
    source_hash = excluded.source_hash,
    runner_key = excluded.runner_key,
    runner_artifact_json = excluded.runner_artifact_json,
    ingest_priority = excluded.ingest_priority,
    runner_elapsed_ms = excluded.runner_elapsed_ms,
    runner_cpu_ms = excluded.runner_cpu_ms,
    updated_at = now()
  returning id into v_id;

  select * into v_row
  from public.operations_collection_artifact_v
  where id = v_id;

  return v_row;
end;
$$;

create or replace view public.operations_collection_request_v
with (security_invoker = true) as
select
  o.id, o.company_id, c.company_slug, o.request_type, o.request_status,
  o.priority, o.service_date, o.service_date_start, o.service_date_end,
  o.requested_reports, o.request_payload, o.claimed_by, o.claimed_at,
  o.started_at, o.completed_at,
  case when o.started_at is not null and o.completed_at is not null
    then extract(epoch from (o.completed_at - o.started_at))::integer * 1000
    else null::integer end as duration_ms,
  o.automation_run_id, o.report_batch_ids, o.error_message,
  o.created_by_profile_id, o.created_at, o.updated_at,
  coalesce((o.output_receipt_json ->> 'report_count')::integer, report_stats.report_count, 0)::integer as report_count,
  coalesce((o.output_receipt_json ->> 'manifest_count')::integer, manifest_stats.manifest_count, 0)::integer as manifest_count,
  coalesce((o.output_receipt_json ->> 'route_count')::integer, manifest_stats.route_count, 0)::integer as route_count,
  o.output_receipt_json,
  public.collection_request_lane_priority(o.request_type) as lane_priority,
  artifact_stats.registered_count,
  artifact_stats.ready_count,
  artifact_stats.ingesting_count,
  artifact_stats.ingested_count,
  artifact_stats.failed_count
from core.operations_collection_request o
join core.companies c on c.id = o.company_id
left join lateral (
  select count(a.id)::integer as report_count
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id and a.artifact_kind = 'REPORT_FILE'
    and a.artifact_status = 'INGESTED'
) report_stats on true
left join lateral (
  select count(a.id)::integer as manifest_count,
         count(distinct a.route_key)::integer as route_count
  from core.operations_manifest_capture_plan p
  join core.operations_manifest_artifact a on a.capture_plan_id = p.id
  where p.company_id = o.company_id
    and p.metadata_json ->> 'source_collection_request_id' = o.id::text
) manifest_stats on true
left join lateral (
  select count(*)::integer as registered_count,
         count(*) filter (where a.artifact_status in ('UPLOADED', 'READY_FOR_INGEST'))::integer as ready_count,
         count(*) filter (where a.artifact_status = 'INGESTING')::integer as ingesting_count,
         count(*) filter (where a.artifact_status in ('INGESTED', 'IGNORED'))::integer as ingested_count,
         count(*) filter (where a.artifact_status = 'FAILED')::integer as failed_count
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id
) artifact_stats on true;

grant select on table public.operations_collection_request_v to authenticated;
grant all on table public.operations_collection_request_v to service_role;

create or replace view public.operations_collection_recovery_candidate_v
with (security_invoker = true) as
select
  a.id::text as candidate_key,
  a.id as artifact_id,
  a.collection_request_id,
  a.company_id,
  c.company_slug,
  a.service_date,
  r.request_type as failed_request_type,
  a.report_family_key,
  a.original_filename,
  a.error_message,
  a.attempt_count,
  a.ingest_priority,
  a.updated_at as failed_at,
  jsonb_build_object(
    'source', 'failed_artifact_recovery_queue',
    'runner_goal', 'collect_targeted_artifacts',
    'recovery_of_request_id', r.id,
    'recovery_of_artifact_id', a.id,
    'targets', coalesce(r.request_payload -> 'targets', '[]'::jsonb)
  ) as suggested_request_payload
from core.operations_collection_artifact a
join core.operations_collection_request r on r.id = a.collection_request_id
join core.companies c on c.id = a.company_id
where a.artifact_status = 'FAILED'
  and not exists (
    select 1 from core.operations_collection_request recovery
    where recovery.request_type = 'TARGETED_RECOVERY'
      and recovery.request_payload ->> 'recovery_of_artifact_id' = a.id::text
      and recovery.request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING', 'COMPLETE')
  )
union all
select
  r.id::text || ':' || missing.service_date::text as candidate_key,
  null::uuid as artifact_id,
  r.id as collection_request_id,
  r.company_id,
  c.company_slug,
  missing.service_date,
  r.request_type as failed_request_type,
  case
    when cardinality(r.requested_reports) = 1 then r.requested_reports[1]
    else null::text
  end as report_family_key,
  null::text as original_filename,
  r.error_message,
  0 as attempt_count,
  100 as ingest_priority,
  r.completed_at as failed_at,
  jsonb_build_object(
    'source', 'failed_request_recovery_queue',
    'runner_goal', 'collect_targeted_artifacts',
    'recovery_of_request_id', r.id,
    'targets', coalesce(r.request_payload -> 'targets', '[]'::jsonb)
  ) as suggested_request_payload
from core.operations_collection_request r
join core.companies c on c.id = r.company_id
cross join lateral (
  select day::date as service_date
  from generate_series(
    coalesce(r.service_date, r.service_date_start),
    coalesce(r.service_date, r.service_date_end, r.service_date_start),
    interval '1 day'
  ) day
) missing
where r.request_status = 'FAILED'
  and coalesce(r.service_date, r.service_date_start) is not null
  and not exists (
    select 1 from core.operations_collection_artifact existing
    where existing.collection_request_id = r.id
      and existing.service_date = missing.service_date
      and existing.artifact_status in ('UPLOADED', 'READY_FOR_INGEST', 'INGESTING', 'INGESTED')
  )
  and not exists (
    select 1 from core.operations_collection_request recovery
    where recovery.request_type = 'TARGETED_RECOVERY'
      and recovery.request_payload ->> 'recovery_of_request_id' = r.id::text
      and recovery.service_date = missing.service_date
      and recovery.request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING', 'COMPLETE')
  );

grant select on table public.operations_collection_recovery_candidate_v to authenticated;
grant all on table public.operations_collection_recovery_candidate_v to service_role;

create or replace function public.queue_operations_collection_recovery(
  p_collection_request_id uuid,
  p_service_date date,
  p_artifact_id uuid default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_source core.operations_collection_request%rowtype;
  v_artifact core.operations_collection_artifact%rowtype;
  v_request_id uuid;
  v_row public.operations_collection_request_v;
  v_payload jsonb;
  v_reports text[];
begin
  select * into v_source
  from core.operations_collection_request
  where id = p_collection_request_id;

  if v_source.id is null then
    raise exception 'Source collection request was not found.';
  end if;

  if p_artifact_id is not null then
    select * into v_artifact
    from core.operations_collection_artifact
    where id = p_artifact_id
      and collection_request_id = p_collection_request_id;

    if v_artifact.id is null then
      raise exception 'Failed artifact was not found on the source request.';
    end if;
  end if;

  if exists (
    select 1 from core.operations_collection_request recovery
    where recovery.request_type = 'TARGETED_RECOVERY'
      and recovery.request_payload ->> 'recovery_of_request_id' = p_collection_request_id::text
      and recovery.service_date = p_service_date
      and (p_artifact_id is null or recovery.request_payload ->> 'recovery_of_artifact_id' = p_artifact_id::text)
      and recovery.request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING', 'COMPLETE')
  ) then
    raise exception 'A governed recovery already exists for this failure.';
  end if;

  v_reports := case
    when v_artifact.id is not null and v_artifact.report_family_key is not null
      then array[v_artifact.report_family_key]
    else v_source.requested_reports
  end;

  v_payload := coalesce(v_source.request_payload, '{}'::jsonb) || jsonb_build_object(
    'source', 'failed_attempt_recovery_queue',
    'request_type', 'TARGETED_RECOVERY',
    'date_mode', 'SELECTED_DATE',
    'runner_goal', 'collect_targeted_artifacts',
    'recovery_of_request_id', p_collection_request_id,
    'recovery_of_artifact_id', p_artifact_id,
    'recovery_attempt', coalesce(v_artifact.attempt_count, 0) + 1
  );

  insert into core.operations_collection_request (
    company_id, request_type, request_status, priority, service_date,
    requested_reports, request_payload, created_by_profile_id
  ) values (
    v_source.company_id, 'TARGETED_RECOVERY', 'QUEUED', 10, p_service_date,
    coalesce(v_reports, '{}'::text[]), v_payload, v_source.created_by_profile_id
  ) returning id into v_request_id;

  select * into v_row
  from public.operations_collection_request_v
  where id = v_request_id;

  return v_row;
end;
$$;

revoke all on function public.queue_operations_collection_recovery(uuid, date, uuid) from public;
grant execute on function public.queue_operations_collection_recovery(uuid, date, uuid) to authenticated, service_role;

create or replace view public.operations_collection_cost_observation_v
with (security_invoker = true) as
select
  a.id as artifact_id,
  a.collection_request_id,
  a.company_id,
  c.company_slug,
  a.service_date,
  r.request_type,
  coalesce(
    nullif(a.runner_artifact_json ->> 'artifact_key', ''),
    a.report_family_key,
    'UNKNOWN'
  ) as artifact_class,
  a.original_filename,
  a.size_bytes,
  a.attempt_count,
  a.runner_elapsed_ms,
  a.runner_cpu_ms,
  case
    when a.ingest_started_at is not null and a.ingest_completed_at is not null
      then extract(epoch from (a.ingest_completed_at - a.ingest_started_at))::integer * 1000
    else null::integer
  end as ingest_duration_ms,
  request_fact.report_count,
  request_fact.manifest_count,
  request_fact.route_count,
  case when request_fact.route_count > 0 and a.runner_elapsed_ms is not null
    then round(a.runner_elapsed_ms::numeric / request_fact.route_count, 2)
    else null::numeric
  end as runner_elapsed_ms_per_route,
  case when request_fact.route_count > 0 and a.runner_cpu_ms is not null
    then round(a.runner_cpu_ms::numeric / request_fact.route_count, 2)
    else null::numeric
  end as runner_cpu_ms_per_route
from core.operations_collection_artifact a
join core.operations_collection_request r on r.id = a.collection_request_id
join core.companies c on c.id = a.company_id
join public.operations_collection_request_v request_fact on request_fact.id = r.id;

grant select on table public.operations_collection_cost_observation_v to authenticated;
grant all on table public.operations_collection_cost_observation_v to service_role;

create or replace function public.update_operations_collection_artifact_status(
  p_artifact_id uuid,
  p_artifact_status text,
  p_ingest_metadata_json jsonb default null,
  p_report_batch_id uuid default null,
  p_error_message text default null
)
returns public.operations_collection_artifact_v
language plpgsql
security definer
set search_path to 'core', 'public'
as $$
declare
  v_row public.operations_collection_artifact_v;
begin
  update core.operations_collection_artifact
  set artifact_status = p_artifact_status,
      ingest_metadata_json = coalesce(p_ingest_metadata_json, ingest_metadata_json),
      report_batch_id = p_report_batch_id,
      error_message = p_error_message,
      attempt_count = attempt_count + case when p_artifact_status = 'INGESTING' then 1 else 0 end,
      ingest_started_at = case
        when p_artifact_status = 'INGESTING' then now()
        else ingest_started_at
      end,
      ingest_completed_at = case
        when p_artifact_status in ('INGESTED', 'FAILED', 'IGNORED') then now()
        when p_artifact_status = 'INGESTING' then null
        else ingest_completed_at
      end,
      updated_at = now()
  where id = p_artifact_id;

  select * into v_row
  from public.operations_collection_artifact_v
  where id = p_artifact_id;

  return v_row;
end;
$$;

revoke all on function public.collection_request_lane_priority(text) from public;
grant execute on function public.collection_request_lane_priority(text) to authenticated, service_role;
revoke all on function public.collection_artifact_ingest_priority(text, text, text, jsonb) from public;
grant execute on function public.collection_artifact_ingest_priority(text, text, text, jsonb) to service_role;
