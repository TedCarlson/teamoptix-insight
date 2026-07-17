-- Operational contract: only a package linked to a positively incomplete stop is
-- open. An unlinked package is provisionally counted delivered while remaining
-- visible as a tracking gap for data-quality follow-up.
create or replace view public.operations_manifest_express_route_signal_v
with (security_invoker = true) as
select
  package.company_id,
  company.company_slug,
  package.service_date,
  package.route_key,
  count(*)::integer as package_count,
  count(*) filter (
    where stop.id is null
      or upper(coalesce(stop.completed, '')) = 'Y'
  )::integer as completed_package_count,
  count(*) filter (
    where stop.id is not null
      and upper(coalesce(stop.completed, '')) <> 'Y'
  )::integer as open_package_count,
  count(*) filter (where stop.id is null)::integer as tracking_gap_package_count
from core.operations_delivery_manifest_package package
join core.companies company on company.id = package.company_id
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
where package.is_express = true
group by
  package.company_id,
  company.company_slug,
  package.service_date,
  package.route_key;

grant select on table public.operations_manifest_express_route_signal_v
  to authenticated, service_role;
