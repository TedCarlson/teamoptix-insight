create or replace view public.operations_delivery_manifest_stop_v
with (security_invoker = true) as
select
  stop.company_id,
  company.company_slug,
  stop.service_date,
  stop.route_key,
  stop.st_number,
  stop.sid,
  stop.recipient,
  stop.contact_name,
  stop.phone,
  stop.address_line_1,
  stop.address_line_2,
  stop.city,
  stop.state,
  stop.postal_code,
  stop.delivery_time_begin,
  stop.delivery_time_end,
  stop.package_count,
  stop.stop_instructions,
  stop.completed,
  stop.source_artifact_id,
  stop.created_at
from core.operations_delivery_manifest_stop stop
join core.companies company on company.id = stop.company_id;

create or replace view public.operations_delivery_manifest_package_v
with (security_invoker = true) as
select
  package.company_id,
  company.company_slug,
  package.service_date,
  package.route_key,
  package.st_number,
  package.sid,
  package.recipient,
  package.contact_name,
  package.address_line_1,
  package.address_line_2,
  package.city,
  package.state,
  package.postal_code,
  package.tracking_id,
  package.prem_svc_raw,
  package.is_express,
  package.is_residential,
  package.is_signature,
  package.is_hazmat,
  package.is_collection,
  package.source_artifact_id,
  package.created_at
from core.operations_delivery_manifest_package package
join core.companies company on company.id = package.company_id;

create or replace view public.operations_pickup_manifest_stop_v
with (security_invoker = true) as
select
  pickup.company_id,
  company.company_slug,
  pickup.service_date,
  pickup.route_key,
  pickup.pickup_list,
  pickup.station,
  pickup.wa,
  pickup.puid,
  pickup.pickup_type,
  pickup.shipper_number,
  pickup.shipper_name,
  pickup.address_line_1,
  pickup.address_line_2,
  pickup.city,
  pickup.state,
  pickup.postal_code,
  pickup.ready_at,
  pickup.close_at,
  pickup.pu_closed_at,
  pickup.reason_code,
  pickup.package_count_expected,
  pickup.packages_picked_up,
  pickup.source_artifact_id,
  pickup.created_at
from core.operations_pickup_manifest_stop pickup
join core.companies company on company.id = pickup.company_id;

grant select on table public.operations_delivery_manifest_stop_v to authenticated, service_role;
grant select on table public.operations_delivery_manifest_package_v to authenticated, service_role;
grant select on table public.operations_pickup_manifest_stop_v to authenticated, service_role;
