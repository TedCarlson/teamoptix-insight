begin;

-- Contract-scoped manifest geography. The function returns one row per ZIP,
-- enriched from the same reference table used by Opportunity Analysis. Full
-- recipient addresses never leave the warehouse.
create or replace function public.get_company_territory_zip_source(
  p_company_slug text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public, ref
as $$
declare
  v_company_id uuid;
  v_terminal public.company_terminal%rowtype;
  v_terminal_address text;
  v_result jsonb;
begin
  select company.id
  into v_company_id
  from core.companies company
  where company.company_slug = lower(btrim(p_company_slug));

  if v_company_id is null then
    raise exception 'Company not found.';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or (p_end_date - p_start_date) > 365
  then
    raise exception 'A valid territory date range of no more than 366 days is required.'
      using errcode = '22023';
  end if;

  if not core.can_read_company_data(v_company_id) then
    raise exception 'You do not have access to this company.'
      using errcode = '42501';
  end if;

  select terminal.*
  into v_terminal
  from public.company_terminal terminal
  where terminal.company_id = v_company_id
    and terminal.is_active = true
  order by terminal.created_at
  limit 1;

  v_terminal_address := nullif(concat_ws(', ',
    nullif(concat_ws(' ', v_terminal.address_line_1, v_terminal.address_line_2), ''),
    nullif(concat_ws(' ', v_terminal.city, v_terminal.state_region, v_terminal.postal_code), '')
  ), '');

  with source_rows as (
    select
      stop.service_date,
      stop.route_key,
      stop.postal_code,
      1::bigint as delivery_stops,
      0::bigint as delivery_packages,
      0::bigint as pickup_stops,
      0::bigint as pickup_packages_expected,
      0::bigint as pickup_packages_actual
    from core.operations_delivery_manifest_stop stop
    where stop.company_id = v_company_id
      and stop.service_date between p_start_date and p_end_date

    union all

    select
      package.service_date,
      package.route_key,
      package.postal_code,
      0::bigint,
      1::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    from core.operations_delivery_manifest_package package
    where package.company_id = v_company_id
      and package.service_date between p_start_date and p_end_date

    union all

    select
      pickup.service_date,
      pickup.route_key,
      pickup.postal_code,
      0::bigint,
      0::bigint,
      1::bigint,
      greatest(coalesce(pickup.package_count_expected, 0), 0)::bigint,
      greatest(coalesce(pickup.packages_picked_up, 0), 0)::bigint
    from core.operations_pickup_manifest_stop pickup
    where pickup.company_id = v_company_id
      and pickup.service_date between p_start_date and p_end_date
  ), normalized as (
    select
      source.*,
      case
        when regexp_replace(coalesce(source.postal_code, ''), '[^0-9]', '', 'g') ~ '^[0-9]{5,}$'
        then left(regexp_replace(source.postal_code, '[^0-9]', '', 'g'), 5)
        else null
      end as zip_code
    from source_rows source
  ), zip_aggregate as (
    select
      row.zip_code,
      min(row.service_date) as first_seen,
      max(row.service_date) as last_seen,
      count(distinct row.service_date)::integer as operating_days,
      count(distinct row.route_key)::integer as routes_observed,
      sum(row.delivery_stops)::bigint as delivery_stops,
      sum(row.delivery_packages)::bigint as delivery_packages,
      sum(row.pickup_stops)::bigint as pickup_stops,
      sum(row.pickup_packages_expected)::bigint as pickup_packages_expected,
      sum(row.pickup_packages_actual)::bigint as pickup_packages_actual
    from normalized row
    where row.zip_code is not null
    group by row.zip_code
  )
  select jsonb_build_object(
    'terminal', jsonb_build_object(
      'terminal_id', v_terminal.terminal_id,
      'terminal_code', v_terminal.terminal_code,
      'terminal_name', v_terminal.terminal_name,
      'submitted_address', v_terminal_address
    ),
    'coverage', jsonb_build_object(
      'requested_start', p_start_date,
      'requested_end', p_end_date,
      'manifest_start', (select min(row.service_date) from normalized row),
      'manifest_end', (select max(row.service_date) from normalized row),
      'manifest_days', (select count(distinct row.service_date) from normalized row),
      'source_records', (select count(*) from normalized),
      'records_with_zip', (select count(*) from normalized row where row.zip_code is not null),
      'records_without_zip', (select count(*) from normalized row where row.zip_code is null),
      'delivery_stops', (select coalesce(sum(row.delivery_stops), 0) from normalized row),
      'delivery_packages', (select coalesce(sum(row.delivery_packages), 0) from normalized row),
      'pickup_stops', (select coalesce(sum(row.pickup_stops), 0) from normalized row),
      'pickup_packages_expected', (select coalesce(sum(row.pickup_packages_expected), 0) from normalized row),
      'pickup_packages_actual', (select coalesce(sum(row.pickup_packages_actual), 0) from normalized row)
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zip_code', aggregate.zip_code,
        'first_seen', aggregate.first_seen,
        'last_seen', aggregate.last_seen,
        'operating_days', aggregate.operating_days,
        'routes_observed', aggregate.routes_observed,
        'delivery_stops', aggregate.delivery_stops,
        'delivery_packages', aggregate.delivery_packages,
        'pickup_stops', aggregate.pickup_stops,
        'pickup_packages_expected', aggregate.pickup_packages_expected,
        'pickup_packages_actual', aggregate.pickup_packages_actual,
        'reference_matched', reference.zip_code is not null,
        'preferred_city', reference.preferred_city,
        'state_code', reference.state_code,
        'classification', reference.classification,
        'population', reference.zcta_population,
        'land_area_sqmi', reference.zcta_land_area_sqmi,
        'population_density_per_sqmi', reference.population_density_per_sqmi,
        'business_establishments', reference.business_establishments,
        'business_employment', reference.business_employment,
        'establishments_per_sqmi', reference.establishments_per_sqmi,
        'employees_per_sqmi', reference.employees_per_sqmi,
        'ruca_primary_code', reference.ruca_primary_code,
        'ruca_secondary_code', reference.ruca_secondary_code,
        'ruca_category', reference.ruca_category,
        'rurality_factor', reference.rurality_factor,
        'latitude', reference.latitude,
        'longitude', reference.longitude,
        'coordinate_source', reference.coordinate_source,
        'coordinate_method', reference.coordinate_method,
        'demographic_source', reference.demographic_source,
        'demographic_vintage', reference.demographic_vintage,
        'commercial_source', reference.commercial_source,
        'commercial_vintage', reference.commercial_vintage,
        'rurality_source', reference.rurality_source,
        'rurality_vintage', reference.rurality_vintage
      ) order by aggregate.delivery_stops desc, aggregate.delivery_packages desc, aggregate.zip_code)
      from zip_aggregate aggregate
      left join ref.zip_code reference
        on reference.zip_code = aggregate.zip_code
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_company_territory_zip_source(
  text,
  date,
  date
) from public;

grant execute on function public.get_company_territory_zip_source(
  text,
  date,
  date
) to authenticated, service_role;

commit;
