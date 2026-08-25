create or replace function public.get_operations_manifest_route_inventory(
  p_company_id uuid,
  p_service_date date
)
returns table (
  batch_id uuid,
  service_date date,
  inventory_source text,
  route_key text,
  route_label text,
  driver_name text,
  planned_delivery_stops integer,
  actual_delivery_stops integer,
  actual_delivery_packages integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, core
as $$
  with authoritative_batch as (
    select
      batch.id,
      batch.service_date,
      case
        when batch.report_shape_key = 'DSW_FINALIZED_DAY'
          then 'DSW_FINAL'
        else 'DSW_IN_DAY'
      end as inventory_source
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.service_date = p_service_date
      and batch.report_family_key = 'DSW'
      and batch.report_shape_key in (
        'DSW_FINALIZED_DAY',
        'DSW_DAILY_SERVICE_WORKSHEET'
      )
      and batch.status = 'LOADED'
    order by
      case
        when batch.report_shape_key = 'DSW_FINALIZED_DAY' then 0
        else 1
      end,
      batch.created_at desc,
      batch.id desc
    limit 1
  ),
  batch_rows as (
    select
      batch.id as batch_id,
      batch.service_date,
      batch.inventory_source,
      row.source_row_index,
      ltrim(
        regexp_replace(
          coalesce(
            nullif(row.normalized_row_json ->> 'wa_number', ''),
            nullif(row.source_wa_number, '')
          ),
          '[^0-9]',
          '',
          'g'
        ),
        '0'
      ) as route_key,
      row.source_route_key,
      row.source_driver_name,
      row.normalized_row_json
    from authoritative_batch batch
    join core.operations_report_raw_row row on row.batch_id = batch.id
  ),
  route_rows as (
    select distinct on (row.route_key)
      row.batch_id,
      row.service_date,
      row.inventory_source,
      row.route_key,
      coalesce(
        nullif(row.normalized_row_json ->> 'wa_name', ''),
        nullif(row.source_route_key, ''),
        'WA ' || row.route_key
      ) as route_label,
      case
        when coalesce(
          row.normalized_row_json ->> 'planned_delivery_stops',
          ''
        ) ~ '^-?[0-9]+$'
          then (row.normalized_row_json ->> 'planned_delivery_stops')::integer
        else null
      end as planned_delivery_stops,
      case
        when coalesce(
          row.normalized_row_json ->> 'actual_delivery_stops',
          ''
        ) ~ '^-?[0-9]+$'
          then (row.normalized_row_json ->> 'actual_delivery_stops')::integer
        else null
      end as actual_delivery_stops,
      case
        when coalesce(
          row.normalized_row_json ->> 'actual_delivery_packages',
          ''
        ) ~ '^-?[0-9]+$'
          then (row.normalized_row_json ->> 'actual_delivery_packages')::integer
        else null
      end as actual_delivery_packages
    from batch_rows row
    where row.route_key <> ''
      and (
        nullif(
          row.normalized_row_json ->> 'planned_delivery_stops',
          ''
        ) is not null
        or nullif(
          row.normalized_row_json ->> 'actual_delivery_stops',
          ''
        ) is not null
        or nullif(
          row.normalized_row_json ->> 'actual_delivery_packages',
          ''
        ) is not null
      )
    order by row.route_key, row.source_row_index
  )
  select
    route.batch_id,
    route.service_date,
    route.inventory_source,
    route.route_key,
    route.route_label,
    driver.driver_name,
    route.planned_delivery_stops,
    route.actual_delivery_stops,
    route.actual_delivery_packages
  from route_rows route
  left join lateral (
    select string_agg(distinct driver_name, ' · ' order by driver_name)
      as driver_name
    from (
      select coalesce(
        nullif(row.normalized_row_json ->> 'driver_name', ''),
        nullif(row.source_driver_name, '')
      ) as driver_name
      from batch_rows row
      where row.route_key = route.route_key
    ) names
    where driver_name is not null
  ) driver on true
  order by route.route_key;
$$;

revoke all on function public.get_operations_manifest_route_inventory(
  uuid,
  date
) from public, anon;
grant execute on function public.get_operations_manifest_route_inventory(
  uuid,
  date
) to authenticated, service_role;

comment on function public.get_operations_manifest_route_inventory(uuid, date)
is 'Returns the authoritative DSW-operated route inventory for manifest coverage reconciliation, preferring FINAL DSW over in-day DSW.';
