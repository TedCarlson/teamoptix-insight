begin;

-- One-time Beacon Point Ventures backfill for the mobile inspection selector.
-- DSW is evidence that the unit exists, but it is not dispatch-readiness,
-- ownership, VIN, odometer, or maintenance truth. New records therefore enter
-- INTAKE and can be enriched through the governed Fleet workspace.
with observed as (
  select
    batch.company_id,
    batch.service_date,
    raw.source_row_index,
    nullif(pg_catalog.btrim(raw.normalized_row_json ->> 'wa_name'), '') as route_name,
    pg_catalog.regexp_split_to_array(
      pg_catalog.btrim(raw.normalized_row_json ->> 'vehicle_text'),
      '\\s+'
    ) as tokens
  from core.operations_report_raw_row raw
  join core.operations_report_batch batch on batch.id = raw.batch_id
  join core.companies company on company.id = batch.company_id
  where company.company_slug = 'beacon-point-ventures'
    and company.company_status = 'active'
    and batch.report_family_key = 'DSW'
    and batch.status = 'LOADED'
    and batch.service_date >= current_date - 14
    and raw.row_kind = 'ROUTE'
    and nullif(pg_catalog.btrim(raw.normalized_row_json ->> 'vehicle_text'), '') is not null
), physical_observations as (
  select
    company_id,
    service_date,
    source_row_index,
    route_name,
    tokens[pg_catalog.array_length(tokens, 1)] as fedex_vehicle_id
  from observed
  where pg_catalog.array_length(tokens, 1) >= 2
    and tokens[pg_catalog.array_length(tokens, 1)] ~ '^[0-9]{5,6}$'
), latest_observation as (
  select distinct on (company_id, fedex_vehicle_id)
    company_id,
    fedex_vehicle_id,
    route_name,
    service_date
  from physical_observations
  order by company_id, fedex_vehicle_id, service_date desc, source_row_index desc
)
insert into fleet.vehicle (
  company_id,
  unit_number,
  fedex_vehicle_id,
  vehicle_type,
  status,
  primary_route,
  notes
)
select
  latest.company_id,
  latest.fedex_vehicle_id,
  latest.fedex_vehicle_id,
  'OTHER',
  'INTAKE',
  latest.route_name,
  'Established from recent DSW vehicle observation; complete Fleet intake to add VIN, registration, class, and readiness facts.'
from latest_observation latest
where not exists (
  select 1
  from fleet.vehicle vehicle
  where vehicle.company_id = latest.company_id
    and (
      vehicle.fedex_vehicle_id = latest.fedex_vehicle_id
      or vehicle.unit_number = latest.fedex_vehicle_id
    )
);

commit;
