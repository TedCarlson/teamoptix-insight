begin;

create or replace function ref.get_company_internal_road_tile(
  p_company_slug text,
  p_z integer,
  p_x integer,
  p_y integer
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_bounds_3857 extensions.geometry;
  v_bounds_4326 extensions.geometry;
  v_tile bytea;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = lower(trim(p_company_slug));

  if v_company_id is null then
    raise exception 'Company not found.' using errcode = '22023';
  end if;
  if not (core.is_platform_owner() or core.can_access_company(v_company_id)) then
    raise exception 'Company access is required.' using errcode = '42501';
  end if;
  if p_z not between 7 and 16
     or p_x < 0 or p_y < 0
     or p_x >= (1::bigint << p_z)
     or p_y >= (1::bigint << p_z) then
    raise exception 'Invalid map tile coordinates.' using errcode = '22023';
  end if;

  v_bounds_3857 := extensions.st_tileenvelope(p_z, p_x, p_y);
  v_bounds_4326 := extensions.st_transform(v_bounds_3857, 4326);

  select extensions.st_asmvt(tile_row, 'roads', 4096, 'geometry')
  into v_tile
  from (
    select
      segment.linear_id,
      segment.full_name,
      segment.mtfcc,
      extensions.st_asmvtgeom(
        extensions.st_transform(segment.geometry, 3857),
        v_bounds_3857,
        4096,
        64,
        true
      ) as geometry
    from ref.internal_map_road_segment segment
    join ref.internal_map_road_pack pack on pack.id = segment.pack_id
    where pack.status = 'READY'
      and segment.geometry operator(extensions.&&) v_bounds_4326
      and (p_z >= 12 or segment.mtfcc in ('S1100', 'S1200', 'S1630', 'S1640'))
    limit 12000
  ) tile_row;

  return encode(coalesce(v_tile, ''::bytea), 'base64');
end;
$$;

commit;
