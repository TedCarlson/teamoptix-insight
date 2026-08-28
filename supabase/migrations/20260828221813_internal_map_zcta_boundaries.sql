begin;

create table if not exists ref.internal_map_zcta_pack (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'US_CENSUS_CARTOGRAPHIC_ZCTA',
  source_vintage integer not null,
  source_scale text not null,
  source_url text not null,
  requested_codes text[] not null,
  status text not null default 'IMPORTING',
  feature_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint internal_map_zcta_pack_source_ck check (source_name = 'US_CENSUS_CARTOGRAPHIC_ZCTA'),
  constraint internal_map_zcta_pack_vintage_ck check (source_vintage between 2020 and 2100),
  constraint internal_map_zcta_pack_scale_ck check (source_scale in ('500k', '5m', '20m')),
  constraint internal_map_zcta_pack_status_ck check (status in ('IMPORTING', 'READY')),
  constraint internal_map_zcta_pack_feature_count_ck check (feature_count >= 0),
  constraint internal_map_zcta_pack_requested_ck check (cardinality(requested_codes) > 0)
);

create table if not exists ref.internal_map_zcta_boundary (
  id bigint generated always as identity primary key,
  pack_id uuid not null references ref.internal_map_zcta_pack(id) on delete cascade,
  zcta_code text not null,
  geometry extensions.geometry(multipolygon, 4326) not null,
  created_at timestamptz not null default now(),
  constraint internal_map_zcta_boundary_code_ck check (zcta_code ~ '^[0-9]{5}$'),
  constraint internal_map_zcta_boundary_pack_code_uidx unique (pack_id, zcta_code)
);

create index if not exists internal_map_zcta_pack_status_idx
  on ref.internal_map_zcta_pack (status, completed_at desc);
create index if not exists internal_map_zcta_boundary_geometry_gix
  on ref.internal_map_zcta_boundary using gist (geometry);

alter table ref.internal_map_zcta_pack enable row level security;
alter table ref.internal_map_zcta_boundary enable row level security;
revoke all on ref.internal_map_zcta_pack from public, anon, authenticated;
revoke all on ref.internal_map_zcta_boundary from public, anon, authenticated;
grant all on ref.internal_map_zcta_pack to service_role;
grant all on ref.internal_map_zcta_boundary to service_role;
grant usage, select on sequence ref.internal_map_zcta_boundary_id_seq to service_role;

