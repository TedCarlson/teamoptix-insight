begin;

alter function ref.get_company_internal_road_tile(text, integer, integer, integer)
  rename to get_company_internal_map_tile;

alter function public.get_company_internal_road_tile(text, integer, integer, integer)
  rename to get_company_internal_map_tile;

comment on function ref.get_company_internal_map_tile(text, integer, integer, integer) is
  'Authorizes a TeamOptix company map read and returns the shared internal vector-tile payload for enabled reference layers.';

commit;
