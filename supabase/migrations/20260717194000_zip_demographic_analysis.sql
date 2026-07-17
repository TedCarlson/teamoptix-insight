alter table ref.zip_code
  add column if not exists zcta_population integer,
  add column if not exists zcta_land_area_sqmi numeric(14, 3),
  add column if not exists demographic_source text,
  add column if not exists demographic_vintage integer;

alter table ref.zip_code
  add column if not exists population_density_per_sqmi numeric(14, 2)
  generated always as (
    case
      when zcta_population is not null and zcta_land_area_sqmi > 0
        then round(zcta_population::numeric / zcta_land_area_sqmi, 2)
      else null
    end
  ) stored;

comment on column ref.zip_code.zcta_population is 'ACS five-year total population estimate for the matching Census ZCTA; null for ZIPs without a ZCTA.';
comment on column ref.zip_code.zcta_land_area_sqmi is 'Census Gazetteer ZCTA land area in square miles; null for ZIPs without a ZCTA.';
comment on column ref.zip_code.population_density_per_sqmi is 'ZCTA population divided by ZCTA land area; not calculated for special-purpose ZIPs without a ZCTA.';

create or replace function public.get_opportunity_zip_analysis(
  p_zip_codes text[],
  p_terminal_latitude double precision,
  p_terminal_longitude double precision
)
returns table (
  zip_code text,
  preferred_city text,
  state_code text,
  classification text,
  population integer,
  land_area_sqmi numeric,
  population_density_per_sqmi numeric,
  latitude double precision,
  longitude double precision,
  terminal_distance_miles numeric,
  coordinate_source text,
  coordinate_method text,
  demographic_source text,
  demographic_vintage integer
)
language sql
stable
security definer
set search_path = public, ref, extensions
as $$
  select
    z.zip_code,
    z.preferred_city,
    z.state_code,
    z.classification,
    z.zcta_population,
    z.zcta_land_area_sqmi,
    z.population_density_per_sqmi,
    z.latitude,
    z.longitude,
    round((extensions.st_distance(
      z.centroid,
      extensions.st_setsrid(extensions.st_point(p_terminal_longitude, p_terminal_latitude), 4326)::extensions.geography
    ) / 1609.344)::numeric, 2),
    z.coordinate_source,
    z.coordinate_method,
    z.demographic_source,
    z.demographic_vintage
  from ref.zip_code z
  where z.zip_code = any(p_zip_codes)
  order by z.zip_code;
$$;

revoke all on function public.get_opportunity_zip_analysis(text[], double precision, double precision) from public;
grant execute on function public.get_opportunity_zip_analysis(text[], double precision, double precision) to authenticated, service_role;

