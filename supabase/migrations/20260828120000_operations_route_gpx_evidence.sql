-- Preserve the route GPX selected from the same manifest search, while the
-- manifest workbook remains the authority for route and service-date identity.
-- Exact GPX coordinates follow the existing seven-day FCC artifact retention.

begin;

insert into core.operations_report_shape (
  report_shape_key,
  report_family_key,
  report_shape_label,
  required_headers,
  optional_headers,
  notes,
  is_active
)
values (
  'FCC_ROUTE_GPX',
  'FCC',
  'FCC Combined Route GPX',
  array[]::text[],
  array[]::text[],
  'Combined Manifest GPX route and stop geometry selected from a route-scoped P&D manifest search.',
  true
)
on conflict (report_shape_key) do update
set report_family_key = excluded.report_family_key,
    report_shape_label = excluded.report_shape_label,
    required_headers = excluded.required_headers,
    optional_headers = excluded.optional_headers,
    notes = excluded.notes,
    is_active = true;

create table if not exists core.operations_route_gpx_artifact (
  id uuid primary key default gen_random_uuid(),
  collection_artifact_id uuid not null
    references core.operations_collection_artifact(id) on delete cascade,
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text,
  track_name text,
  source_point_count integer not null default 0,
  retained_point_count integer not null default 0,
  stop_point_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_gpx_artifact_collection_uidx
    unique (collection_artifact_id),
  constraint operations_route_gpx_artifact_route_day_uidx
    unique (company_id, service_date, route_key),
  constraint operations_route_gpx_artifact_counts_chk check (
    source_point_count >= 0
    and retained_point_count >= 0
    and stop_point_count >= 0
    and source_point_count >= retained_point_count
    and retained_point_count <= 2000
  )
);

create table if not exists core.operations_route_gpx_point (
  id bigint generated always as identity primary key,
  gpx_artifact_id uuid not null
    references core.operations_route_gpx_artifact(id) on delete cascade,
  sequence_number integer not null,
  point_kind text not null,
  latitude double precision not null,
  longitude double precision not null,
  elevation_meters double precision,
  observed_at timestamptz,
  point_name text,
  point_description text,
  is_stop boolean not null default false,
  created_at timestamptz not null default now(),
  constraint operations_route_gpx_point_identity_uidx
    unique (gpx_artifact_id, sequence_number),
  constraint operations_route_gpx_point_kind_chk check (
    point_kind in ('WPT', 'RTEPT', 'TRKPT')
  ),
  constraint operations_route_gpx_point_latitude_chk check (
    latitude between -90 and 90
  ),
  constraint operations_route_gpx_point_longitude_chk check (
    longitude between -180 and 180
  )
);

create index if not exists operations_route_gpx_artifact_lookup_idx
  on core.operations_route_gpx_artifact (
    company_id,
    service_date desc,
    route_key,
    processed_at desc
  );

create index if not exists operations_route_gpx_point_order_idx
  on core.operations_route_gpx_point (gpx_artifact_id, sequence_number);

alter table core.operations_route_gpx_artifact enable row level security;
alter table core.operations_route_gpx_point enable row level security;

revoke all on core.operations_route_gpx_artifact
  from public, anon, authenticated;
revoke all on core.operations_route_gpx_point
  from public, anon, authenticated;
grant all on core.operations_route_gpx_artifact to service_role;
grant all on core.operations_route_gpx_point to service_role;

