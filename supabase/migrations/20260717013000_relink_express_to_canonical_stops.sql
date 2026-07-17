create or replace view public.operations_manifest_express_report_v
with (security_invoker = true) as
select
  pkg.company_id,
  company.company_slug,
  pkg.service_date,
  pkg.route_key,
  artifact.route_label,
  pkg.source_capture_plan_id as capture_plan_id,
  artifact.capture_plan_route_id,
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
  pkg.created_at,
  location.latitude,
  location.longitude,
  location.geocode_status,
  location.geocode_precision
from core.operations_delivery_manifest_package pkg
join core.companies company on company.id = pkg.company_id
join core.operations_manifest_artifact artifact on artifact.id = pkg.source_artifact_id
left join core.operations_delivery_manifest_stop stop
  on stop.company_id = pkg.company_id
  and stop.service_date = pkg.service_date
  and stop.route_key = pkg.route_key
  and stop.stop_identity_key = core.operations_delivery_stop_identity(
    pkg.st_number,
    pkg.sid,
    pkg.recipient,
    pkg.contact_name,
    pkg.address_line_1,
    pkg.address_line_2,
    pkg.city,
    pkg.state,
    pkg.postal_code,
    null,
    null
  )
left join core.operations_stop_location_coordinate location
  on location.company_id = pkg.company_id
  and coalesce(location.sid, '') = coalesce(pkg.sid, '')
  and location.address_key = core.operations_manifest_address_key(
    pkg.address_line_1,
    pkg.address_line_2,
    pkg.city,
    pkg.state,
    pkg.postal_code
  )
where pkg.is_express = true;

grant select on table public.operations_manifest_express_report_v
  to authenticated, service_role;
