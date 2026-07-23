-- Collection reconciliation ends when the request accepts its collected
-- evidence. Downstream manifest normalization may continue independently and
-- must not make request reconciliation negative or rewrite its duration.

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
    round(avg(artifact.processing_ms))::integer as average_processing_ms
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
  greatest(
    0,
    extract(epoch from (
      event_rollup.reconciled_at - event_rollup.collection_completed_at
    ))::integer * 1000
  ) as reconciliation_ms,
  extract(epoch from (
    event_rollup.reconciled_at - event_rollup.request_created_at
  ))::integer * 1000 as end_to_end_ms
from core.operations_collection_request request
join core.companies company on company.id = request.company_id
left join event_rollup on event_rollup.collection_request_id = request.id
left join artifact_rollup
  on artifact_rollup.collection_request_id = request.id;

notify pgrst, 'reload schema';
