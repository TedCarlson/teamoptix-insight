begin;

-- Route closeout is a durable orchestration ledger, not another copy of the
-- manifest payload. It records why a route is still being collected and when
-- the canonical delivery and pickup manifests became newer than the close
-- signal observed in DSW/FCC.
create table if not exists core.operations_route_closeout_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  route_label text not null,
  driver_name text,
  closeout_status text not null default 'MONITORING',
  close_signal_source text,
  close_signal_observed_at timestamptz,
  latest_dsw_batch_id uuid,
  latest_fcc_batch_id uuid,
  latest_delivery_manifest_at timestamptz,
  latest_pickup_manifest_at timestamptz,
  last_targeted_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  cutoff_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_closeout_state_identity_uq
    unique (company_id, service_date, route_key),
  constraint operations_route_closeout_state_status_chk check (
    closeout_status = any (array[
      'MONITORING',
      'FINAL_CAPTURE_PENDING',
      'FINAL_CAPTURED',
      'UNRESOLVED_AT_CUTOFF'
    ]::text[])
  ),
  constraint operations_route_closeout_state_signal_chk check (
    close_signal_source is null
    or close_signal_source = any (array[
      'DSW',
      'FCC',
      'DSW_AND_FCC'
    ]::text[])
  )
);

create index if not exists operations_route_closeout_state_work_idx
  on core.operations_route_closeout_state (
    company_id,
    service_date,
    closeout_status,
    last_targeted_at
  );

alter table core.operations_route_closeout_state enable row level security;
revoke all on core.operations_route_closeout_state
  from public, anon, authenticated;
grant all on core.operations_route_closeout_state to service_role;

comment on table core.operations_route_closeout_state is
  'Self-draining Runner ledger for one authoritative final delivery and pickup manifest per operated route/day.';

