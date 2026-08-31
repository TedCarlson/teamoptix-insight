begin;

-- Route geometry is a required route/day artifact. Keep a small recovery
-- ledger so a successful manifest cycle cannot silently hide a missing GPX
-- download, and so retries remain bounded across runner restarts.
create table if not exists core.operations_route_gpx_recovery_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text not null,
  attempt_count integer not null default 0,
  last_targeted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_gpx_recovery_state_identity_uq
    unique (company_id, service_date, route_key),
  constraint operations_route_gpx_recovery_state_attempt_count_chk
    check (attempt_count >= 0)
);

create index if not exists operations_route_gpx_recovery_work_idx
  on core.operations_route_gpx_recovery_state (
    company_id,
    service_date,
    last_targeted_at
  );

alter table core.operations_route_gpx_recovery_state enable row level security;
revoke all on core.operations_route_gpx_recovery_state
  from public, anon, authenticated;
grant all on core.operations_route_gpx_recovery_state to service_role;

create or replace function core.operations_company_local_date(
  p_company_id uuid
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    now() at time zone coalesce(
      (
        select schedule.timezone
        from core.operations_runner_schedule schedule
        where schedule.company_id = p_company_id
        order by schedule.updated_at desc, schedule.id desc
        limit 1
      ),
      'America/New_York'
    )
  )::date;
$$;

revoke all on function core.operations_company_local_date(uuid)
  from public, anon, authenticated;
grant execute on function core.operations_company_local_date(uuid)
  to service_role;

