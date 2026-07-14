create or replace view public.operations_manifest_route_health_v
with (security_invoker = true) as
with express_route as (
  select
    company_id,
    company_slug,
    service_date,
    route_key,
    capture_plan_id,
    count(*)::integer as express_package_count,
    count(distinct coalesce(st_number, '') || '|' || coalesce(sid, ''))::integer
      as express_stop_count,
    count(*) filter (where upper(coalesce(completed, '')) = 'Y')::integer
      as completed_express_package_count,
    count(*) filter (where upper(coalesce(completed, '')) <> 'Y')::integer
      as incomplete_express_package_count,
    count(*) filter (where is_residential)::integer
      as residential_express_package_count,
    count(*) filter (where is_signature)::integer
      as signature_express_package_count,
    count(*) filter (where is_hazmat)::integer
      as hazmat_express_package_count,
    count(*) filter (where is_collection)::integer
      as collection_express_package_count
  from public.operations_manifest_express_report_v
  group by
    company_id,
    company_slug,
    service_date,
    route_key,
    capture_plan_id
)
select
  summary.company_id,
  summary.company_slug,
  summary.service_date,
  summary.capture_plan_id,
  summary.capture_plan_route_id,
  summary.route_key,
  summary.route_label,

  summary.plan_status,
  summary.route_status,
  summary.manifest_normalization_status,

  summary.artifact_count,
  summary.delivery_artifact_count,
  summary.pickup_artifact_count,
  summary.delivery_artifact_status,
  summary.pickup_artifact_status,
  summary.latest_captured_at,
  summary.latest_processed_at,

  summary.delivery_stop_count,
  summary.completed_delivery_stop_count,
  summary.incomplete_delivery_stop_count,
  summary.delivery_package_count,

  coalesce(express_route.express_package_count, summary.express_package_count, 0)
    as express_package_count,
  coalesce(express_route.express_stop_count, 0) as express_stop_count,
  coalesce(express_route.completed_express_package_count, 0)
    as completed_express_package_count,
  coalesce(express_route.incomplete_express_package_count, 0)
    as incomplete_express_package_count,
  coalesce(express_route.residential_express_package_count, 0)
    as residential_express_package_count,
  coalesce(express_route.signature_express_package_count, 0)
    as signature_express_package_count,
  coalesce(express_route.hazmat_express_package_count, 0)
    as hazmat_express_package_count,
  coalesce(express_route.collection_express_package_count, 0)
    as collection_express_package_count,

  summary.residential_package_count,
  summary.signature_package_count,
  summary.hazmat_package_count,
  summary.collection_package_count,

  summary.pickup_stop_count,
  summary.pickup_expected_package_count,
  summary.pickup_actual_package_count,
  summary.earliest_pickup_ready_time,
  summary.latest_pickup_close_time,

  case
    when summary.manifest_normalization_status = 'FAILED'
      or summary.delivery_artifact_status = 'FAILED'
      or summary.pickup_artifact_status = 'FAILED'
      then 'FAILED'
    when summary.delivery_artifact_count = 0
      or summary.pickup_artifact_count = 0
      then 'MISSING_ARTIFACT'
    when summary.manifest_normalization_status <> 'NORMALIZED'
      then 'PROCESSING'
    when coalesce(express_route.incomplete_express_package_count, 0) > 0
      then 'EXPRESS_OPEN'
    when summary.incomplete_delivery_stop_count > 0
      then 'DELIVERY_OPEN'
    when summary.pickup_stop_count > 0
      and summary.pickup_actual_package_count < summary.pickup_expected_package_count
      then 'PICKUP_SHORT'
    else 'CLEAR'
  end as route_health_status,

  case
    when coalesce(express_route.incomplete_express_package_count, 0) > 0
      then 'HIGH'
    when summary.delivery_artifact_count = 0
      or summary.pickup_artifact_count = 0
      or summary.manifest_normalization_status <> 'NORMALIZED'
      then 'MEDIUM'
    when summary.incomplete_delivery_stop_count > 0
      or (
        summary.pickup_stop_count > 0
        and summary.pickup_actual_package_count < summary.pickup_expected_package_count
      )
      then 'MEDIUM'
    else 'LOW'
  end as route_health_severity,

  jsonb_build_object(
    'has_delivery_manifest', summary.delivery_artifact_count > 0,
    'has_pickup_manifest', summary.pickup_artifact_count > 0,
    'has_express_exposure', coalesce(express_route.express_package_count, summary.express_package_count, 0) > 0,
    'has_open_express', coalesce(express_route.incomplete_express_package_count, 0) > 0,
    'has_open_delivery', summary.incomplete_delivery_stop_count > 0,
    'has_pickup_shortfall',
      summary.pickup_stop_count > 0
      and summary.pickup_actual_package_count < summary.pickup_expected_package_count
  ) as route_health_flags
from public.operations_manifest_route_summary_v summary
left join express_route
  on express_route.company_id = summary.company_id
  and express_route.service_date = summary.service_date
  and express_route.route_key = summary.route_key
  and express_route.capture_plan_id = summary.capture_plan_id;

grant select on table public.operations_manifest_route_health_v to authenticated;
grant select on table public.operations_manifest_route_health_v to service_role;
