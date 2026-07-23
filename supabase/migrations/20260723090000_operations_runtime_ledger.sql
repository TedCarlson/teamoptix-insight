-- Append-only runtime evidence shared by Insight and the VPS runner.
-- Operational tables remain authoritative for work state; this ledger explains
-- where wall-clock time was spent without coupling relay execution.

create table if not exists core.operations_collection_runtime_event (
  id uuid primary key default gen_random_uuid(),
  collection_request_id uuid not null
    references core.operations_collection_request(id) on delete cascade,
  artifact_id uuid
    references core.operations_collection_artifact(id) on delete set null,
  idempotency_key text not null unique,
  source_system text not null,
  event_type text not null,
  stage text not null,
  lane_key text,
  artifact_execution_key text,
  artifact_key text,
  route_identity text,
  attempt_number integer not null default 1,
  outcome text,
  occurred_at timestamptz not null,
  duration_ms integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint operations_collection_runtime_event_source_chk check (
    source_system = any (array['INSIGHT', 'RUNNER'])
  ),
  constraint operations_collection_runtime_event_attempt_chk check (
    attempt_number > 0
  ),
  constraint operations_collection_runtime_event_duration_chk check (
    duration_ms is null or duration_ms >= 0
  )
);

create index if not exists operations_collection_runtime_event_request_idx
  on core.operations_collection_runtime_event
  (collection_request_id, occurred_at, created_at);

create index if not exists operations_collection_runtime_event_artifact_idx
  on core.operations_collection_runtime_event
  (artifact_execution_key, occurred_at)
  where artifact_execution_key is not null;

alter table core.operations_collection_runtime_event enable row level security;

drop policy if exists operations_collection_runtime_event_select_access
  on core.operations_collection_runtime_event;

create policy operations_collection_runtime_event_select_access
  on core.operations_collection_runtime_event
  for select
  to authenticated
  using (
    exists (
      select 1
      from core.operations_collection_request request
      where request.id = collection_request_id
        and (
          core.is_platform_owner()
          or core.can_access_company(request.company_id)
        )
    )
  );

create or replace view public.operations_collection_runtime_event_v
with (security_invoker = true) as
select
  event.id,
  event.collection_request_id,
  request.company_id,
  company.company_slug,
  event.artifact_id,
  event.idempotency_key,
  event.source_system,
  event.event_type,
  event.stage,
  event.lane_key,
  event.artifact_execution_key,
  event.artifact_key,
  event.route_identity,
  event.attempt_number,
  event.outcome,
  event.occurred_at,
  event.duration_ms,
  event.metadata_json,
  event.created_at
from core.operations_collection_runtime_event event
join core.operations_collection_request request
  on request.id = event.collection_request_id
join core.companies company
  on company.id = request.company_id;