create or replace function public.begin_internal_map_zcta_pack(
  p_source_vintage integer,
  p_source_scale text,
  p_source_url text,
  p_requested_codes text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pack_id uuid;
begin
  if p_source_vintage not between 2020 and 2100
     or p_source_scale not in ('500k', '5m', '20m')
     or nullif(trim(p_source_url), '') is null
     or cardinality(p_requested_codes) = 0
     or exists (select 1 from unnest(p_requested_codes) code where code !~ '^[0-9]{5}$') then
    raise exception 'A valid Census ZCTA source and requested code set are required.' using errcode = '22023';
  end if;

  insert into ref.internal_map_zcta_pack (
    source_vintage,
    source_scale,
    source_url,
    requested_codes
  ) values (
    p_source_vintage,
    p_source_scale,
    trim(p_source_url),
    p_requested_codes
  ) returning id into v_pack_id;

  return v_pack_id;
end;
$$;

create or replace function public.append_internal_map_zcta_boundaries(
  p_pack_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from ref.internal_map_zcta_pack pack
    where pack.id = p_pack_id and pack.status = 'IMPORTING'
  ) then
    raise exception 'An importing ZCTA pack is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ZCTA rows must be a JSON array.' using errcode = '22023';
  end if;

  insert into ref.internal_map_zcta_boundary (pack_id, zcta_code, geometry)
  select
    p_pack_id,
    trim(source.zcta_code),
    extensions.st_multi(
      extensions.st_collectionextract(
        extensions.st_makevalid(
          extensions.st_force2d(
            extensions.st_setsrid(
              extensions.st_geomfromgeojson(source.geometry::text),
              4326
            )
          )
        ),
        3
      )
    )::extensions.geometry(multipolygon, 4326)
  from jsonb_to_recordset(p_rows) as source(zcta_code text, geometry jsonb)
  where trim(source.zcta_code) ~ '^[0-9]{5}$'
    and jsonb_typeof(source.geometry) = 'object'
  on conflict (pack_id, zcta_code) do update
  set geometry = excluded.geometry;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.complete_internal_map_zcta_pack(
  p_pack_id uuid,
  p_expected_feature_count integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pack ref.internal_map_zcta_pack%rowtype;
  v_count integer;
begin
  select pack.* into v_pack
  from ref.internal_map_zcta_pack pack
  where pack.id = p_pack_id
  for update;

  if v_pack.id is null then
    raise exception 'A known ZCTA pack is required.' using errcode = '22023';
  end if;
  if v_pack.status = 'READY' then
    if v_pack.feature_count <> p_expected_feature_count then
      raise exception 'Completed ZCTA pack count mismatch.' using errcode = '22023';
    end if;
    return v_pack.feature_count;
  end if;

  select count(*)::integer into v_count
  from ref.internal_map_zcta_boundary boundary
  where boundary.pack_id = p_pack_id;

  if v_count <> p_expected_feature_count then
    raise exception 'ZCTA pack count mismatch: expected %, retained %.', p_expected_feature_count, v_count
      using errcode = '22023';
  end if;

  update ref.internal_map_zcta_pack
  set status = 'READY', feature_count = v_count, completed_at = now()
  where id = p_pack_id;

  return v_count;
end;
$$;

create or replace function public.abort_internal_map_zcta_pack(p_pack_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from ref.internal_map_zcta_pack where id = p_pack_id and status = 'IMPORTING';
end;
$$;

create or replace function ref.get_company_internal_map_tile(
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
  v_road_tile bytea;
  v_zcta_tile bytea;
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
  into v_road_tile
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

  select extensions.st_asmvt(tile_row, 'zcta_boundaries', 4096, 'geometry')
  into v_zcta_tile
  from (
    select
      latest.zcta_code,
      extensions.st_asmvtgeom(
        extensions.st_transform(latest.geometry, 3857),
        v_bounds_3857,
        4096,
        64,
        true
      ) as geometry
    from (
      select distinct on (boundary.zcta_code)
        boundary.zcta_code,
        boundary.geometry
      from ref.internal_map_zcta_boundary boundary
      join ref.internal_map_zcta_pack pack on pack.id = boundary.pack_id
      where pack.status = 'READY'
        and boundary.geometry operator(extensions.&&) v_bounds_4326
      order by boundary.zcta_code, pack.completed_at desc, pack.started_at desc
    ) latest
    limit 4000
  ) tile_row;

  return encode(coalesce(v_road_tile, ''::bytea) || coalesce(v_zcta_tile, ''::bytea), 'base64');
end;
$$;

comment on table ref.internal_map_zcta_pack is
  'Atomic import batches for public Census ZCTA cartographic boundary reference data.';
comment on table ref.internal_map_zcta_boundary is
  'Public Census ZCTA polygon geometry available to the shared TeamOptix internal map contract.';

revoke all on function public.begin_internal_map_zcta_pack(integer, text, text, text[]) from public, anon, authenticated;
revoke all on function public.append_internal_map_zcta_boundaries(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_internal_map_zcta_pack(uuid, integer) from public, anon, authenticated;
revoke all on function public.abort_internal_map_zcta_pack(uuid) from public, anon, authenticated;
grant execute on function public.begin_internal_map_zcta_pack(integer, text, text, text[]) to service_role;
grant execute on function public.append_internal_map_zcta_boundaries(uuid, jsonb) to service_role;
grant execute on function public.complete_internal_map_zcta_pack(uuid, integer) to service_role;
grant execute on function public.abort_internal_map_zcta_pack(uuid) to service_role;

commit;
