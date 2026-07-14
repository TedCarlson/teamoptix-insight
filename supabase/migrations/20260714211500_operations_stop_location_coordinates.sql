create table if not exists core.operations_stop_location_coordinate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  sid text,
  address_key text not null,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  geocode_status text not null default 'PENDING',
  geocode_precision text,
  geocode_source text,
  geocoded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_stop_location_coordinate_status_ck
    check (geocode_status in ('PENDING', 'GEOCODED', 'LOW_CONFIDENCE', 'FAILED', 'SCRUBBED')),
  constraint operations_stop_location_coordinate_lat_ck
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint operations_stop_location_coordinate_lng_ck
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint operations_stop_location_coordinate_unique
    unique (company_id, sid, address_key)
);

create index if not exists operations_stop_location_coordinate_company_idx
  on core.operations_stop_location_coordinate (company_id);

create index if not exists operations_stop_location_coordinate_postal_idx
  on core.operations_stop_location_coordinate (company_id, postal_code);

create index if not exists operations_stop_location_coordinate_status_idx
  on core.operations_stop_location_coordinate (company_id, geocode_status);

create or replace function core.operations_manifest_address_key(
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state text,
  p_postal_code text
)
returns text
language sql
immutable
as $$
  select concat_ws(
    '|',
    nullif(upper(regexp_replace(trim(coalesce(p_address_line_1, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(trim(coalesce(p_address_line_2, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(trim(coalesce(p_city, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(trim(coalesce(p_state, '')), '\s+', ' ', 'g')), ''),
    nullif(upper(regexp_replace(trim(coalesce(p_postal_code, '')), '\s+', ' ', 'g')), '')
  );
$$;

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
  pkg.created_at,
  loc.latitude,
  loc.longitude,
  loc.geocode_status,
  loc.geocode_precision
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
left join core.operations_stop_location_coordinate loc
  on loc.company_id = pkg.company_id
  and coalesce(loc.sid, '') = coalesce(pkg.sid, '')
  and loc.address_key = core.operations_manifest_address_key(
    pkg.address_line_1,
    pkg.address_line_2,
    pkg.city,
    pkg.state,
    pkg.postal_code
  )
where pkg.is_express = true;

grant select on table public.operations_manifest_express_report_v to authenticated;
grant select on table public.operations_manifest_express_report_v to service_role;

alter table core.operations_stop_location_coordinate enable row level security;

drop policy if exists operations_stop_location_coordinate_select_access
  on core.operations_stop_location_coordinate;

create policy operations_stop_location_coordinate_select_access
  on core.operations_stop_location_coordinate
  for select
  to authenticated
  using (core.can_read_company_data(company_id));

grant select, insert, update, delete on table core.operations_stop_location_coordinate to service_role;
grant select on table core.operations_stop_location_coordinate to authenticated;

grant execute on function core.can_read_company_data(uuid) to authenticated;
