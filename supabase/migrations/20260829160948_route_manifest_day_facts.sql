-- Collapse the seven-day manifest receipt stream into one durable route/day
-- statistical record before raw collection files and identifiable rows drain.

begin;

create table if not exists core.operations_route_manifest_day_fact (
  id bigint generated always as identity primary key,
  company_id uuid not null references core.companies(id) on delete cascade,
  service_date date not null,
  route_key text not null,
  capture_count integer not null default 0,
  measured_capture_count integer not null default 0,
  first_capture_at timestamptz,
  last_capture_at timestamptz,
  median_cadence_minutes numeric(12, 1),
  initial_completed_stops integer,
  final_completed_stops integer,
  final_open_stops integer,
  final_total_stops integer,
  completed_stop_gain integer,
  active_minutes numeric(12, 1),
  average_stops_per_hour numeric(12, 1),
  peak_stops_per_hour numeric(12, 1),
  peak_completed_block integer,
  pace_summary_json jsonb not null default '{}'::jsonb,
  transformed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_route_manifest_day_fact_identity_uidx
    unique (company_id, service_date, route_key),
  constraint operations_route_manifest_day_fact_counts_ck check (
    capture_count >= 0
    and measured_capture_count >= 0
    and measured_capture_count <= capture_count
  )
);

create index if not exists operations_route_manifest_day_fact_lookup_idx
  on core.operations_route_manifest_day_fact (
    company_id,
    service_date desc,
    route_key
  );

create index if not exists operations_collection_delivery_manifest_day_idx
  on core.operations_collection_artifact (
    company_id,
    service_date,
    ((runner_artifact_json ->> 'route_key')),
    created_at
  )
  where artifact_status = 'INGESTED'
    and upper(coalesce(
      runner_artifact_json ->> 'artifact_key', ''
    )) = 'DELIVERY_MANIFEST';

alter table core.operations_route_manifest_day_fact enable row level security;

revoke all on core.operations_route_manifest_day_fact
  from public, anon, authenticated;
grant all on core.operations_route_manifest_day_fact to service_role;

create or replace view public.operations_route_manifest_day_fact_v
with (security_invoker = true) as
select
  fact.company_id,
  fact.service_date,
  fact.route_key,
  fact.capture_count,
  fact.measured_capture_count,
  fact.first_capture_at,
  fact.last_capture_at,
  fact.median_cadence_minutes,
  fact.initial_completed_stops,
  fact.final_completed_stops,
  fact.final_open_stops,
  fact.final_total_stops,
  fact.completed_stop_gain,
  fact.active_minutes,
  fact.average_stops_per_hour,
  fact.peak_stops_per_hour,
  fact.peak_completed_block,
  fact.pace_summary_json,
  fact.transformed_at
from core.operations_route_manifest_day_fact fact;

revoke all on public.operations_route_manifest_day_fact_v from public, anon;
revoke all on public.operations_route_manifest_day_fact_v from authenticated;
grant select on public.operations_route_manifest_day_fact_v to service_role;

