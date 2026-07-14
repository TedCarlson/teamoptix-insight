create or replace view public.operations_manifest_express_report_v
with (security_invoker = true) as
select
  pkg.company_id,
  c.company_slug,
  pkg.service_date,
  pkg.route_key,
  route.route_label,
  pkg.source_capture_plan_id as capture_plan_id,
  route.id as capture_plan_route_id,
  pkg.source_artifact_id,
  pkg.st_number,
  pkg.sid,
  pkg.tracking_id,
  pkg.prem_svc_raw,
  pkg.recipient,
  pkg.contact_name,
  pkg.address_line_1,
  pkg.address_line_2,
  pkg.city,
  pkg.state,
  pkg.postal_code,
  stop.completed,
  stop.delivery_time_begin,
  stop.delivery_time_end,
  stop.stop_instructions,
  pkg.is_residential,
  pkg.is_signature,
  pkg.is_hazmat,
  pkg.is_collection,
  artifact.artifact_status,
  artifact.captured_at,
  artifact.processed_at,
  pkg.created_at
from core.operations_delivery_manifest_package pkg
join core.companies c
  on c.id = pkg.company_id
left join core.operations_manifest_capture_plan_route route
  on route.capture_plan_id = pkg.source_capture_plan_id
  and route.company_id = pkg.company_id
  and route.service_date = pkg.service_date
  and route.route_key = pkg.route_key
left join core.operations_manifest_artifact artifact
  on artifact.id = pkg.source_artifact_id
left join core.operations_delivery_manifest_stop stop
  on stop.source_capture_plan_id = pkg.source_capture_plan_id
  and stop.company_id = pkg.company_id
  and stop.service_date = pkg.service_date
  and stop.route_key = pkg.route_key
  and coalesce(stop.st_number, '') = coalesce(pkg.st_number, '')
  and coalesce(stop.sid, '') = coalesce(pkg.sid, '')
where pkg.is_express = true;

grant select on table public.operations_manifest_express_report_v to authenticated;
grant select on table public.operations_manifest_express_report_v to service_role;
