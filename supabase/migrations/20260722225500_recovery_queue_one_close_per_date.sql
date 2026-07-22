-- Recovery is a previous-day-close decision, not an artifact decision.
-- Collapse all failed files and repeated failed close requests into one row per
-- company/service date, and remove the date once a replacement succeeds.

create or replace view public.operations_collection_recovery_candidate_v
with (security_invoker = true) as
with failed_close_dates as (
  select
    r.company_id,
    coalesce(r.service_date, r.service_date_start) as service_date,
    count(distinct r.id)::integer as failed_request_count,
    max(coalesce(r.completed_at, r.updated_at)) as failed_at
  from core.operations_collection_request r
  where r.request_type = 'PREVIOUS_DAY_CLOSE'
    and r.request_status = 'FAILED'
    and coalesce(r.service_date, r.service_date_start) is not null
  group by r.company_id, coalesce(r.service_date, r.service_date_start)
), source_request as (
  select distinct on (r.company_id, d.service_date)
    d.company_id,
    d.service_date,
    d.failed_request_count,
    d.failed_at,
    r.id as collection_request_id,
    r.requested_reports,
    r.request_payload,
    r.error_message
  from failed_close_dates d
  join core.operations_collection_request r
    on r.company_id = d.company_id
   and r.request_type = 'PREVIOUS_DAY_CLOSE'
   and r.request_status = 'FAILED'
   and coalesce(r.service_date, r.service_date_start) = d.service_date
  order by
    r.company_id,
    d.service_date,
    coalesce(r.completed_at, r.updated_at) desc,
    r.id desc
)
select
  s.company_id::text || ':' || s.service_date::text as candidate_key,
  null::uuid as artifact_id,
  s.collection_request_id,
  s.company_id,
  c.company_slug,
  s.service_date,
  'PREVIOUS_DAY_CLOSE'::text as failed_request_type,
  case
    when cardinality(s.requested_reports) = 1 then s.requested_reports[1]
    else null::text
  end as report_family_key,
  null::text as original_filename,
  s.error_message,
  s.failed_request_count as attempt_count,
  100 as ingest_priority,
  s.failed_at,
  jsonb_build_object(
    'source', 'failed_previous_day_close_recovery_queue',
    'runner_goal', 'collect_targeted_artifacts',
    'recovery_of_request_id', s.collection_request_id,
    'targets', coalesce(s.request_payload -> 'targets', '[]'::jsonb)
  ) as suggested_request_payload
from source_request s
join core.companies c on c.id = s.company_id
where not exists (
  select 1
  from core.operations_collection_request successful
  where successful.company_id = s.company_id
    and coalesce(successful.service_date, successful.service_date_start) = s.service_date
    and successful.request_type in ('PREVIOUS_DAY_CLOSE', 'TARGETED_RECOVERY')
    and successful.request_status = 'COMPLETE'
    and (
      successful.request_type = 'PREVIOUS_DAY_CLOSE'
      or successful.request_payload ->> 'recovery_of_artifact_id' is null
    )
)
and not exists (
  select 1
  from core.operations_collection_request active
  where active.company_id = s.company_id
    and active.service_date = s.service_date
    and active.request_type = 'TARGETED_RECOVERY'
    and active.request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
);

grant select on table public.operations_collection_recovery_candidate_v to authenticated;
grant all on table public.operations_collection_recovery_candidate_v to service_role;

notify pgrst, 'reload schema';
