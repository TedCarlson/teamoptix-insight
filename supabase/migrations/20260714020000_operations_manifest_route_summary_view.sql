create or replace view public.operations_manifest_route_summary_v
with (security_invoker = true) as
select
  r.company_id,
  c.company_slug,
  r.service_date,
  r.capture_plan_id,
  r.id as capture_plan_route_id,
  r.route_key,
  r.route_label,
  p.plan_status,
  r.route_status,

  coalesce(artifact_counts.artifact_count, 0) as artifact_count,
  coalesce(artifact_counts.delivery_artifact_count, 0) as delivery_artifact_count,
  coalesce(artifact_counts.pickup_artifact_count, 0) as pickup_artifact_count,
  artifact_counts.delivery_artifact_status,
  artifact_counts.pickup_artifact_status,
  artifact_counts.latest_captured_at,
  artifact_counts.latest_processed_at,

  coalesce(delivery_counts.delivery_stop_count, 0) as delivery_stop_count,
  coalesce(delivery_counts.completed_delivery_stop_count, 0) as completed_delivery_stop_count,
  coalesce(delivery_counts.incomplete_delivery_stop_count, 0) as incomplete_delivery_stop_count,

  coalesce(package_counts.delivery_package_count, 0) as delivery_package_count,
  coalesce(package_counts.express_package_count, 0) as express_package_count,
  coalesce(package_counts.residential_package_count, 0) as residential_package_count,
  coalesce(package_counts.signature_package_count, 0) as signature_package_count,
  coalesce(package_counts.hazmat_package_count, 0) as hazmat_package_count,
  coalesce(package_counts.collection_package_count, 0) as collection_package_count,

  coalesce(pickup_counts.pickup_stop_count, 0) as pickup_stop_count,
  coalesce(pickup_counts.pickup_expected_package_count, 0) as pickup_expected_package_count,
  coalesce(pickup_counts.pickup_actual_package_count, 0) as pickup_actual_package_count,
  pickup_counts.earliest_pickup_ready_time,
  pickup_counts.latest_pickup_close_time,

  case
    when r.route_status = 'COMPLETE'
      and coalesce(delivery_counts.delivery_stop_count, 0) > 0
      and coalesce(package_counts.delivery_package_count, 0) > 0
      then 'NORMALIZED'
    when artifact_counts.failed_artifact_count > 0
      then 'FAILED'
    when artifact_counts.captured_artifact_count > 0
      then 'CAPTURED'
    else 'PENDING'
  end as manifest_normalization_status
from core.operations_manifest_capture_plan_route r
join core.operations_manifest_capture_plan p
  on p.id = r.capture_plan_id
join core.companies c
  on c.id = r.company_id
left join lateral (
  select
    count(*)::integer as artifact_count,
    count(*) filter (where a.manifest_type = 'delivery')::integer as delivery_artifact_count,
    count(*) filter (where a.manifest_type = 'pickup')::integer as pickup_artifact_count,
    count(*) filter (where a.artifact_status = 'FAILED')::integer as failed_artifact_count,
    count(*) filter (where a.artifact_status = 'CAPTURED')::integer as captured_artifact_count,
    (array_agg(a.artifact_status order by a.updated_at desc)
      filter (where a.manifest_type = 'delivery'))[1] as delivery_artifact_status,
    (array_agg(a.artifact_status order by a.updated_at desc)
      filter (where a.manifest_type = 'pickup'))[1] as pickup_artifact_status,
    max(a.captured_at) as latest_captured_at,
    max(a.processed_at) as latest_processed_at
  from core.operations_manifest_artifact a
  where a.capture_plan_route_id = r.id
) artifact_counts on true
left join lateral (
  select
    count(*)::integer as delivery_stop_count,
    count(*) filter (where upper(coalesce(s.completed, '')) = 'Y')::integer
      as completed_delivery_stop_count,
    count(*) filter (where upper(coalesce(s.completed, '')) <> 'Y')::integer
      as incomplete_delivery_stop_count
  from core.operations_delivery_manifest_stop s
  where s.source_capture_plan_id = r.capture_plan_id
    and s.company_id = r.company_id
    and s.service_date = r.service_date
    and s.route_key = r.route_key
) delivery_counts on true
left join lateral (
  select
    count(*)::integer as delivery_package_count,
    count(*) filter (where pkg.is_express)::integer as express_package_count,
    count(*) filter (where pkg.is_residential)::integer as residential_package_count,
    count(*) filter (where pkg.is_signature)::integer as signature_package_count,
    count(*) filter (where pkg.is_hazmat)::integer as hazmat_package_count,
    count(*) filter (where pkg.is_collection)::integer as collection_package_count
  from core.operations_delivery_manifest_package pkg
  where pkg.source_capture_plan_id = r.capture_plan_id
    and pkg.company_id = r.company_id
    and pkg.service_date = r.service_date
    and pkg.route_key = r.route_key
) package_counts on true
left join lateral (
  select
    count(*)::integer as pickup_stop_count,
    coalesce(sum(pu.package_count_expected), 0)::integer as pickup_expected_package_count,
    coalesce(sum(pu.packages_picked_up), 0)::integer as pickup_actual_package_count,
    min(nullif(pu.ready_at, '')) as earliest_pickup_ready_time,
    max(nullif(pu.close_at, '')) as latest_pickup_close_time
  from core.operations_pickup_manifest_stop pu
  where pu.source_capture_plan_id = r.capture_plan_id
    and pu.company_id = r.company_id
    and pu.service_date = r.service_date
    and pu.route_key = r.route_key
) pickup_counts on true;

grant select on table public.operations_manifest_route_summary_v to authenticated;
grant select on table public.operations_manifest_route_summary_v to service_role;
