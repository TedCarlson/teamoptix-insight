insert into core.operations_stop_location_coordinate (
  company_id,
  sid,
  address_key,
  address_line_1,
  address_line_2,
  city,
  state,
  postal_code,
  geocode_status
)
select distinct
  company_id,
  sid,
  core.operations_manifest_address_key(
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code
  ) as address_key,
  address_line_1,
  address_line_2,
  city,
  state,
  postal_code,
  'PENDING'
from public.operations_manifest_express_report_v
where company_slug = 'beacon-point-ventures'
  and address_line_1 is not null
  and city is not null
  and state is not null
on conflict (company_id, sid, address_key) do nothing;