create or replace function public.replace_operations_route_gpx_points(
  p_collection_artifact_id uuid,
  p_route_key text,
  p_route_label text,
  p_track_name text,
  p_source_point_count integer,
  p_points jsonb,
  p_metadata_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_collection_artifact core.operations_collection_artifact%rowtype;
  v_gpx_artifact_id uuid;
  v_selected_route_key text;
  v_input_route_key text;
  v_track_route_key text;
  v_point_count integer := 0;
  v_stop_count integer := 0;
begin
  if p_collection_artifact_id is null
     or nullif(trim(p_route_key), '') is null
     or jsonb_typeof(coalesce(p_points, 'null'::jsonb)) <> 'array' then
    raise exception 'Collection artifact, route key, and GPX point array are required.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_points) = 0 or jsonb_array_length(p_points) > 2000 then
    raise exception 'GPX must retain between 1 and 2000 points.'
      using errcode = '22023';
  end if;

  select artifact.*
  into v_collection_artifact
  from core.operations_collection_artifact artifact
  where artifact.id = p_collection_artifact_id
    and upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
      = 'ROUTE_GPX'
  for update;

  if v_collection_artifact.id is null then
    raise exception 'Route GPX collection artifact was not found.';
  end if;

  v_selected_route_key := substring(
    coalesce(
      v_collection_artifact.runner_artifact_json #>>
        '{collection_context,selected_work_area}',
      v_collection_artifact.runner_artifact_json ->> 'route_identity',
      ''
    )
    from '([0-9]{1,4})'
  );
  v_selected_route_key := nullif(ltrim(v_selected_route_key, '0'), '');
  if v_selected_route_key is null then
    v_selected_route_key := '0';
  end if;
  v_input_route_key := coalesce(
    nullif(ltrim(trim(p_route_key), '0'), ''),
    '0'
  );

  if v_selected_route_key <> v_input_route_key then
    raise exception 'GPX route does not match its manifest search context.';
  end if;

  v_track_route_key := substring(
    coalesce(p_track_name, '')
    from '([0-9]{1,4})'
  );
  if v_track_route_key is not null then
    v_track_route_key := coalesce(
      nullif(ltrim(v_track_route_key, '0'), ''),
      '0'
    );
    if v_track_route_key <> v_input_route_key then
      raise exception 'Combined Manifest GPX route does not match the verified manifest route.';
    end if;
  end if;

  if not exists (
    select 1
    from core.operations_collection_artifact manifest
    where manifest.company_id = v_collection_artifact.company_id
      and manifest.service_date = v_collection_artifact.service_date
      and manifest.artifact_status in ('READY_FOR_INGEST', 'INGESTING', 'INGESTED', 'IGNORED')
      and upper(coalesce(manifest.runner_artifact_json ->> 'artifact_key', ''))
        in ('DELIVERY_MANIFEST', 'PICKUP_MANIFEST')
      and manifest.runner_artifact_json ->> 'route_key' = v_input_route_key
      and manifest.runner_artifact_json ->> 'identity_authority' = 'INGESTION_PIPELINE'
  ) then
    raise exception 'A workbook-verified manifest for the same company, route, and service date is required before GPX ingestion.';
  end if;

  insert into core.operations_route_gpx_artifact (
    collection_artifact_id,
    company_id,
    service_date,
    route_key,
    route_label,
    track_name,
    source_point_count,
    retained_point_count,
    stop_point_count,
    metadata_json,
    processed_at,
    updated_at
  ) values (
    v_collection_artifact.id,
    v_collection_artifact.company_id,
    v_collection_artifact.service_date,
    v_input_route_key,
    nullif(trim(p_route_label), ''),
    nullif(trim(p_track_name), ''),
    greatest(
      jsonb_array_length(p_points),
      coalesce(p_source_point_count, 0)
    ),
    jsonb_array_length(p_points),
    0,
    coalesce(p_metadata_json, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (company_id, service_date, route_key) do update
  set collection_artifact_id = excluded.collection_artifact_id,
      route_key = excluded.route_key,
      route_label = excluded.route_label,
      track_name = excluded.track_name,
      source_point_count = excluded.source_point_count,
      retained_point_count = excluded.retained_point_count,
      metadata_json = excluded.metadata_json,
      processed_at = now(),
      updated_at = now()
  returning id into v_gpx_artifact_id;

  delete from core.operations_route_gpx_point point
  where point.gpx_artifact_id = v_gpx_artifact_id;

  insert into core.operations_route_gpx_point (
    gpx_artifact_id,
    sequence_number,
    point_kind,
    latitude,
    longitude,
    elevation_meters,
    observed_at,
    point_name,
    point_description,
    is_stop
  )
  select
    v_gpx_artifact_id,
    row_number() over (order by source.sequence_number)::integer,
    upper(source.point_kind),
    source.latitude,
    source.longitude,
    source.elevation_meters,
    source.observed_at,
    nullif(trim(source.point_name), ''),
    nullif(trim(source.point_description), ''),
    coalesce(source.is_stop, false)
  from jsonb_to_recordset(p_points) as source (
    sequence_number integer,
    point_kind text,
    latitude double precision,
    longitude double precision,
    elevation_meters double precision,
    observed_at timestamptz,
    point_name text,
    point_description text,
    is_stop boolean
  )
  where upper(coalesce(source.point_kind, '')) in ('WPT', 'RTEPT', 'TRKPT')
    and source.latitude between -90 and 90
    and source.longitude between -180 and 180;
  get diagnostics v_point_count = row_count;

  if v_point_count <> jsonb_array_length(p_points) then
    raise exception 'One or more GPX points failed coordinate validation.';
  end if;

  select count(*)::integer
  into v_stop_count
  from core.operations_route_gpx_point point
  where point.gpx_artifact_id = v_gpx_artifact_id
    and point.is_stop;

  update core.operations_route_gpx_artifact
  set stop_point_count = v_stop_count,
      retained_point_count = v_point_count,
      updated_at = now()
  where id = v_gpx_artifact_id;

  return jsonb_build_object(
    'gpx_artifact_id', v_gpx_artifact_id,
    'retained_point_count', v_point_count,
    'stop_point_count', v_stop_count,
    'route_key', v_input_route_key
  );
end;
$$;

create or replace function public.get_operations_route_gpx_geometry(
  p_company_id uuid,
  p_service_date date,
  p_route_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_artifact core.operations_route_gpx_artifact%rowtype;
  v_points jsonb;
begin
  if p_company_id is null
     or p_service_date is null
     or nullif(trim(p_route_key), '') is null then
    raise exception 'Company, service date, and route key are required.'
      using errcode = '22023';
  end if;
  if p_service_date > v_today or p_service_date < v_today - 7 then
    return null;
  end if;

  select artifact.*
  into v_artifact
  from core.operations_route_gpx_artifact artifact
  where artifact.company_id = p_company_id
    and artifact.service_date = p_service_date
    and artifact.route_key = trim(p_route_key)
  order by artifact.processed_at desc, artifact.id desc
  limit 1;

  if v_artifact.id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sequence_number', point.sequence_number,
        'point_kind', point.point_kind,
        'latitude', point.latitude,
        'longitude', point.longitude,
        'elevation_meters', point.elevation_meters,
        'observed_at', point.observed_at,
        'point_name', point.point_name,
        'point_description', point.point_description,
        'is_stop', point.is_stop
      ) order by point.sequence_number
    ),
    '[]'::jsonb
  )
  into v_points
  from core.operations_route_gpx_point point
  where point.gpx_artifact_id = v_artifact.id;

  return jsonb_build_object(
    'route_key', v_artifact.route_key,
    'route_label', v_artifact.route_label,
    'track_name', v_artifact.track_name,
    'source_point_count', v_artifact.source_point_count,
    'retained_point_count', v_artifact.retained_point_count,
    'stop_point_count', v_artifact.stop_point_count,
    'processed_at', v_artifact.processed_at,
    'points', v_points
  );
end;
$$;

revoke all on function public.replace_operations_route_gpx_points(
  uuid, text, text, text, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_operations_route_gpx_points(
  uuid, text, text, text, integer, jsonb, jsonb
) to service_role;

revoke all on function public.get_operations_route_gpx_geometry(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.get_operations_route_gpx_geometry(uuid, date, text)
  to service_role;

comment on table core.operations_route_gpx_artifact is
  'Seven-day route GPX evidence whose company/route/date identity is verified by an ingested route-day manifest workbook.';
comment on function public.get_operations_route_gpx_geometry(uuid, date, text) is
  'Returns authorized route GPX geometry only inside the seven-day identifiable manifest window.';

commit;