-- This metadata-only repair never changes the original collection or ingest
-- timestamps and never re-promotes an older manifest into the live snapshot.
create or replace function public.backfill_operations_manifest_collection_pace_metadata(
  p_artifact_id uuid,
  p_completed_stop_count integer,
  p_open_stop_count integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_updated integer := 0;
begin
  if p_completed_stop_count < 0 or p_open_stop_count < 0 then
    raise exception 'Manifest pace counts cannot be negative.';
  end if;

  update core.operations_collection_artifact artifact
  set ingest_metadata_json = jsonb_set(
        jsonb_set(
          coalesce(artifact.ingest_metadata_json, '{}'::jsonb),
          '{ingest,completed_stop_count}',
          to_jsonb(p_completed_stop_count),
          true
        ),
        '{ingest,open_stop_count}',
        to_jsonb(p_open_stop_count),
        true
      ),
      updated_at = now()
  where artifact.id = p_artifact_id
    and artifact.artifact_status = 'INGESTED'
    and upper(coalesce(
      artifact.runner_artifact_json ->> 'artifact_key', ''
    )) = 'DELIVERY_MANIFEST'
    and artifact.storage_bucket is not null
    and artifact.storage_path is not null
    and artifact.ingest_metadata_json #>> '{ingest,completed_stop_count}' is null;
  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

create or replace function public.materialize_operations_route_manifest_day_facts(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_transformed integer := 0;
begin
  with route_groups as (
    select distinct
      artifact.company_id,
      artifact.service_date,
      nullif(btrim(artifact.runner_artifact_json ->> 'route_key'), '') as route_key
    from core.operations_collection_artifact artifact
    where artifact.artifact_status = 'INGESTED'
      and artifact.service_date is not null
      and upper(coalesce(
        artifact.runner_artifact_json ->> 'artifact_key', ''
      )) = 'DELIVERY_MANIFEST'
      and nullif(btrim(artifact.runner_artifact_json ->> 'route_key'), '')
        is not null
      and (
        artifact.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
    order by artifact.service_date, artifact.company_id, route_key
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  ),
  source as (
    select
      artifact.company_id,
      artifact.service_date,
      nullif(btrim(artifact.runner_artifact_json ->> 'route_key'), '')
        as route_key,
      coalesce(
        case
          when coalesce(artifact.runner_artifact_json ->> 'downloaded_at', '')
            ~ '^\\d{4}-\\d{2}-\\d{2}T'
            then (artifact.runner_artifact_json ->> 'downloaded_at')::timestamptz
        end,
        case
          when coalesce(artifact.runner_artifact_json ->> 'captured_at', '')
            ~ '^\\d{4}-\\d{2}-\\d{2}T'
            then (artifact.runner_artifact_json ->> 'captured_at')::timestamptz
        end,
        artifact.ingest_completed_at,
        artifact.created_at
      ) as captured_at,
      case
        when coalesce(
          artifact.ingest_metadata_json #>> '{ingest,completed_stop_count}', ''
        ) ~ '^\\d+$'
          then (
            artifact.ingest_metadata_json #>> '{ingest,completed_stop_count}'
          )::integer
      end as completed_stop_count,
      case
        when coalesce(
          artifact.ingest_metadata_json #>> '{ingest,open_stop_count}', ''
        ) ~ '^\\d+$'
          then (
            artifact.ingest_metadata_json #>> '{ingest,open_stop_count}'
          )::integer
      end as open_stop_count,
      case
        when coalesce(
          artifact.ingest_metadata_json #>> '{ingest,inserted_stop_count}', ''
        ) ~ '^\\d+$'
          then (
            artifact.ingest_metadata_json #>> '{ingest,inserted_stop_count}'
          )::integer
      end as total_stop_count
    from core.operations_collection_artifact artifact
    join route_groups route
      on route.company_id = artifact.company_id
      and route.service_date = artifact.service_date
      and route.route_key = nullif(
        btrim(artifact.runner_artifact_json ->> 'route_key'), ''
      )
    where artifact.artifact_status = 'INGESTED'
      and upper(coalesce(
        artifact.runner_artifact_json ->> 'artifact_key', ''
      )) = 'DELIVERY_MANIFEST'
  ),
  receipts as (
    select
      source.*,
      lag(source.captured_at) over (
        partition by source.company_id, source.service_date, source.route_key
        order by source.captured_at
      ) as prior_receipt_at
    from source
  ),
  receipt_summary as (
    select
      receipts.company_id,
      receipts.service_date,
      receipts.route_key,
      count(*)::integer as capture_count,
      count(*) filter (
        where receipts.completed_stop_count is not null
          and receipts.total_stop_count is not null
      )::integer as measured_capture_count,
      min(receipts.captured_at) as first_capture_at,
      max(receipts.captured_at) as last_capture_at,
      round((
        percentile_cont(0.5) within group (
          order by extract(epoch from (
            receipts.captured_at - receipts.prior_receipt_at
          )) / 60.0
        ) filter (where receipts.prior_receipt_at is not null)
      )::numeric, 1) as median_cadence_minutes
    from receipts
    group by receipts.company_id, receipts.service_date, receipts.route_key
  ),
  measured as (
    select
      source.*,
      lag(source.captured_at) over route_order as prior_captured_at,
      lag(source.completed_stop_count) over route_order
        as prior_completed_stop_count,
      row_number() over route_order as capture_sequence,
      count(*) over route_partition as measured_route_count
    from source
    where source.completed_stop_count is not null
      and source.total_stop_count is not null
    window
      route_partition as (
        partition by source.company_id, source.service_date, source.route_key
      ),
      route_order as (
        partition by source.company_id, source.service_date, source.route_key
        order by source.captured_at
      )
  ),
  points as (
    select
      measured.*,
      case
        when measured.prior_completed_stop_count is null then null
        else greatest(
          measured.completed_stop_count - measured.prior_completed_stop_count,
          0
        )
      end as completed_since_prior,
      case
        when measured.prior_captured_at is null then null
        else extract(epoch from (
          measured.captured_at - measured.prior_captured_at
        )) / 60.0
      end as minutes_since_prior
    from measured
  ),
  pace_summary as (
    select
      points.company_id,
      points.service_date,
      points.route_key,
      max(points.completed_stop_count)
        filter (where points.capture_sequence = 1)
        as initial_completed_stops,
      max(points.completed_stop_count)
        filter (where points.capture_sequence = points.measured_route_count)
        as final_completed_stops,
      max(points.open_stop_count)
        filter (where points.capture_sequence = points.measured_route_count)
        as final_open_stops,
      max(points.total_stop_count)
        filter (where points.capture_sequence = points.measured_route_count)
        as final_total_stops,
      sum(points.completed_since_prior)::integer as completed_stop_gain,
      sum(points.minutes_since_prior)::numeric(12, 1) as active_minutes,
      case
        when sum(points.minutes_since_prior) > 0
          then round(
            sum(points.completed_since_prior) /
              sum(points.minutes_since_prior) * 60.0,
            1
          )
      end as average_stops_per_hour,
      max(case
        when points.minutes_since_prior > 0
          then round(
            points.completed_since_prior / points.minutes_since_prior * 60.0,
            1
          )
      end) as peak_stops_per_hour,
      max(points.completed_since_prior)::integer as peak_completed_block,
      jsonb_agg(
        jsonb_build_object(
          'captured_at', points.captured_at,
          'completed_stops', points.completed_stop_count,
          'total_stops', points.total_stop_count,
          'completed_since_prior', points.completed_since_prior,
          'minutes_since_prior', case
            when points.minutes_since_prior is null then null
            else round(points.minutes_since_prior, 1)
          end,
          'stops_per_hour', case
            when points.minutes_since_prior > 0
              then round(
                points.completed_since_prior /
                  points.minutes_since_prior * 60.0,
                1
              )
            else null
          end
        )
        order by points.captured_at
      ) as intervals
    from points
    group by points.company_id, points.service_date, points.route_key
  )
  insert into core.operations_route_manifest_day_fact (
    company_id,
    service_date,
    route_key,
    capture_count,
    measured_capture_count,
    first_capture_at,
    last_capture_at,
    median_cadence_minutes,
    initial_completed_stops,
    final_completed_stops,
    final_open_stops,
    final_total_stops,
    completed_stop_gain,
    active_minutes,
    average_stops_per_hour,
    peak_stops_per_hour,
    peak_completed_block,
    pace_summary_json,
    transformed_at,
    updated_at
  )
  select
    receipt.company_id,
    receipt.service_date,
    receipt.route_key,
    receipt.capture_count,
    receipt.measured_capture_count,
    receipt.first_capture_at,
    receipt.last_capture_at,
    receipt.median_cadence_minutes,
    pace.initial_completed_stops,
    pace.final_completed_stops,
    pace.final_open_stops,
    pace.final_total_stops,
    pace.completed_stop_gain,
    pace.active_minutes,
    pace.average_stops_per_hour,
    pace.peak_stops_per_hour,
    pace.peak_completed_block,
    jsonb_build_object(
      'version', 1,
      'timezone', 'America/New_York',
      'capture_count', receipt.capture_count,
      'measured_capture_count', receipt.measured_capture_count,
      'first_capture_at', receipt.first_capture_at,
      'last_capture_at', receipt.last_capture_at,
      'median_cadence_minutes', receipt.median_cadence_minutes,
      'initial_completed_stops', pace.initial_completed_stops,
      'final_completed_stops', pace.final_completed_stops,
      'final_open_stops', pace.final_open_stops,
      'final_total_stops', pace.final_total_stops,
      'completed_stop_gain', pace.completed_stop_gain,
      'active_minutes', pace.active_minutes,
      'average_stops_per_hour', pace.average_stops_per_hour,
      'peak_stops_per_hour', pace.peak_stops_per_hour,
      'peak_completed_block', pace.peak_completed_block,
      'intervals', coalesce(pace.intervals, '[]'::jsonb)
    ),
    now(),
    now()
  from receipt_summary receipt
  left join pace_summary pace
    on pace.company_id = receipt.company_id
    and pace.service_date = receipt.service_date
    and pace.route_key = receipt.route_key
  on conflict (company_id, service_date, route_key)
  do update set
    capture_count = excluded.capture_count,
    measured_capture_count = excluded.measured_capture_count,
    first_capture_at = excluded.first_capture_at,
    last_capture_at = excluded.last_capture_at,
    median_cadence_minutes = excluded.median_cadence_minutes,
    initial_completed_stops = excluded.initial_completed_stops,
    final_completed_stops = excluded.final_completed_stops,
    final_open_stops = excluded.final_open_stops,
    final_total_stops = excluded.final_total_stops,
    completed_stop_gain = excluded.completed_stop_gain,
    active_minutes = excluded.active_minutes,
    average_stops_per_hour = excluded.average_stops_per_hour,
    peak_stops_per_hour = excluded.peak_stops_per_hour,
    peak_completed_block = excluded.peak_completed_block,
    pace_summary_json = excluded.pace_summary_json,
    transformed_at = excluded.transformed_at,
    updated_at = now();
  get diagnostics v_transformed = row_count;

  return jsonb_build_object(
    'transformed_route_day_count', v_transformed,
    'transformed_at', now()
  );
end;
$$;

revoke all on function public.backfill_operations_manifest_collection_pace_metadata(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.backfill_operations_manifest_collection_pace_metadata(
  uuid, integer, integer
) to service_role;

revoke all on function public.materialize_operations_route_manifest_day_facts(integer)
  from public, anon, authenticated;
grant execute on function public.materialize_operations_route_manifest_day_facts(integer)
  to service_role;

-- Raw delivery files cannot drain until both package facts and the route/day
-- statistical summary exist.
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
set search_path = pg_catalog, public, core
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
    where (
      artifact.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now()
      and (
        artifact.manifest_type <> 'delivery'
        or (
          exists (
            select 1
            from core.operations_route_manifest_day_fact day_fact
            where day_fact.company_id = artifact.company_id
              and day_fact.service_date = artifact.service_date
              and day_fact.route_key = artifact.route_key
          )
          and not exists (
            select 1
            from core.operations_delivery_manifest_package package
            where package.source_artifact_id = artifact.id
              and (
                package.tracking_ref is null
                or package.tracking_ref_version is null
                or not exists (
                  select 1
                  from core.operations_route_package_fact fact
                  where fact.company_id = package.company_id
                    and fact.service_date = package.service_date
                    and fact.route_key = package.route_key
                    and fact.tracking_ref = package.tracking_ref
                )
              )
          )
        )
      )

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
      and (
        artifact.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
      and (
        upper(coalesce(artifact.report_family_key, '')) = 'FCC'
        or upper(coalesce(
          artifact.runner_artifact_json ->> 'artifact_key', ''
        )) in ('COMBINED_MANIFEST', 'PICKUP_MANIFEST')
        or (
          upper(coalesce(
            artifact.runner_artifact_json ->> 'artifact_key', ''
          )) = 'DELIVERY_MANIFEST'
          and exists (
            select 1
            from core.operations_route_manifest_day_fact day_fact
            where day_fact.company_id = artifact.company_id
              and day_fact.service_date = artifact.service_date
              and day_fact.route_key = nullif(btrim(
                artifact.runner_artifact_json ->> 'route_key'
              ), '')
          )
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

revoke all on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  from public, anon, authenticated;
grant execute on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  to service_role;

comment on table core.operations_route_manifest_day_fact is
  'One durable de-identified statistical manifest summary per company, service date, and route.';
comment on function public.materialize_operations_route_manifest_day_facts(integer) is
  'Collapses measured delivery manifest receipts into one route/day pace JSON record before raw artifacts drain.';
comment on function public.backfill_operations_manifest_collection_pace_metadata(uuid, integer, integer) is
  'Adds sanitized completed/open stop counts to a retained delivery receipt without changing collection timestamps or live manifest authority.';

commit;
