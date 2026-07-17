create or replace view public.operations_collection_request_v
with (security_invoker = true) as
select
  o.id,
  o.company_id,
  c.company_slug,
  o.request_type,
  o.request_status,
  o.priority,
  o.service_date,
  o.service_date_start,
  o.service_date_end,
  o.requested_reports,
  o.request_payload,
  o.claimed_by,
  o.claimed_at,
  o.started_at,
  o.completed_at,
  case
    when o.started_at is not null
      and o.completed_at is not null
      then extract(epoch from (o.completed_at - o.started_at))::integer * 1000
    else null::integer
  end as duration_ms,
  o.automation_run_id,
  o.report_batch_ids,
  o.error_message,
  o.created_by_profile_id,
  o.created_at,
  o.updated_at,
  coalesce(report_stats.report_count, 0)::integer as report_count,
  coalesce(manifest_stats.manifest_count, 0)::integer as manifest_count,
  coalesce(manifest_stats.route_count, 0)::integer as route_count
from core.operations_collection_request o
join core.companies c
  on c.id = o.company_id
left join lateral (
  select count(a.id)::integer as report_count
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id
    and a.artifact_kind = 'REPORT_FILE'
    and a.artifact_status = 'INGESTED'
) report_stats
  on true
left join lateral (
  select
    count(a.id)::integer as manifest_count,
    count(distinct a.route_key)::integer as route_count
  from core.operations_manifest_capture_plan p
  join core.operations_manifest_artifact a
    on a.capture_plan_id = p.id
  where p.company_id = o.company_id
    and p.metadata_json ->> 'source_collection_request_id' = o.id::text
) manifest_stats
  on true;

grant select
  on table public.operations_collection_request_v
  to authenticated;

grant all
  on table public.operations_collection_request_v
  to service_role;
