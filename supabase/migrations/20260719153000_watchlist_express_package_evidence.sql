-- Package-level evidence for operational watchlist investigations.
-- OPEN is reserved for an Express package linked to a manifest stop whose
-- completion flag is not Y. An absent stop link remains a separate data-quality
-- condition and is provisionally treated as delivered by the route rollup.
create or replace view public.operations_manifest_express_package_signal_v
with (security_invoker = true) as
select
  package.company_id,
  company.company_slug,
  package.service_date,
  package.route_key,
  artifact.route_label,
  package.tracking_id,
  package.st_number,
  package.sid,
  case
    when stop.id is null then 'TRACKING_GAP'
    when upper(coalesce(stop.completed, '')) = 'Y' then 'COMPLETED'
    else 'OPEN'
  end as signal_state
from core.operations_delivery_manifest_package package
join core.companies company on company.id = package.company_id
join core.operations_manifest_artifact artifact on artifact.id = package.source_artifact_id
left join core.operations_delivery_manifest_stop stop
  on stop.company_id = package.company_id
  and stop.service_date = package.service_date
  and stop.route_key = package.route_key
  and stop.stop_identity_key = core.operations_delivery_stop_identity(
    package.st_number,
    package.sid,
    package.recipient,
    package.contact_name,
    package.address_line_1,
    package.address_line_2,
    package.city,
    package.state,
    package.postal_code,
    null,
    null
  )
where package.is_express = true;

grant select on table public.operations_manifest_express_package_signal_v
  to authenticated, service_role;
