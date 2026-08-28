begin;

create extension if not exists postgis with schema extensions;

create table if not exists ref.internal_map_road_pack (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'US_CENSUS_TIGER_LINE',
  source_vintage integer not null,
  state_fips text not null,
  county_fips text not null,
  status text not null default 'IMPORTING',
  feature_count integer not null default 0,
  source_url text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint internal_map_road_pack_source_ck check (source_name = 'US_CENSUS_TIGER_LINE'),
  constraint internal_map_road_pack_vintage_ck check (source_vintage between 2020 and 2100),
  constraint internal_map_road_pack_state_ck check (state_fips ~ '^[0-9]{2}$'),
  constraint internal_map_road_pack_county_ck check (county_fips ~ '^[0-9]{3}$'),
  constraint internal_map_road_pack_status_ck check (status in ('IMPORTING', 'READY')),
  constraint internal_map_road_pack_feature_count_ck check (feature_count >= 0)
);

create table if not exists ref.internal_map_road_segment (
  id bigint generated always as identity primary key,
  pack_id uuid not null references ref.internal_map_road_pack(id) on delete cascade,
  linear_id text not null,
  full_name text,
  mtfcc text not null,
  geometry extensions.geometry(multilinestring, 4326) not null,
  created_at timestamptz not null default now(),
  constraint internal_map_road_segment_pack_linear_uidx unique (pack_id, linear_id),
  constraint internal_map_road_segment_mtfcc_ck check (mtfcc ~ '^S[0-9]{4}$')
);

create index if not exists internal_map_road_pack_coverage_idx
  on ref.internal_map_road_pack (state_fips, county_fips, status, source_vintage desc);
create index if not exists internal_map_road_segment_pack_idx
  on ref.internal_map_road_segment (pack_id, mtfcc);
create index if not exists internal_map_road_segment_geometry_gix
  on ref.internal_map_road_segment using gist (geometry);

alter table ref.internal_map_road_pack enable row level security;
alter table ref.internal_map_road_segment enable row level security;
revoke all on ref.internal_map_road_pack from public, anon, authenticated;
revoke all on ref.internal_map_road_segment from public, anon, authenticated;
grant all on ref.internal_map_road_pack to service_role;
grant all on ref.internal_map_road_segment to service_role;
grant usage, select on sequence ref.internal_map_road_segment_id_seq to service_role;