create or replace function public.get_operations_route_gpx_recovery_targets(
  p_company_id uuid,
  p_service_date date,
  p_limit integer default 6
)
returns table (
  route_key text,
  route_label text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_company_id is null or p_service_date is null then
    raise exception 'Company and service date are required.'
      using errcode = '22023';
  end if;

  v_today := core.operations_company_local_date(p_company_id);
  if p_service_date > v_today or p_service_date < v_today - 7 then
    return;
  end if;

  insert into core.operations_route_gpx_recovery_state (
    company_id,
    service_date,
    route_key,
    route_label
  )
  select distinct
    stop.company_id,
    stop.service_date,
    stop.route_key,
    'WA ' || stop.route_key
  from core.operations_delivery_manifest_stop stop
  where stop.company_id = p_company_id
    and stop.service_date = p_service_date
    and nullif(trim(stop.route_key), '') is not null
  on conflict on constraint operations_route_gpx_recovery_state_identity_uq
  do update set
    route_label = excluded.route_label,
    updated_at = now();

  return query
  with candidates as materialized (
    select state.id
    from core.operations_route_gpx_recovery_state state
    where state.company_id = p_company_id
      and state.service_date = p_service_date
      and not exists (
        select 1
        from core.operations_route_gpx_artifact artifact
        where artifact.company_id = state.company_id
          and artifact.service_date = state.service_date
          and artifact.route_key = state.route_key
      )
      and (
        state.last_targeted_at is null
        or state.last_targeted_at <= now() - interval '30 minutes'
      )
    order by state.last_targeted_at nulls first, state.route_key
    limit greatest(1, least(coalesce(p_limit, 6), 25))
    for update skip locked
  )
  update core.operations_route_gpx_recovery_state state
  set
    last_targeted_at = now(),
    attempt_count = state.attempt_count + 1,
    updated_at = now()
  from candidates
  where state.id = candidates.id
  returning state.route_key, state.route_label, state.attempt_count;
end;
$$;

create or replace function public.count_operations_route_gpx_missing(
  p_company_id uuid,
  p_service_date date
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_company_id is null or p_service_date is null then
    raise exception 'Company and service date are required.'
      using errcode = '22023';
  end if;

  if p_service_date > core.operations_company_local_date(p_company_id)
     or p_service_date < core.operations_company_local_date(p_company_id) - 7 then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from (
    select distinct stop.route_key
    from core.operations_delivery_manifest_stop stop
    where stop.company_id = p_company_id
      and stop.service_date = p_service_date
      and nullif(trim(stop.route_key), '') is not null
  ) route
  where not exists (
    select 1
    from core.operations_route_gpx_artifact artifact
    where artifact.company_id = p_company_id
      and artifact.service_date = p_service_date
      and artifact.route_key = route.route_key
  );

  return v_count;
end;
$$;

-- The terminal timezone is the atomic day boundary. The lower bound is
-- inclusive: a Saturday route remains identifiable through the next Saturday.
create or replace function public.get_operations_route_gpx_geometry(
  p_company_id uuid,
  p_service_date date,
  p_route_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_artifact core.operations_route_gpx_artifact%rowtype;
  v_points jsonb;
begin
  if p_company_id is null
     or p_service_date is null
     or nullif(trim(p_route_key), '') is null then
    raise exception 'Company, service date, and route key are required.'
      using errcode = '22023';
  end if;

  v_today := core.operations_company_local_date(p_company_id);
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

-- Correct the purge boundary for every identifiable manifest/FCC artifact.
-- Previous definitions expired at the start of day seven; expiry now begins
-- only after the full terminal-local seventh calendar day has elapsed.
create or replace function public.list_operations_manifest_history_artifacts_for_purge(
  p_limit integer default 500
)
returns table (
  artifact_source text,
  artifact_id uuid,
  storage_bucket text,
  storage_path text
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select
      'manifest'::text as artifact_source,
      artifact.id as artifact_id,
      artifact.storage_bucket,
      artifact.storage_path,
      artifact.service_date,
      artifact.created_at
    from core.operations_manifest_artifact artifact
    where artifact.service_date
      < core.operations_company_local_date(artifact.company_id) - 7

    union all

    select
      'collection'::text as artifact_source,
      artifact.id as artifact_id,
      artifact.storage_bucket,
      artifact.storage_path,
      artifact.service_date,
      artifact.created_at
    from core.operations_collection_artifact artifact
    where artifact.service_date is not null
      and artifact.service_date
        < core.operations_company_local_date(artifact.company_id) - 7
      and (
        upper(coalesce(artifact.report_family_key, '')) = 'FCC'
        or upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
          in (
            'COMBINED_MANIFEST',
            'DELIVERY_MANIFEST',
            'PICKUP_MANIFEST',
            'ROUTE_GPX'
          )
      )
  )
  select
    candidates.artifact_source,
    candidates.artifact_id,
    candidates.storage_bucket,
    candidates.storage_path
  from candidates
  order by candidates.service_date, candidates.created_at, candidates.artifact_id
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;

create or replace function public.complete_operations_manifest_history_artifact_purge(
  p_manifest_artifact_ids uuid[] default '{}'::uuid[],
  p_collection_artifact_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manifest_deleted integer := 0;
  v_collection_deleted integer := 0;
  v_plan_deleted integer := 0;
begin
  delete from core.operations_manifest_artifact artifact
  where artifact.id = any(coalesce(p_manifest_artifact_ids, '{}'::uuid[]))
    and artifact.service_date
      < core.operations_company_local_date(artifact.company_id) - 7;
  get diagnostics v_manifest_deleted = row_count;

  delete from core.operations_collection_artifact artifact
  where artifact.id = any(coalesce(p_collection_artifact_ids, '{}'::uuid[]))
    and artifact.service_date is not null
    and artifact.service_date
      < core.operations_company_local_date(artifact.company_id) - 7
    and (
      upper(coalesce(artifact.report_family_key, '')) = 'FCC'
      or upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
        in (
          'COMBINED_MANIFEST',
          'DELIVERY_MANIFEST',
          'PICKUP_MANIFEST',
          'ROUTE_GPX'
        )
    );
  get diagnostics v_collection_deleted = row_count;

  delete from core.operations_manifest_capture_plan plan
  where plan.service_date
      < core.operations_company_local_date(plan.company_id) - 7
    and not exists (
      select 1
      from core.operations_manifest_artifact artifact
      where artifact.capture_plan_id = plan.id
    );
  get diagnostics v_plan_deleted = row_count;

  return jsonb_build_object(
    'manifest_artifact_deleted_count', v_manifest_deleted,
    'collection_artifact_deleted_count', v_collection_deleted,
    'capture_plan_deleted_count', v_plan_deleted,
    'purged_at', now()
  );
end;
$$;

create or replace function public.purge_operations_fcc_delivery_history(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_transformed jsonb := '{}'::jsonb;
begin
  select public.materialize_operations_route_last_delivery_facts(p_limit)
  into v_transformed;

  with expired as (
    select batch.id
    from core.operations_report_batch batch
    where upper(coalesce(batch.report_family_key, '')) = 'FCC'
      and batch.service_date is not null
      and batch.service_date
        < core.operations_company_local_date(batch.company_id) - 7
    order by batch.service_date, batch.created_at, batch.id
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
    for update skip locked
  )
  delete from core.operations_report_batch batch
  using expired
  where batch.id = expired.id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'deidentified_facts', v_transformed,
    'fcc_batch_deleted_count', v_deleted,
    'purged_at', now()
  );
end;
$$;

revoke all on function public.get_operations_route_gpx_recovery_targets(
  uuid, date, integer
) from public, anon, authenticated;
revoke all on function public.count_operations_route_gpx_missing(uuid, date)
  from public, anon, authenticated;
grant execute on function public.get_operations_route_gpx_recovery_targets(
  uuid, date, integer
) to service_role;
grant execute on function public.count_operations_route_gpx_missing(uuid, date)
  to service_role;

-- Force route closeout to request GPX explicitly and enable a bounded retained
-- recovery sweep without changing the signed master collection gate.
update core.operations_runner_schedule schedule
set
  report_config_json = jsonb_set(
    coalesce(schedule.report_config_json, '{}'::jsonb),
    '{route_closeout}',
    coalesce(schedule.report_config_json -> 'route_closeout', '{}'::jsonb)
      || jsonb_build_object(
        'reports', jsonb_build_array(
          'FCC',
          'DELIVERY_MANIFEST',
          'PICKUP_MANIFEST',
          'ROUTE_GPX'
        ),
        'retained_gpx_recovery_enabled', true,
        'retained_gpx_recovery_start_time', '03:10',
        'retained_gpx_recovery_max_batches', 12,
        'retained_gpx_recovery_interval_minutes', 30
      ),
    true
  ),
  config_version = schedule.config_version + 1,
  runner_state = case
    when schedule.collection_enabled then 'PENDING'
    else schedule.runner_state
  end,
  updated_at = now();

comment on table core.operations_route_gpx_recovery_state is
  'Bounded service-role ledger for required route/day GPX recovery attempts; contains no customer identity or coordinates.';
comment on function public.get_operations_route_gpx_recovery_targets(uuid, date, integer) is
  'Leases manifest-backed routes missing required GPX geometry inside the inclusive seven-day terminal-local window.';
comment on function public.count_operations_route_gpx_missing(uuid, date) is
  'Counts manifest-backed routes still missing required GPX geometry for recovery completion checks.';
comment on function public.get_operations_route_gpx_geometry(uuid, date, text) is
  'Returns authorized route geometry through the full seventh terminal-local calendar day after service.';

commit;
