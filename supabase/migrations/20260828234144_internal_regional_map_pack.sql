begin;

create table if not exists ref.internal_map_reference_pack (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null unique,
  coverage_key text not null,
  source_name text not null default 'PROTOMAPS_OSM_BASEMAP',
  source_snapshot date not null,
  schema_version text not null,
  source_url text not null,
  storage_key text not null unique,
  byte_length bigint not null,
  sha256 text not null,
  min_zoom smallint not null,
  max_zoom smallint not null,
  west numeric not null,
  south numeric not null,
  east numeric not null,
  north numeric not null,
  attribution_html text not null,
  status text not null default 'READY',
  created_at timestamptz not null default now(),
  constraint internal_map_reference_pack_key_ck
    check (pack_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint internal_map_reference_pack_coverage_ck
    check (coverage_key ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
  constraint internal_map_reference_pack_source_ck
    check (source_name = 'PROTOMAPS_OSM_BASEMAP'),
  constraint internal_map_reference_pack_bytes_ck check (byte_length > 0),
  constraint internal_map_reference_pack_sha_ck check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint internal_map_reference_pack_zoom_ck
    check (min_zoom between 0 and 22 and max_zoom between min_zoom and 22),
  constraint internal_map_reference_pack_bounds_ck
    check (west >= -180 and east <= 180 and south >= -90 and north <= 90 and west < east and south < north),
  constraint internal_map_reference_pack_status_ck check (status in ('READY', 'RETIRED'))
);

create table if not exists ref.internal_map_company_reference_pack (
  company_id uuid primary key references core.companies(id) on delete cascade,
  pack_id uuid not null references ref.internal_map_reference_pack(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create index if not exists internal_map_company_reference_pack_pack_idx
  on ref.internal_map_company_reference_pack (pack_id, company_id);

alter table ref.internal_map_reference_pack enable row level security;
alter table ref.internal_map_company_reference_pack enable row level security;
revoke all on ref.internal_map_reference_pack from public, anon, authenticated;
revoke all on ref.internal_map_company_reference_pack from public, anon, authenticated;
grant all on ref.internal_map_reference_pack to service_role;
grant all on ref.internal_map_company_reference_pack to service_role;

insert into ref.internal_map_reference_pack (
  pack_key,
  coverage_key,
  source_snapshot,
  schema_version,
  source_url,
  storage_key,
  byte_length,
  sha256,
  min_zoom,
  max_zoom,
  west,
  south,
  east,
  north,
  attribution_html,
  status
)
values (
  'sc-ga-20260828-z14',
  'US-SC-GA',
  date '2026-08-28',
  '4.15.2',
  'https://build.protomaps.com/20260828.pmtiles',
  'internal-map-reference/sc-ga/20260828/sc-ga-20260828-z14.pmtiles',
  458398690,
  '20bd174bbfc3d89b50c989c4f778a9e6121c42ccc412d73e3959a4fe843a6d7f',
  0,
  14,
  -85.7,
  30.3,
  -78.4,
  35.3,
  '<a href="https://protomaps.com">Protomaps</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  'READY'
)
on conflict (pack_key) do update
set coverage_key = excluded.coverage_key,
    source_snapshot = excluded.source_snapshot,
    schema_version = excluded.schema_version,
    source_url = excluded.source_url,
    storage_key = excluded.storage_key,
    byte_length = excluded.byte_length,
    sha256 = excluded.sha256,
    min_zoom = excluded.min_zoom,
    max_zoom = excluded.max_zoom,
    west = excluded.west,
    south = excluded.south,
    east = excluded.east,
    north = excluded.north,
    attribution_html = excluded.attribution_html,
    status = excluded.status;

insert into ref.internal_map_company_reference_pack (company_id, pack_id)
select company.id, pack.id
from core.companies company
join ref.internal_map_reference_pack pack on pack.pack_key = 'sc-ga-20260828-z14'
where company.company_slug = 'beacon-point-ventures'
on conflict (company_id) do update
set pack_id = excluded.pack_id,
    assigned_at = now();

create or replace function ref.get_company_internal_map_reference_pack(
  p_company_slug text,
  p_pack_key text default null
)
returns table (
  pack_key text,
  coverage_key text,
  source_snapshot date,
  schema_version text,
  storage_key text,
  byte_length bigint,
  sha256 text,
  min_zoom smallint,
  max_zoom smallint,
  west numeric,
  south numeric,
  east numeric,
  north numeric,
  attribution_html text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
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

  return query
  select
    pack.pack_key,
    pack.coverage_key,
    pack.source_snapshot,
    pack.schema_version,
    pack.storage_key,
    pack.byte_length,
    pack.sha256,
    pack.min_zoom,
    pack.max_zoom,
    pack.west,
    pack.south,
    pack.east,
    pack.north,
    pack.attribution_html
  from ref.internal_map_company_reference_pack assignment
  join ref.internal_map_reference_pack pack on pack.id = assignment.pack_id
  where assignment.company_id = v_company_id
    and pack.status = 'READY'
    and (p_pack_key is null or pack.pack_key = lower(trim(p_pack_key)))
  limit 1;
end;
$$;

create or replace function public.get_company_internal_map_reference_pack(
  p_company_slug text,
  p_pack_key text default null
)
returns table (
  pack_key text,
  coverage_key text,
  source_snapshot date,
  schema_version text,
  storage_key text,
  byte_length bigint,
  sha256 text,
  min_zoom smallint,
  max_zoom smallint,
  west numeric,
  south numeric,
  east numeric,
  north numeric,
  attribution_html text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from ref.get_company_internal_map_reference_pack(p_company_slug, p_pack_key)
$$;

comment on table ref.internal_map_reference_pack is
  'Versioned public-geography PMTiles metadata. Customer manifests, stops, and route telemetry are never stored in these archives.';
comment on table ref.internal_map_company_reference_pack is
  'One active regional basemap assignment per customer company; geographic growth is explicit and incremental.';

revoke all on function ref.get_company_internal_map_reference_pack(text, text) from public, anon;
revoke all on function public.get_company_internal_map_reference_pack(text, text) from public, anon;
grant usage on schema ref to authenticated, service_role;
grant execute on function ref.get_company_internal_map_reference_pack(text, text) to authenticated, service_role;
grant execute on function public.get_company_internal_map_reference_pack(text, text) to authenticated, service_role;

commit;