-- Refresh route truth from the latest DSW/FCC snapshots, latch the first
-- reliable close signal, and lease only the routes that need another manifest
-- pass. The RPC intentionally does not expose address or recipient data.
create or replace function public.get_operations_route_closeout_targets(
  p_company_id uuid,
  p_service_date date,
  p_limit integer default 6,
  p_final_sweep boolean default false
)
returns table (
  route_key text,
  route_label text,
  driver_name text,
  closeout_status text,
  close_signal_source text,
  close_signal_observed_at timestamptz,
  latest_delivery_manifest_at timestamptz,
  latest_pickup_manifest_at timestamptz,
  target_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_company_id is null or p_service_date is null then
    raise exception 'Company and service date are required.';
  end if;

  with latest_dsw_batch as (
    select
      batch.id,
      batch.created_at
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.service_date = p_service_date
      and batch.report_family_key = 'DSW'
      and batch.report_shape_key in (
        'DSW_FINALIZED_DAY',
        'DSW_DAILY_SERVICE_WORKSHEET'
      )
      and batch.status = 'LOADED'
    order by
      case when batch.report_shape_key = 'DSW_FINALIZED_DAY' then 0 else 1 end,
      batch.created_at desc,
      batch.id desc
    limit 1
  ),
  dsw_rows as (
    select distinct on (identity.route_key)
      identity.route_key,
      coalesce(
        nullif(raw.normalized_row_json ->> 'wa_name', ''),
        nullif(raw.source_route_key, ''),
        'WA ' || identity.route_key
      ) as route_label,
      coalesce(
        nullif(raw.normalized_row_json ->> 'driver_name', ''),
        nullif(raw.source_driver_name, '')
      ) as driver_name,
      batch.id as batch_id,
      batch.created_at as batch_created_at,
      case
        when coalesce(raw.normalized_row_json ->> 'planned_delivery_stops', '') ~ '^-?[0-9]+$'
          then (raw.normalized_row_json ->> 'planned_delivery_stops')::integer
        else null
      end as planned_delivery_stops,
      case
        when coalesce(raw.normalized_row_json ->> 'actual_delivery_stops', '') ~ '^-?[0-9]+$'
          then (raw.normalized_row_json ->> 'actual_delivery_stops')::integer
        else null
      end as actual_delivery_stops,
      case
        when coalesce(raw.normalized_row_json ->> 'planned_pickup_stops', '') ~ '^-?[0-9]+$'
          then (raw.normalized_row_json ->> 'planned_pickup_stops')::integer
        else null
      end as planned_pickup_stops,
      case
        when coalesce(raw.normalized_row_json ->> 'actual_pickup_stops', '') ~ '^-?[0-9]+$'
          then (raw.normalized_row_json ->> 'actual_pickup_stops')::integer
        else null
      end as actual_pickup_stops,
      nullif(raw.normalized_row_json ->> 'miles', '') as miles,
      nullif(raw.normalized_row_json ->> 'on_road_hours', '') as on_road_hours,
      nullif(raw.normalized_row_json ->> 'on_duty_hours', '') as on_duty_hours
    from latest_dsw_batch batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    cross join lateral (
      select ltrim(
        regexp_replace(
          coalesce(
            nullif(raw.normalized_row_json ->> 'wa_number', ''),
            nullif(raw.source_wa_number, '')
          ),
          '[^0-9]',
          '',
          'g'
        ),
        '0'
      ) as route_key
    ) identity
    where identity.route_key <> ''
    order by identity.route_key, raw.source_row_index
  ),
  dsw_routes as (
    select
      row.*,
      (
        row.miles is not null
        and row.on_road_hours is not null
        and row.on_duty_hours is not null
      ) or (
        coalesce(row.planned_delivery_stops, 0) > 0
        and coalesce(row.actual_delivery_stops, -1) >= row.planned_delivery_stops
        and (
          coalesce(row.planned_pickup_stops, 0) = 0
          or coalesce(row.actual_pickup_stops, -1) >= row.planned_pickup_stops
        )
      ) as is_closed
    from dsw_rows row
  ),
  latest_fcc_batch as (
    select batch.id, batch.created_at
    from core.operations_report_batch batch
    where batch.company_id = p_company_id
      and batch.service_date = p_service_date
      and batch.report_family_key = 'FCC'
      and batch.status = 'LOADED'
    order by batch.created_at desc, batch.id desc
    limit 1
  ),
  fcc_routes as (
    select distinct on (identity.route_key)
      identity.route_key,
      'WA ' || identity.route_key as route_label,
      coalesce(
        nullif(raw.normalized_row_json ->> 'driver_name', ''),
        nullif(raw.source_driver_name, '')
      ) as driver_name,
      batch.id as batch_id,
      batch.created_at as batch_created_at,
      lower(coalesce(raw.normalized_row_json ->> 'deliveries_complete', ''))
        in ('true', 't', '1', 'yes', 'complete', 'completed')
        as deliveries_complete,
      lower(coalesce(raw.normalized_row_json ->> 'pickup_complete', ''))
        in ('true', 't', '1', 'yes', 'complete', 'completed')
        as pickup_complete
    from latest_fcc_batch batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    cross join lateral (
      select ltrim(
        regexp_replace(
          coalesce(
            nullif(raw.normalized_row_json ->> 'wa_number_normalized', ''),
            nullif(raw.normalized_row_json ->> 'wa_number', ''),
            nullif(raw.source_wa_number, '')
          ),
          '[^0-9]',
          '',
          'g'
        ),
        '0'
      ) as route_key
    ) identity
    where identity.route_key <> ''
    order by identity.route_key, raw.source_row_index
  ),
  manifest_routes as (
    select
      ltrim(regexp_replace(artifact.route_key, '[^0-9]', '', 'g'), '0')
        as route_key,
      max(artifact.route_label) as route_label,
      max(artifact.captured_at) filter (
        where artifact.manifest_type = 'delivery'
          and artifact.artifact_status = 'NORMALIZED'
      ) as latest_delivery_manifest_at,
      max(artifact.captured_at) filter (
        where artifact.manifest_type = 'pickup'
          and artifact.artifact_status = 'NORMALIZED'
      ) as latest_pickup_manifest_at
    from core.operations_manifest_artifact artifact
    where artifact.company_id = p_company_id
      and artifact.service_date = p_service_date
    group by ltrim(regexp_replace(artifact.route_key, '[^0-9]', '', 'g'), '0')
  ),
  route_inventory as (
    select dsw.route_key from dsw_routes dsw
    union
    select fcc.route_key from fcc_routes fcc
    union
    select manifest.route_key
    from manifest_routes manifest
    where manifest.route_key <> ''
  ),
  route_facts as (
    select
      inventory.route_key,
      coalesce(
        nullif(dsw.route_label, ''),
        nullif(fcc.route_label, ''),
        nullif(manifest.route_label, ''),
        'WA ' || inventory.route_key
      ) as route_label,
      coalesce(nullif(fcc.driver_name, ''), nullif(dsw.driver_name, ''))
        as driver_name,
      dsw.batch_id as latest_dsw_batch_id,
      fcc.batch_id as latest_fcc_batch_id,
      manifest.latest_delivery_manifest_at,
      manifest.latest_pickup_manifest_at,
      case
        when coalesce(dsw.is_closed, false)
          and coalesce(fcc.deliveries_complete, false)
          and (
            coalesce(fcc.pickup_complete, false)
            or coalesce(dsw.planned_pickup_stops, 0) = 0
          ) then 'DSW_AND_FCC'
        when coalesce(dsw.is_closed, false) then 'DSW'
        when coalesce(fcc.deliveries_complete, false)
          and (
            coalesce(fcc.pickup_complete, false)
            or coalesce(dsw.planned_pickup_stops, 0) = 0
          ) then 'FCC'
        else null
      end as close_signal_source,
      case
        when coalesce(dsw.is_closed, false)
          and coalesce(fcc.deliveries_complete, false)
          and (
            coalesce(fcc.pickup_complete, false)
            or coalesce(dsw.planned_pickup_stops, 0) = 0
          ) then greatest(dsw.batch_created_at, fcc.batch_created_at)
        when coalesce(dsw.is_closed, false) then dsw.batch_created_at
        when coalesce(fcc.deliveries_complete, false)
          and (
            coalesce(fcc.pickup_complete, false)
            or coalesce(dsw.planned_pickup_stops, 0) = 0
          ) then fcc.batch_created_at
        else null
      end as close_signal_observed_at
    from route_inventory inventory
    left join dsw_routes dsw on dsw.route_key = inventory.route_key
    left join fcc_routes fcc on fcc.route_key = inventory.route_key
    left join manifest_routes manifest on manifest.route_key = inventory.route_key
  )
  insert into core.operations_route_closeout_state (
    company_id,
    service_date,
    route_key,
    route_label,
    driver_name,
    closeout_status,
    close_signal_source,
    close_signal_observed_at,
    latest_dsw_batch_id,
    latest_fcc_batch_id,
    latest_delivery_manifest_at,
    latest_pickup_manifest_at,
    last_evaluated_at,
    metadata_json
  )
  select
    p_company_id,
    p_service_date,
    fact.route_key,
    fact.route_label,
    fact.driver_name,
    case
      when fact.close_signal_observed_at is not null
        and fact.latest_delivery_manifest_at >= fact.close_signal_observed_at
        and fact.latest_pickup_manifest_at >= fact.close_signal_observed_at
        then 'FINAL_CAPTURED'
      when fact.close_signal_observed_at is not null
        then 'FINAL_CAPTURE_PENDING'
      else 'MONITORING'
    end,
    fact.close_signal_source,
    fact.close_signal_observed_at,
    fact.latest_dsw_batch_id,
    fact.latest_fcc_batch_id,
    fact.latest_delivery_manifest_at,
    fact.latest_pickup_manifest_at,
    now(),
    jsonb_build_object(
      'inventory_authority', 'LATEST_DSW_FCC_AND_CANONICAL_MANIFEST',
      'payload_contains_sensitive_detail', false
    )
  from route_facts fact
  where fact.route_key <> ''
  on conflict on constraint operations_route_closeout_state_identity_uq
  do update set
    route_label = excluded.route_label,
    driver_name = coalesce(excluded.driver_name, core.operations_route_closeout_state.driver_name),
    close_signal_source = coalesce(
      excluded.close_signal_source,
      core.operations_route_closeout_state.close_signal_source
    ),
    close_signal_observed_at = greatest(
      excluded.close_signal_observed_at,
      core.operations_route_closeout_state.close_signal_observed_at
    ),
    latest_dsw_batch_id = coalesce(
      excluded.latest_dsw_batch_id,
      core.operations_route_closeout_state.latest_dsw_batch_id
    ),
    latest_fcc_batch_id = coalesce(
      excluded.latest_fcc_batch_id,
      core.operations_route_closeout_state.latest_fcc_batch_id
    ),
    latest_delivery_manifest_at = excluded.latest_delivery_manifest_at,
    latest_pickup_manifest_at = excluded.latest_pickup_manifest_at,
    closeout_status = case
      when core.operations_route_closeout_state.closeout_status = 'FINAL_CAPTURED'
        then 'FINAL_CAPTURED'
      when greatest(
        excluded.close_signal_observed_at,
        core.operations_route_closeout_state.close_signal_observed_at
      ) is not null
        and excluded.latest_delivery_manifest_at >= greatest(
          excluded.close_signal_observed_at,
          core.operations_route_closeout_state.close_signal_observed_at
        )
        and excluded.latest_pickup_manifest_at >= greatest(
          excluded.close_signal_observed_at,
          core.operations_route_closeout_state.close_signal_observed_at
        ) then 'FINAL_CAPTURED'
      when greatest(
        excluded.close_signal_observed_at,
        core.operations_route_closeout_state.close_signal_observed_at
      ) is not null then 'FINAL_CAPTURE_PENDING'
      else 'MONITORING'
    end,
    last_evaluated_at = now(),
    cutoff_at = null,
    metadata_json = core.operations_route_closeout_state.metadata_json
      || excluded.metadata_json,
    updated_at = now();

  return query
  with candidates as materialized (
    select state.id
    from core.operations_route_closeout_state state
    where state.company_id = p_company_id
      and state.service_date = p_service_date
      and state.closeout_status in ('FINAL_CAPTURE_PENDING', 'MONITORING')
      and (
        state.last_targeted_at is null
        or state.last_targeted_at <= now() - interval '10 minutes'
      )
      and (
        state.closeout_status = 'FINAL_CAPTURE_PENDING'
        or p_final_sweep
        or least(
          coalesce(state.latest_delivery_manifest_at, '-infinity'::timestamptz),
          coalesce(state.latest_pickup_manifest_at, '-infinity'::timestamptz)
        ) <= now() - interval '30 minutes'
      )
    order by
      case when state.closeout_status = 'FINAL_CAPTURE_PENDING' then 0 else 1 end,
      least(
        coalesce(state.latest_delivery_manifest_at, '-infinity'::timestamptz),
        coalesce(state.latest_pickup_manifest_at, '-infinity'::timestamptz)
      ),
      state.route_key
    limit greatest(1, least(coalesce(p_limit, 6), 25))
    for update skip locked
  )
  update core.operations_route_closeout_state state
  set last_targeted_at = now(), updated_at = now()
  from candidates
  where state.id = candidates.id
  returning
    state.route_key,
    state.route_label,
    state.driver_name,
    state.closeout_status,
    state.close_signal_source,
    state.close_signal_observed_at,
    state.latest_delivery_manifest_at,
    state.latest_pickup_manifest_at,
    case
      when state.closeout_status = 'FINAL_CAPTURE_PENDING'
        then 'CLOSE_SIGNAL_REQUIRES_FINAL_MANIFEST'
      when p_final_sweep then 'FINAL_SWEEP_LATEST_MANIFEST'
      else 'MONITORING_MANIFEST_STALE'
    end;
end;
$$;

revoke all on function public.get_operations_route_closeout_targets(
  uuid, date, integer, boolean
) from public, anon, authenticated;
grant execute on function public.get_operations_route_closeout_targets(
  uuid, date, integer, boolean
) to service_role;

comment on function public.get_operations_route_closeout_targets(
  uuid, date, integer, boolean
) is
  'Returns and leases de-identified route keys needing fresh canonical manifests during route closeout.';

create or replace function public.finalize_operations_route_closeout_cutoff(
  p_company_id uuid,
  p_service_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final integer;
  v_unresolved integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  update core.operations_route_closeout_state state
  set
    closeout_status = 'UNRESOLVED_AT_CUTOFF',
    cutoff_at = now(),
    updated_at = now()
  where state.company_id = p_company_id
    and state.service_date = p_service_date
    and state.closeout_status <> 'FINAL_CAPTURED';

  select
    count(*) filter (where state.closeout_status = 'FINAL_CAPTURED')::integer,
    count(*) filter (where state.closeout_status = 'UNRESOLVED_AT_CUTOFF')::integer
  into v_final, v_unresolved
  from core.operations_route_closeout_state state
  where state.company_id = p_company_id
    and state.service_date = p_service_date;

  return jsonb_build_object(
    'service_date', p_service_date,
    'final_captured_count', coalesce(v_final, 0),
    'unresolved_count', coalesce(v_unresolved, 0),
    'cutoff_at', now()
  );
end;
$$;

revoke all on function public.finalize_operations_route_closeout_cutoff(
  uuid, date
) from public, anon, authenticated;
grant execute on function public.finalize_operations_route_closeout_cutoff(
  uuid, date
) to service_role;

-- Route closeout is a first-class Runner 2 cycle, separate from all-day pulse
-- work and from manual recovery tickets.
alter table core.operations_collection_request
  drop constraint if exists operations_collection_request_type_chk;
alter table core.operations_collection_request
  add constraint operations_collection_request_type_chk
  check (
    request_type = any (array[
      'PREVIOUS_DAY_CLOSE',
      'LAST_LOOK',
      'HISTORICAL_BACKFILL',
      'TARGETED_RECOVERY',
      'OPERATIONS_FEED',
      'OPERATIONS_PULSE',
      'DRO_AM',
      'ROUTE_CLOSEOUT'
    ]::text[])
  );

create or replace function public.start_operations_runner_cycle_v2(
  p_runner_key text,
  p_cycle_id uuid,
  p_company_id uuid,
  p_company_slug text,
  p_request_type text,
  p_service_date date,
  p_started_at timestamptz,
  p_requested_reports text[],
  p_request_payload jsonb
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_company_id uuid;
  v_schedule_company_slug text;
  v_row public.operations_collection_request_v;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select schedule.company_id, company.company_slug
  into v_schedule_company_id, v_schedule_company_slug
  from core.operations_runner_schedule schedule
  join core.companies company on company.id = schedule.company_id
  where schedule.runner_key = trim(p_runner_key);

  if v_schedule_company_id is null
    or v_schedule_company_id <> p_company_id
    or v_schedule_company_slug <> trim(p_company_slug)
  then
    raise exception 'Runner, company id, and company slug do not match.'
      using errcode = '42501';
  end if;

  if upper(trim(coalesce(p_request_type, ''))) not in (
    'PREVIOUS_DAY_CLOSE',
    'OPERATIONS_PULSE',
    'DRO_AM',
    'ROUTE_CLOSEOUT',
    'TARGETED_RECOVERY',
    'HISTORICAL_BACKFILL'
  ) then
    raise exception 'Unsupported Runner 2.0 cycle type.';
  end if;

  insert into core.operations_collection_request (
    id, company_id, request_type, request_status, priority, service_date,
    requested_reports, request_payload, claimed_by, claimed_at, started_at,
    created_at, updated_at, output_receipt_json
  )
  values (
    p_cycle_id,
    p_company_id,
    upper(trim(p_request_type)),
    'RUNNING',
    case upper(trim(p_request_type))
      when 'TARGETED_RECOVERY' then 40
      when 'PREVIOUS_DAY_CLOSE' then 60
      when 'ROUTE_CLOSEOUT' then 70
      else 100
    end,
    p_service_date,
    coalesce(p_requested_reports, '{}'::text[]),
    coalesce(p_request_payload, '{}'::jsonb) || jsonb_build_object(
      'payload_contract_version', 'operations_collection_v2',
      'source', 'continuous_runner_v2',
      'runner_key', trim(p_runner_key)
    ),
    trim(p_runner_key),
    p_started_at,
    p_started_at,
    p_started_at,
    now(),
    jsonb_build_object(
      'schema_version', 2,
      'runner_version', 'continuous-runner-v2',
      'cycle_id', p_cycle_id,
      'company_slug', v_schedule_company_slug,
      'started_at', p_started_at
    )
  )
  on conflict (id) do nothing;

  if exists (
    select 1
    from core.operations_collection_request request
    where request.id = p_cycle_id
      and (
        request.company_id <> p_company_id
        or request.claimed_by is distinct from trim(p_runner_key)
      )
  ) then
    raise exception 'Runner 2.0 cycle is already owned by another tenant or runner.'
      using errcode = '42501';
  end if;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_cycle_id;

  return v_row;
end;
$$;

revoke all on function public.start_operations_runner_cycle_v2(
  text, uuid, uuid, text, text, date, timestamptz, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.start_operations_runner_cycle_v2(
  text, uuid, uuid, text, text, date, timestamptz, text[], jsonb
) to service_role;

-- Existing schedules inherit the governed closeout lane without changing the
-- master collection gate. The controller acknowledges the version normally.
update core.operations_runner_schedule schedule
set
  report_config_json = jsonb_set(
    coalesce(schedule.report_config_json, '{}'::jsonb),
    '{route_closeout}',
    jsonb_build_object(
      'enabled', true,
      'start_time', '19:30',
      'end_time', '23:50',
      'final_sweep_start_time', '23:30',
      'fcc_interval_minutes', 10,
      'dsw_interval_minutes', 30,
      'route_batch_size', 6,
      'previous_day_recovery_enabled', true,
      'previous_day_recovery_max_batches', 4,
      'reports', jsonb_build_array(
        'FCC',
        'DELIVERY_MANIFEST',
        'PICKUP_MANIFEST'
      )
    ),
    true
  ),
  config_version = schedule.config_version + 1,
  updated_at = now()
where schedule.report_config_json -> 'route_closeout' is null;

create or replace function public.get_operations_runner_bootstrap(
  p_runner_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.operations_runner_schedule_v;
  v_profile_id uuid;
  v_credential_version bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select * into v_schedule
  from public.operations_runner_schedule_v
  where runner_key = trim(p_runner_key);

  if v_schedule.id is null then
    return null;
  end if;

  select profile.id, credential.credential_version
  into v_profile_id, v_credential_version
  from core.automation_profile profile
  left join core.automation_credential credential
    on credential.profile_id = profile.id
  where profile.company_id = v_schedule.company_id
    and profile.provider_key = 'FEDEX'
  limit 1;

  return jsonb_build_object(
    'schema_version', 3,
    'runner_key', v_schedule.runner_key,
    'company_id', v_schedule.company_id,
    'company_slug', v_schedule.company_slug,
    'timezone', v_schedule.timezone,
    'collection_enabled', v_schedule.collection_enabled,
    'config_version', v_schedule.config_version,
    'previous_day_close', jsonb_build_object(
      'enabled', v_schedule.previous_day_close_enabled,
      'start_time', to_char(v_schedule.previous_day_close_time, 'HH24:MI'),
      'reports', coalesce(
        v_schedule.report_config_json -> 'previous_day_close',
        '["DSW"]'::jsonb
      )
    ),
    'dro_am', coalesce(
      v_schedule.report_config_json -> 'dro_am',
      jsonb_build_object(
        'enabled', true,
        'start_time', '04:00',
        'reports', jsonb_build_array('DRO')
      )
    ),
    'operations_pulse', jsonb_build_object(
      'enabled', v_schedule.operations_pulse_enabled,
      'start_time', to_char(v_schedule.operations_pulse_start_time, 'HH24:MI'),
      'end_time', to_char(v_schedule.operations_pulse_end_time, 'HH24:MI'),
      'trigger', 'PREVIOUS_SUCCESS',
      'operating_weekdays', coalesce(
        v_schedule.report_config_json -> 'operating_weekdays',
        '[1,2,3,4,5,6]'::jsonb
      ),
      'operating_date_overrides', coalesce(
        v_schedule.report_config_json -> 'operating_date_overrides',
        '{}'::jsonb
      ),
      'reports', coalesce(
        v_schedule.report_config_json -> 'operations_pulse',
        '[]'::jsonb
      )
    ),
    'route_closeout', coalesce(
      v_schedule.report_config_json -> 'route_closeout',
      jsonb_build_object(
        'enabled', true,
        'start_time', '19:30',
        'end_time', '23:50',
        'final_sweep_start_time', '23:30',
        'fcc_interval_minutes', 10,
        'dsw_interval_minutes', 30,
        'route_batch_size', 6,
        'previous_day_recovery_enabled', true,
        'previous_day_recovery_max_batches', 4,
        'reports', jsonb_build_array(
          'FCC', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST'
        )
      )
    ),
    'targeted_recovery', v_schedule.recovery_config_json,
    'historical_sweep', v_schedule.historical_config_json,
    'credential', jsonb_build_object(
      'profile_id', v_profile_id,
      'provider_key', 'FEDEX',
      'version', coalesce(v_credential_version, 0)
    )
  );
end;
$$;

revoke all on function public.get_operations_runner_bootstrap(text)
  from public, anon, authenticated;
grant execute on function public.get_operations_runner_bootstrap(text)
  to service_role;

notify pgrst, 'reload schema';

commit;