create or replace function public.record_operations_collection_runtime_event(
  p_collection_request_id uuid,
  p_idempotency_key text,
  p_source_system text,
  p_event_type text,
  p_stage text,
  p_occurred_at timestamptz,
  p_artifact_id uuid default null,
  p_lane_key text default null,
  p_artifact_execution_key text default null,
  p_artifact_key text default null,
  p_route_identity text default null,
  p_attempt_number integer default 1,
  p_outcome text default null,
  p_duration_ms integer default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns public.operations_collection_runtime_event_v
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_event_id uuid;
  v_row public.operations_collection_runtime_event_v;
begin
  if not exists (
    select 1
    from core.operations_collection_request
    where id = p_collection_request_id
  ) then
    raise exception 'Collection request not found.';
  end if;

  insert into core.operations_collection_runtime_event (
    collection_request_id,
    artifact_id,
    idempotency_key,
    source_system,
    event_type,
    stage,
    lane_key,
    artifact_execution_key,
    artifact_key,
    route_identity,
    attempt_number,
    outcome,
    occurred_at,
    duration_ms,
    metadata_json
  ) values (
    p_collection_request_id,
    p_artifact_id,
    nullif(trim(p_idempotency_key), ''),
    upper(trim(p_source_system)),
    upper(trim(p_event_type)),
    upper(trim(p_stage)),
    nullif(trim(p_lane_key), ''),
    nullif(trim(p_artifact_execution_key), ''),
    nullif(trim(p_artifact_key), ''),
    nullif(trim(p_route_identity), ''),
    greatest(coalesce(p_attempt_number, 1), 1),
    nullif(upper(trim(p_outcome)), ''),
    coalesce(p_occurred_at, now()),
    p_duration_ms,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (idempotency_key) do update set
    artifact_id = coalesce(
      excluded.artifact_id,
      core.operations_collection_runtime_event.artifact_id
    ),
    metadata_json =
      core.operations_collection_runtime_event.metadata_json
      || excluded.metadata_json
  returning id into v_event_id;

  select *
  into v_row
  from public.operations_collection_runtime_event_v
  where id = v_event_id;

  return v_row;
end;
$$;

create or replace function core.record_collection_request_runtime_transition()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_event_type text;
  v_stage text;
  v_occurred_at timestamptz;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'REQUEST_CREATED';
    v_stage := 'REQUEST';
    v_occurred_at := new.created_at;
  elsif new.request_status is not distinct from old.request_status then
    return new;
  else
    v_event_type := 'REQUEST_' || new.request_status;
    v_stage := case new.request_status
      when 'CLAIMED' then 'CLAIM'
      when 'RUNNING' then 'COLLECTION'
      when 'ARTIFACTS_READY' then 'HANDOFF'
      when 'INGESTING' then 'PROCESSING'
      when 'COMPLETE' then 'RECONCILIATION'
      when 'FAILED' then 'RECONCILIATION'
      when 'CANCELLED' then 'RECONCILIATION'
      else 'REQUEST'
    end;
    v_occurred_at := case
      when new.request_status = 'CLAIMED' then coalesce(new.claimed_at, now())
      when new.request_status = 'RUNNING' then coalesce(new.started_at, now())
      when new.request_status in ('COMPLETE', 'FAILED', 'CANCELLED')
        then coalesce(new.completed_at, now())
      else now()
    end;
  end if;

  insert into core.operations_collection_runtime_event (
    collection_request_id,
    idempotency_key,
    source_system,
    event_type,
    stage,
    outcome,
    occurred_at,
    metadata_json
  ) values (
    new.id,
    'insight:request:' || new.id::text || ':' || v_event_type,
    'INSIGHT',
    v_event_type,
    v_stage,
    case when new.request_status in ('COMPLETE', 'FAILED', 'CANCELLED')
      then new.request_status else null end,
    v_occurred_at,
    jsonb_build_object(
      'request_status', new.request_status,
      'error_message', new.error_message
    )
  )
  on conflict (idempotency_key) do update set
    occurred_at = excluded.occurred_at,
    outcome = excluded.outcome,
    metadata_json = excluded.metadata_json;

  return new;
end;
$$;

drop trigger if exists operations_collection_request_runtime_insert_trg
  on core.operations_collection_request;
create trigger operations_collection_request_runtime_insert_trg
after insert on core.operations_collection_request
for each row execute function core.record_collection_request_runtime_transition();

drop trigger if exists operations_collection_request_runtime_update_trg
  on core.operations_collection_request;
create trigger operations_collection_request_runtime_update_trg
after update of request_status on core.operations_collection_request
for each row execute function core.record_collection_request_runtime_transition();

create or replace function core.record_collection_artifact_runtime_transition()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_execution_key text;
  v_artifact_key text;
  v_event_type text;
  v_stage text;
  v_occurred_at timestamptz;
begin
  v_execution_key := coalesce(
    nullif(new.runner_artifact_json ->> 'artifact_execution_key', ''),
    new.id::text
  );
  v_artifact_key := coalesce(
    nullif(new.runner_artifact_json ->> 'artifact_key', ''),
    new.report_family_key,
    new.artifact_kind
  );

  if tg_op = 'INSERT' then
    insert into core.operations_collection_runtime_event (
      collection_request_id, artifact_id, idempotency_key, source_system,
      event_type, stage, lane_key, artifact_execution_key, artifact_key,
      route_identity, occurred_at, metadata_json
    ) values (
      new.collection_request_id, new.id,
      'insight:artifact:' || new.id::text || ':ARTIFACT_REGISTERED',
      'INSIGHT', 'ARTIFACT_REGISTERED', 'REGISTRATION',
      nullif(new.runner_artifact_json ->> 'lane_key', ''),
      v_execution_key, v_artifact_key,
      nullif(new.runner_artifact_json #>> '{header_identity,work_area}', ''),
      new.created_at,
      jsonb_build_object(
        'storage_bucket', new.storage_bucket,
        'storage_path', new.storage_path,
        'size_bytes', new.size_bytes
      )
    )
    on conflict (idempotency_key) do update set
      artifact_id = excluded.artifact_id,
      metadata_json =
        core.operations_collection_runtime_event.metadata_json
        || excluded.metadata_json;

    insert into core.operations_collection_runtime_event (
      collection_request_id, artifact_id, idempotency_key, source_system,
      event_type, stage, lane_key, artifact_execution_key, artifact_key,
      occurred_at
    ) values (
      new.collection_request_id, new.id,
      'insight:artifact:' || new.id::text || ':PROCESSING_QUEUED',
      'INSIGHT', 'PROCESSING_QUEUED', 'PROCESSING_QUEUE',
      nullif(new.runner_artifact_json ->> 'lane_key', ''),
      v_execution_key, v_artifact_key, new.created_at
    )
    on conflict (idempotency_key) do nothing;

    return new;
  end if;

  if new.artifact_status is not distinct from old.artifact_status then
    return new;
  end if;

  if new.artifact_status = 'INGESTING' then
    v_event_type := 'PROCESSING_STARTED';
    v_stage := 'PROCESSING';
    v_occurred_at := coalesce(new.ingest_started_at, now());
  elsif new.artifact_status = 'IGNORED'
    and new.ingest_metadata_json ->> 'source'
      = 'promote_operations_collection_manifest_artifacts'
  then
    -- Promotion is a durable handoff into the manifest processor, not the end
    -- of processing for this artifact execution.
    insert into core.operations_collection_runtime_event (
      collection_request_id, artifact_id, idempotency_key, source_system,
      event_type, stage, lane_key, artifact_execution_key, artifact_key,
      occurred_at, outcome, metadata_json
    ) values (
      new.collection_request_id,
      new.id,
      'insight:artifact:' || new.id::text || ':MANIFEST_PROMOTED',
      'INSIGHT',
      'MANIFEST_PROMOTED',
      'PROCESSING_HANDOFF',
      nullif(new.runner_artifact_json ->> 'lane_key', ''),
      v_execution_key,
      v_artifact_key,
      new.updated_at,
      'COMPLETE',
      jsonb_build_object(
        'manifest_capture_plan_id',
          new.ingest_metadata_json ->> 'manifest_capture_plan_id',
        'manifest_capture_plan_route_id',
          new.ingest_metadata_json ->> 'manifest_capture_plan_route_id',
        'manifest_type',
          new.ingest_metadata_json ->> 'manifest_type'
      )
    )
    on conflict (idempotency_key) do update set
      occurred_at = excluded.occurred_at,
      metadata_json = excluded.metadata_json;
    return new;
  elsif new.artifact_status in ('INGESTED', 'FAILED', 'IGNORED') then
    v_event_type := 'PROCESSING_COMPLETED';
    v_stage := 'PROCESSING';
    v_occurred_at := coalesce(new.ingest_completed_at, now());
  else
    return new;
  end if;

  insert into core.operations_collection_runtime_event (
    collection_request_id, artifact_id, idempotency_key, source_system,
    event_type, stage, lane_key, artifact_execution_key, artifact_key,
    attempt_number, outcome, occurred_at, metadata_json
  ) values (
    new.collection_request_id, new.id,
    'insight:artifact:' || new.id::text || ':' || v_event_type
      || ':' || greatest(coalesce(new.attempt_count, 1), 1)::text,
    'INSIGHT', v_event_type, v_stage,
    nullif(new.runner_artifact_json ->> 'lane_key', ''),
    v_execution_key, v_artifact_key,
    greatest(coalesce(new.attempt_count, 1), 1),
    case when v_event_type = 'PROCESSING_COMPLETED'
      then new.artifact_status else null end,
    v_occurred_at,
    jsonb_build_object(
      'artifact_status', new.artifact_status,
      'error_message', new.error_message,
      'report_batch_id', new.report_batch_id
    )
  )
  on conflict (idempotency_key) do update set
    occurred_at = excluded.occurred_at,
    outcome = excluded.outcome,
    metadata_json = excluded.metadata_json;

  return new;
end;
$$;

drop trigger if exists operations_collection_artifact_runtime_insert_trg
  on core.operations_collection_artifact;
create trigger operations_collection_artifact_runtime_insert_trg
after insert on core.operations_collection_artifact
for each row execute function core.record_collection_artifact_runtime_transition();

drop trigger if exists operations_collection_artifact_runtime_update_trg
  on core.operations_collection_artifact;
create trigger operations_collection_artifact_runtime_update_trg
after update of artifact_status on core.operations_collection_artifact
for each row execute function core.record_collection_artifact_runtime_transition();

create or replace function core.record_manifest_artifact_runtime_transition()
returns trigger
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_collection_artifact core.operations_collection_artifact%rowtype;
  v_collection_request_id uuid;
  v_execution_key text;
  v_artifact_key text;
  v_lane_key text;
  v_event_type text;
  v_occurred_at timestamptz;
begin
  if new.metadata_json ->> 'source_collection_artifact_id' is null then
    return new;
  end if;

  select *
  into v_collection_artifact
  from core.operations_collection_artifact
  where id = (new.metadata_json ->> 'source_collection_artifact_id')::uuid;

  if v_collection_artifact.id is null then
    return new;
  end if;

  v_collection_request_id := v_collection_artifact.collection_request_id;
  v_execution_key := coalesce(
    nullif(
      v_collection_artifact.runner_artifact_json
        ->> 'artifact_execution_key',
      ''
    ),
    v_collection_artifact.id::text
  );
  v_artifact_key := coalesce(
    nullif(v_collection_artifact.runner_artifact_json ->> 'artifact_key', ''),
    case new.manifest_type
      when 'delivery' then 'DELIVERY_MANIFEST'
      when 'pickup' then 'PICKUP_MANIFEST'
      else upper(new.manifest_type)
    end
  );
  v_lane_key := coalesce(
    nullif(v_collection_artifact.runner_artifact_json ->> 'lane_key', ''),
    case new.manifest_type
      when 'delivery' then 'FCC_DELIVERY_MANIFESTS'
      when 'pickup' then 'FCC_PICKUP_MANIFESTS'
      else null
    end
  );

  if new.artifact_status = 'VALIDATING' then
    v_event_type := 'PROCESSING_STARTED';
    v_occurred_at := coalesce(
      nullif(new.metadata_json ->> 'processor_started_at', '')::timestamptz,
      new.updated_at,
      now()
    );
  elsif new.artifact_status in (
    'NORMALIZED', 'FAILED', 'SUPERSEDED', 'IGNORED'
  ) then
    v_event_type := 'PROCESSING_COMPLETED';
    v_occurred_at := coalesce(new.processed_at, new.updated_at, now());
  else
    return new;
  end if;

  insert into core.operations_collection_runtime_event (
    collection_request_id, artifact_id, idempotency_key, source_system,
    event_type, stage, lane_key, artifact_execution_key, artifact_key,
    route_identity, outcome, occurred_at, metadata_json
  ) values (
    v_collection_request_id,
    v_collection_artifact.id,
    'insight:manifest-artifact:' || new.id::text || ':' || v_event_type,
    'INSIGHT',
    v_event_type,
    'PROCESSING',
    v_lane_key,
    v_execution_key,
    v_artifact_key,
    new.route_key,
    case when v_event_type = 'PROCESSING_COMPLETED'
      then new.artifact_status else null end,
    v_occurred_at,
    jsonb_build_object(
      'manifest_artifact_id', new.id,
      'manifest_type', new.manifest_type,
      'manifest_status', new.artifact_status,
      'error_message', new.error_message
    )
  )
  on conflict (idempotency_key) do update set
    occurred_at = excluded.occurred_at,
    outcome = excluded.outcome,
    metadata_json = excluded.metadata_json;

  return new;
end;
$$;

drop trigger if exists operations_manifest_artifact_runtime_update_trg
  on core.operations_manifest_artifact;
create trigger operations_manifest_artifact_runtime_update_trg
after update of artifact_status on core.operations_manifest_artifact
for each row execute function core.record_manifest_artifact_runtime_transition();

-- These are derived diagnostic projections. Rebuild them in dependency order
-- so additive lifecycle columns do not look like renames to PostgreSQL.
drop view if exists public.operations_collection_runtime_baseline_v;
drop view if exists public.operations_collection_request_runtime_v;
drop view if exists public.operations_collection_artifact_runtime_v;

create or replace view public.operations_collection_artifact_runtime_v
with (security_invoker = true) as
select
  event.collection_request_id,
  event.company_id,
  event.company_slug,
  event.artifact_execution_key,
  min(event.artifact_id::text)::uuid as artifact_id,
  max(event.artifact_key) as artifact_key,
  max(event.route_identity) as route_identity,
  max(event.lane_key) as lane_key,
  min(event.occurred_at) filter (
    where event.event_type = 'SOURCE_REQUESTED'
  ) as source_requested_at,
  min(event.occurred_at) filter (
    where event.event_type = 'SOURCE_READY'
  ) as source_ready_at,
  min(event.occurred_at) filter (
    where event.event_type = 'DOWNLOAD_STARTED'
  ) as download_started_at,
  min(event.occurred_at) filter (
    where event.event_type = 'DOWNLOAD_COMPLETED'
  ) as download_completed_at,
  min(event.occurred_at) filter (
    where event.event_type = 'UPLOAD_STARTED'
  ) as upload_started_at,
  min(event.occurred_at) filter (
    where event.event_type = 'UPLOAD_COMPLETED'
  ) as upload_completed_at,
  min(event.occurred_at) filter (
    where event.event_type = 'ARTIFACT_REGISTERED'
  ) as registered_at,
  min(event.occurred_at) filter (
    where event.event_type = 'MANIFEST_PROMOTED'
  ) as manifest_promoted_at,
  min(event.occurred_at) filter (
    where event.event_type = 'PROCESSING_QUEUED'
  ) as processing_queued_at,
  min(event.occurred_at) filter (
    where event.event_type = 'PROCESSING_STARTED'
  ) as processing_started_at,
  max(event.occurred_at) filter (
    where event.event_type = 'PROCESSING_COMPLETED'
  ) as processing_completed_at,
  max(event.outcome) filter (
    where event.event_type = 'PROCESSING_COMPLETED'
  ) as outcome,
  max(event.attempt_number) as attempt_count,
  extract(epoch from (
    min(event.occurred_at) filter (where event.event_type = 'SOURCE_READY')
    - min(event.occurred_at) filter (where event.event_type = 'SOURCE_REQUESTED')
  ))::integer * 1000 as source_generation_ms,
  extract(epoch from (
    min(event.occurred_at) filter (where event.event_type = 'DOWNLOAD_COMPLETED')
    - min(event.occurred_at) filter (where event.event_type = 'DOWNLOAD_STARTED')
  ))::integer * 1000 as download_ms,
  extract(epoch from (
    min(event.occurred_at) filter (where event.event_type = 'UPLOAD_COMPLETED')
    - min(event.occurred_at) filter (where event.event_type = 'UPLOAD_STARTED')
  ))::integer * 1000 as upload_ms,
  max(event.duration_ms) filter (
    where event.event_type = 'ARTIFACT_IDENTIFICATION_COMPLETED'
  ) as artifact_identification_ms,
  max(event.duration_ms) filter (
    where event.event_type = 'PAYLOAD_PACKAGING_COMPLETED'
  ) as payload_packaging_ms,
  max(event.duration_ms) filter (
    where event.event_type = 'REGISTRATION_COMPLETED'
  ) as registration_ms,
  extract(epoch from (
    min(event.occurred_at) filter (where event.event_type = 'PROCESSING_STARTED')
    - min(event.occurred_at) filter (where event.event_type = 'PROCESSING_QUEUED')
  ))::integer * 1000 as processing_queue_ms,
  extract(epoch from (
    max(event.occurred_at) filter (where event.event_type = 'PROCESSING_COMPLETED')
    - min(event.occurred_at) filter (where event.event_type = 'PROCESSING_STARTED')
  ))::integer * 1000 as processing_ms
from public.operations_collection_runtime_event_v event
where event.artifact_execution_key is not null
group by
  event.collection_request_id,
  event.company_id,
  event.company_slug,
  event.artifact_execution_key;

create or replace view public.operations_collection_request_runtime_v
with (security_invoker = true) as
with event_rollup as (
  select
    event.collection_request_id,
    min(event.occurred_at) filter (
      where event.event_type = 'REQUEST_CREATED'
    ) as request_created_at,
    min(event.occurred_at) filter (
      where event.event_type = 'REQUEST_CLAIMED'
    ) as claimed_at,
    min(event.occurred_at) filter (
      where event.event_type = 'AUTH_STARTED'
    ) as auth_started_at,
    min(event.occurred_at) filter (
      where event.event_type = 'AUTH_COMPLETED'
    ) as auth_completed_at,
    sum(event.duration_ms) filter (
      where event.event_type = 'AUTH_COMPLETED'
    )::integer as authentication_total_ms,
    min(event.occurred_at) filter (
      where event.event_type = 'COLLECTION_STARTED'
    ) as collection_started_at,
    max(event.metadata_json ->> 'execution_mode') filter (
      where event.event_type = 'COLLECTION_STARTED'
    ) as execution_mode,
    max(event.occurred_at) filter (
      where event.event_type = 'COLLECTION_COMPLETED'
    ) as collection_completed_at,
    max(event.occurred_at) filter (
      where event.event_type in (
        'REQUEST_COMPLETE', 'REQUEST_FAILED', 'REQUEST_CANCELLED'
      )
    ) as reconciled_at,
    max(event.occurred_at) as last_activity_at,
    count(*)::integer as event_count
  from public.operations_collection_runtime_event_v event
  group by event.collection_request_id
),
artifact_rollup as (
  select
    artifact.collection_request_id,
    count(*)::integer as measured_artifact_count,
    round(avg(artifact.source_generation_ms))::integer
      as average_source_generation_ms,
    round(avg(artifact.download_ms))::integer as average_download_ms,
    round(avg(artifact.upload_ms))::integer as average_upload_ms,
    round(avg(artifact.artifact_identification_ms))::integer
      as average_artifact_identification_ms,
    round(avg(artifact.payload_packaging_ms))::integer
      as average_payload_packaging_ms,
    round(avg(artifact.registration_ms))::integer
      as average_registration_ms,
    round(avg(artifact.processing_queue_ms))::integer
      as average_processing_queue_ms,
    round(avg(artifact.processing_ms))::integer as average_processing_ms,
    max(artifact.processing_completed_at) as last_processing_completed_at
  from public.operations_collection_artifact_runtime_v artifact
  group by artifact.collection_request_id
)
select
  request.id as collection_request_id,
  request.company_id,
  company.company_slug,
  request.request_type,
  request.request_status,
  coalesce(event_rollup.execution_mode, 'UNMEASURED') as execution_mode,
  event_rollup.request_created_at,
  event_rollup.claimed_at,
  event_rollup.auth_started_at,
  event_rollup.auth_completed_at,
  event_rollup.collection_started_at,
  event_rollup.collection_completed_at,
  event_rollup.reconciled_at,
  event_rollup.last_activity_at,
  event_rollup.event_count,
  coalesce(artifact_rollup.measured_artifact_count, 0)
    as measured_artifact_count,
  artifact_rollup.average_source_generation_ms,
  artifact_rollup.average_download_ms,
  artifact_rollup.average_upload_ms,
  artifact_rollup.average_artifact_identification_ms,
  artifact_rollup.average_payload_packaging_ms,
  artifact_rollup.average_registration_ms,
  artifact_rollup.average_processing_queue_ms,
  artifact_rollup.average_processing_ms,
  extract(epoch from (
    event_rollup.claimed_at - event_rollup.request_created_at
  ))::integer * 1000 as claim_wait_ms,
  coalesce(
    event_rollup.authentication_total_ms,
    extract(epoch from (
      event_rollup.auth_completed_at - event_rollup.auth_started_at
    ))::integer * 1000
  ) as authentication_ms,
  extract(epoch from (
    event_rollup.collection_completed_at - event_rollup.collection_started_at
  ))::integer * 1000 as collection_ms,
  extract(epoch from (
    event_rollup.reconciled_at
    - greatest(
      event_rollup.collection_completed_at,
      artifact_rollup.last_processing_completed_at
    )
  ))::integer * 1000 as reconciliation_ms,
  extract(epoch from (
    event_rollup.reconciled_at - event_rollup.request_created_at
  ))::integer * 1000 as end_to_end_ms
from core.operations_collection_request request
join core.companies company on company.id = request.company_id
left join event_rollup on event_rollup.collection_request_id = request.id
left join artifact_rollup
  on artifact_rollup.collection_request_id = request.id;

create or replace view public.operations_collection_runtime_baseline_v
with (security_invoker = true) as
select
  runtime.company_id,
  runtime.company_slug,
  runtime.request_type,
  runtime.execution_mode,
  count(*)::integer as measured_run_count,
  min(runtime.request_created_at) as baseline_started_at,
  max(runtime.reconciled_at) as baseline_last_measured_at,
  round(avg(runtime.end_to_end_ms))::integer as average_end_to_end_ms,
  percentile_cont(0.5) within group (
    order by runtime.end_to_end_ms
  )::integer as median_end_to_end_ms,
  percentile_cont(0.95) within group (
    order by runtime.end_to_end_ms
  )::integer as p95_end_to_end_ms,
  round(avg(runtime.claim_wait_ms))::integer as average_claim_wait_ms,
  round(avg(runtime.authentication_ms))::integer as average_authentication_ms,
  round(avg(runtime.collection_ms))::integer as average_collection_ms,
  round(avg(runtime.average_source_generation_ms))::integer
    as average_source_generation_ms,
  round(avg(runtime.average_download_ms))::integer
    as average_download_ms,
  round(avg(runtime.average_upload_ms))::integer as average_upload_ms,
  round(avg(runtime.average_artifact_identification_ms))::integer
    as average_artifact_identification_ms,
  round(avg(runtime.average_payload_packaging_ms))::integer
    as average_payload_packaging_ms,
  round(avg(runtime.average_registration_ms))::integer
    as average_registration_ms,
  round(avg(runtime.average_processing_queue_ms))::integer
    as average_processing_queue_ms,
  round(avg(runtime.average_processing_ms))::integer
    as average_processing_ms,
  round(avg(runtime.reconciliation_ms))::integer
    as average_reconciliation_ms
from public.operations_collection_request_runtime_v runtime
where runtime.request_status = 'COMPLETE'
  and runtime.end_to_end_ms is not null
  and runtime.request_created_at >= now() - interval '30 days'
group by
  runtime.company_id,
  runtime.company_slug,
  runtime.request_type,
  runtime.execution_mode;

grant select on table core.operations_collection_runtime_event to authenticated;
grant all on table core.operations_collection_runtime_event to service_role;
grant select on table public.operations_collection_runtime_event_v to authenticated;
grant all on table public.operations_collection_runtime_event_v to service_role;
grant select on table public.operations_collection_artifact_runtime_v to authenticated;
grant all on table public.operations_collection_artifact_runtime_v to service_role;
grant select on table public.operations_collection_request_runtime_v to authenticated;
grant all on table public.operations_collection_request_runtime_v to service_role;
grant select on table public.operations_collection_runtime_baseline_v to authenticated;
grant all on table public.operations_collection_runtime_baseline_v to service_role;

revoke all on function public.record_operations_collection_runtime_event(
  uuid, text, text, text, text, timestamptz, uuid, text, text, text, text,
  integer, text, integer, jsonb
) from public;
grant execute on function public.record_operations_collection_runtime_event(
  uuid, text, text, text, text, timestamptz, uuid, text, text, text, text,
  integer, text, integer, jsonb
) to service_role;

notify pgrst, 'reload schema';
