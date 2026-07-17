alter table ref.zip_code
  add column if not exists business_establishments integer,
  add column if not exists business_employment integer,
  add column if not exists business_annual_payroll_thousands bigint,
  add column if not exists business_employment_noise_flag text,
  add column if not exists business_payroll_noise_flag text,
  add column if not exists commercial_source text,
  add column if not exists commercial_vintage integer;

alter table ref.zip_code
  add column if not exists establishments_per_sqmi numeric(14, 2)
    generated always as (case when business_establishments is not null and zcta_land_area_sqmi > 0 then round(business_establishments::numeric / zcta_land_area_sqmi, 2) end) stored,
  add column if not exists employees_per_sqmi numeric(14, 2)
    generated always as (case when business_employment is not null and zcta_land_area_sqmi > 0 then round(business_employment::numeric / zcta_land_area_sqmi, 2) end) stored;

comment on column ref.zip_code.business_establishments is 'Census ZIP Code Business Patterns establishments with paid employees.';
comment on column ref.zip_code.establishments_per_sqmi is 'Business establishments divided by Census ZCTA land area where both geographies are available.';
comment on column ref.zip_code.employees_per_sqmi is 'ZIP Code Business Patterns employment divided by Census ZCTA land area where both geographies are available.';

drop function if exists public.get_opportunity_zip_analysis(text[], double precision, double precision);

create function public.get_opportunity_zip_analysis(
  p_zip_codes text[], p_terminal_latitude double precision, p_terminal_longitude double precision
)
returns table (
  zip_code text, preferred_city text, state_code text, classification text,
  population integer, land_area_sqmi numeric, population_density_per_sqmi numeric,
  business_establishments integer, business_employment integer,
  establishments_per_sqmi numeric, employees_per_sqmi numeric,
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
    z.latitude, z.longitude,
    round((extensions.st_distance(z.centroid, extensions.st_setsrid(extensions.st_point(p_terminal_longitude, p_terminal_latitude), 4326)::extensions.geography) / 1609.344)::numeric, 2),
    z.coordinate_source, z.coordinate_method, z.demographic_source,
    z.demographic_vintage, z.commercial_source, z.commercial_vintage
  from ref.zip_code z where z.zip_code = any(p_zip_codes) order by z.zip_code;
$$;

revoke all on function public.get_opportunity_zip_analysis(text[], double precision, double precision) from public;
grant execute on function public.get_opportunity_zip_analysis(text[], double precision, double precision) to authenticated, service_role;

