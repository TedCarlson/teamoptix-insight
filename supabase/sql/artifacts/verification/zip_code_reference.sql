-- Expected after 20260717183100_zip_code_reference_data.sql:
-- canonical_zip_count = 41,543
-- hud_coordinate_count = 29,544
-- vendor_fallback_count = 11,999
-- alias_count = 41,697

select
  count(*) as canonical_zip_count,
  count(*) filter (where coordinate_source = 'HUD') as hud_coordinate_count,
  count(*) filter (where coordinate_source = 'ZIP_CODES_COM') as vendor_fallback_count,
  count(*) filter (where hud_source_present) as hud_coverage_count,
  count(*) filter (where not vendor_source_present) as missing_vendor_count
from ref.zip_code;

select
  count(*) as alias_count,
  count(*) filter (where is_preferred) as preferred_alias_count,
  count(distinct zip_code) as zip_codes_with_aliases
from ref.zip_city_alias;

select zip_code, count(*) as preferred_count
from ref.zip_city_alias
where is_preferred
group by zip_code
having count(*) <> 1;

select zip_code, preferred_city, state_code, latitude, longitude, coordinate_source
from ref.zip_code
where zip_code in ('00501', '08088', '90210')
order by zip_code;
