-- Request status is authoritative. A failed artifact retained inside a
-- COMPLETE request is historical evidence, not recovery work.

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
where r.request_type = 'PREVIOUS_DAY_CLOSE'
  and r.request_status = 'FAILED'
  and a.artifact_status = 'FAILED'
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
  case when cardinality(r.requested_reports) = 1 then r.requested_reports[1] else null::text end,
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
where r.request_type = 'PREVIOUS_DAY_CLOSE'
  and r.request_status = 'FAILED'
  and coalesce(r.service_date, r.service_date_start) is not null
  and not exists (
    select 1 from core.operations_collection_artifact existing
    where existing.collection_request_id = r.id
      and existing.service_date = missing.service_date
      and existing.artifact_status in ('UPLOADED', 'READY_FOR_INGEST', 'INGESTING', 'INGESTED', 'IGNORED')
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

notify pgrst, 'reload schema';