create or replace function public.begin_internal_map_road_pack(
  p_source_vintage integer,
  p_state_fips text,
  p_county_fips text,
  p_source_url text
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
     or p_state_fips !~ '^[0-9]{2}$'
     or p_county_fips !~ '^[0-9]{3}$' then
    raise exception 'A valid TIGER vintage, state FIPS, and county FIPS are required.' using errcode = '22023';
  end if;

  delete from ref.internal_map_road_pack
  where state_fips = p_state_fips
    and county_fips = p_county_fips
    and status = 'IMPORTING';

  insert into ref.internal_map_road_pack (source_vintage, state_fips, county_fips, source_url)
  values (p_source_vintage, p_state_fips, p_county_fips, p_source_url)
  returning id into v_pack_id;

  return v_pack_id;
end;
$$;

create or replace function public.append_internal_map_road_segments(
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
    select 1 from ref.internal_map_road_pack pack
    where pack.id = p_pack_id and pack.status = 'IMPORTING'
  ) then
    raise exception 'An importing road pack is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Road rows must be a JSON array.' using errcode = '22023';
  end if;

  insert into ref.internal_map_road_segment (pack_id, linear_id, full_name, mtfcc, geometry)
  select
    p_pack_id,
    nullif(trim(source.linear_id), ''),
    nullif(trim(source.full_name), ''),
    upper(trim(source.mtfcc)),
    extensions.st_multi(
      extensions.st_force2d(
        extensions.st_setsrid(
          extensions.st_geomfromgeojson(source.geometry::text),
          4326
        )
      )
    )::extensions.geometry(multilinestring, 4326)
  from jsonb_to_recordset(p_rows) as source(
    linear_id text,
    full_name text,
    mtfcc text,
    geometry jsonb
  )
  where nullif(trim(source.linear_id), '') is not null
    and upper(trim(source.mtfcc)) ~ '^S[0-9]{4}$'
    and jsonb_typeof(source.geometry) = 'object'
  on conflict (pack_id, linear_id) do update
  set full_name = excluded.full_name,
      mtfcc = excluded.mtfcc,
      geometry = excluded.geometry;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.complete_internal_map_road_pack(
  p_pack_id uuid,
  p_expected_feature_count integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pack ref.internal_map_road_pack%rowtype;
  v_count integer;
begin
  select pack.* into v_pack
  from ref.internal_map_road_pack pack
  where pack.id = p_pack_id and pack.status = 'IMPORTING'
  for update;

  if v_pack.id is null then
    raise exception 'An importing road pack is required.' using errcode = '22023';
  end if;

  select count(*)::integer into v_count
  from ref.internal_map_road_segment segment
  where segment.pack_id = p_pack_id;

  if v_count <> p_expected_feature_count then
    raise exception 'Road pack count mismatch: expected %, retained %.', p_expected_feature_count, v_count
      using errcode = '22023';
  end if;

  delete from ref.internal_map_road_pack pack
  where pack.state_fips = v_pack.state_fips
    and pack.county_fips = v_pack.county_fips
    and pack.id <> p_pack_id;

  update ref.internal_map_road_pack
  set status = 'READY', feature_count = v_count, completed_at = now()
  where id = p_pack_id;

  return v_count;
end;
$$;

create or replace function public.abort_internal_map_road_pack(p_pack_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from ref.internal_map_road_pack where id = p_pack_id and status = 'IMPORTING';
end;
$$;

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
      and segment.geometry && v_bounds_4326
      and (p_z >= 12 or segment.mtfcc in ('S1100', 'S1200', 'S1630', 'S1640'))
    limit 12000
  ) tile_row;

  return encode(coalesce(v_tile, ''::bytea), 'base64');
end;
$$;

create or replace function public.get_company_internal_road_tile(
  p_company_slug text,
  p_z integer,
  p_x integer,
  p_y integer
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select ref.get_company_internal_road_tile(p_company_slug, p_z, p_x, p_y)
$$;

comment on table ref.internal_map_road_pack is
  'TeamOptix-controlled public-road reference packs imported by broad operating territory; no customer route or stop data is included.';
comment on table ref.internal_map_road_segment is
  'Public Census TIGER/Line road geometry served only from TeamOptix infrastructure as a reusable internal basemap.';

revoke all on function public.begin_internal_map_road_pack(integer, text, text, text) from public, anon, authenticated;
revoke all on function public.append_internal_map_road_segments(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_internal_map_road_pack(uuid, integer) from public, anon, authenticated;
revoke all on function public.abort_internal_map_road_pack(uuid) from public, anon, authenticated;
revoke all on function ref.get_company_internal_road_tile(text, integer, integer, integer) from public, anon;
grant execute on function public.begin_internal_map_road_pack(integer, text, text, text) to service_role;
grant execute on function public.append_internal_map_road_segments(uuid, jsonb) to service_role;
grant execute on function public.complete_internal_map_road_pack(uuid, integer) to service_role;
grant execute on function public.abort_internal_map_road_pack(uuid) to service_role;

revoke all on function public.get_company_internal_road_tile(text, integer, integer, integer) from public, anon;
grant usage on schema ref to authenticated, service_role;
grant execute on function ref.get_company_internal_road_tile(text, integer, integer, integer) to authenticated, service_role;
grant execute on function public.get_company_internal_road_tile(text, integer, integer, integer) to authenticated, service_role;

commit;
