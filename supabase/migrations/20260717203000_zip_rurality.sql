alter table ref.zip_code
  add column if not exists ruca_primary_code integer,
  add column if not exists ruca_secondary_code numeric(4, 1),
  add column if not exists ruca_category text,
  add column if not exists rurality_factor numeric(3, 2),
  add column if not exists rurality_source text,
  add column if not exists rurality_vintage integer;

alter table ref.zip_code
  add constraint zip_code_ruca_primary_ck check (ruca_primary_code is null or ruca_primary_code between 1 and 10),
  add constraint zip_code_ruca_category_ck check (ruca_category is null or ruca_category in ('METROPOLITAN', 'MICROPOLITAN', 'SMALL_TOWN', 'RURAL')),
  add constraint zip_code_rurality_factor_ck check (rurality_factor is null or rurality_factor between 0 and 1);

comment on column ref.zip_code.rurality_factor is 'TeamOptix operating continuum derived from USDA RUCA primary code: metro 0.00, micropolitan 0.33, small town 0.67, rural 1.00.';

drop function if exists public.get_opportunity_zip_analysis(text[], double precision, double precision);

create function public.get_opportunity_zip_analysis(
  p_zip_codes text[], p_terminal_latitude double precision, p_terminal_longitude double precision
)
returns table (
  zip_code text, preferred_city text, state_code text, classification text,
  population integer, land_area_sqmi numeric, population_density_per_sqmi numeric,
  business_establishments integer, business_employment integer,
  establishments_per_sqmi numeric, employees_per_sqmi numeric,
  ruca_primary_code integer, ruca_secondary_code numeric, ruca_category text,
  rurality_factor numeric, rurality_source text, rurality_vintage integer,
  latitude double precision, longitude double precision, terminal_distance_miles numeric,
  coordinate_source text, coordinate_method text, demographic_source text,
  demographic_vintage integer, commercial_source text, commercial_vintage integer
)
language sql stable security definer set search_path = public, ref, extensions
as $$
  select z.zip_code, z.preferred_city, z.state_code, z.classification,
    z.zcta_population, z.zcta_land_area_sqmi, z.population_density_per_sqmi,
    z.business_establishments, z.business_employment,
    z.establishments_per_sqmi, z.employees_per_sqmi,
    z.ruca_primary_code, z.ruca_secondary_code, z.ruca_category,
    z.rurality_factor, z.rurality_source, z.rurality_vintage,
    z.latitude, z.longitude,
    round((extensions.st_distance(z.centroid, extensions.st_setsrid(extensions.st_point(p_terminal_longitude, p_terminal_latitude), 4326)::extensions.geography) / 1609.344)::numeric, 2),
    z.coordinate_source, z.coordinate_method, z.demographic_source,
    z.demographic_vintage, z.commercial_source, z.commercial_vintage
  from ref.zip_code z where z.zip_code = any(p_zip_codes) order by z.zip_code;
$$;

revoke all on function public.get_opportunity_zip_analysis(text[], double precision, double precision) from public;
grant execute on function public.get_opportunity_zip_analysis(text[], double precision, double precision) to authenticated, service_role;
