-- A service date remains available through the entire seventh following
-- Eastern calendar day. It becomes eligible for transformation and purge at
-- the start of day eight. For example, 2026-08-18 remains available throughout
-- 2026-08-25 and expires at 2026-08-26 00:00 America/New_York.

create or replace function public.materialize_operations_route_last_delivery_facts(
  p_limit integer default 50000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  v_transformed integer := 0;
begin
  with latest_batches as (
    select distinct on (batch.company_id, batch.service_date)
      batch.id,
      batch.company_id,
      batch.service_date
    from core.operations_report_batch batch
    where upper(coalesce(batch.report_family_key, '')) = 'FCC'
      and batch.service_date is not null
      and (
        batch.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
    order by
      batch.company_id,
      batch.service_date,
      batch.created_at desc,
      batch.id desc
  ),
  source_rows as (
    select
      batch.company_id,
      batch.service_date,
      coalesce(
        nullif(raw.normalized_row_json ->> 'wa_number_normalized', ''),
        nullif(raw.normalized_row_json ->> 'wa_number', ''),
        nullif(raw.source_wa_number, ''),
        nullif(raw.source_route_key, '')
      ) as route_key,
      coalesce(
        nullif(raw.normalized_row_json ->> 'route_label', ''),
        nullif(raw.normalized_row_json ->> 'wa_number', ''),
        nullif(raw.source_route_key, ''),
        nullif(raw.source_wa_number, '')
      ) as route_label,
      nullif(raw.normalized_row_json ->> 'last_delivery_time', '')
        as last_delivery_time_local,
      substring(
        coalesce(raw.normalized_row_json ->> 'last_delivery_address', '')
        from '([0-9]{5})(?:-[0-9]{4})?'
      ) as last_delivery_postal_code,
      lower(coalesce(raw.normalized_row_json ->> 'deliveries_complete', ''))
        in ('true', 't', 'y', 'yes', '1', 'complete', 'completed')
        as deliveries_complete,
      raw.source_row_index
    from latest_batches batch
    join core.operations_report_raw_row raw on raw.batch_id = batch.id
    where nullif(raw.normalized_row_json ->> 'last_delivery_time', '') is not null
    order by batch.service_date, raw.source_row_index
    limit greatest(1, least(coalesce(p_limit, 50000), 250000))
  )
  insert into core.operations_route_last_delivery_fact (
    company_id,
    service_date,
    route_key,
    route_label,
    last_delivery_time_local,
    last_delivery_postal_code,
    deliveries_complete,
    transformed_at,
    updated_at
  )
  select distinct on (source.company_id, source.service_date, source.route_key)
    source.company_id,
    source.service_date,
    source.route_key,
    source.route_label,
    source.last_delivery_time_local,
    source.last_delivery_postal_code,
    source.deliveries_complete,
    now(),
    now()
  from source_rows source
  where source.route_key is not null
  order by
    source.company_id,
    source.service_date,
    source.route_key,
    source.source_row_index desc
  on conflict (company_id, service_date, route_key)
  do update set
    route_label = excluded.route_label,
    last_delivery_time_local = excluded.last_delivery_time_local,
    last_delivery_postal_code = excluded.last_delivery_postal_code,
    deliveries_complete = excluded.deliveries_complete,
    transformed_at = excluded.transformed_at,
    updated_at = now();
  get diagnostics v_transformed = row_count;

  return jsonb_build_object(
    'transformed_route_count', v_transformed,
    'transformed_at', now()
  );
end;
$$;

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
        or upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
          in ('COMBINED_MANIFEST', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST')
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
set search_path = pg_catalog, public, core
as $$
declare
  v_manifest_deleted integer := 0;
  v_collection_deleted integer := 0;
  v_plan_deleted integer := 0;
begin
  delete from core.operations_manifest_artifact artifact
  where artifact.id = any(coalesce(p_manifest_artifact_ids, '{}'::uuid[]))
    and (
      artifact.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now();
  get diagnostics v_manifest_deleted = row_count;

  delete from core.operations_collection_artifact artifact
  where artifact.id = any(coalesce(p_collection_artifact_ids, '{}'::uuid[]))
    and artifact.service_date is not null
    and (
      artifact.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now()
    and (
      upper(coalesce(artifact.report_family_key, '')) = 'FCC'
      or upper(coalesce(artifact.runner_artifact_json ->> 'artifact_key', ''))
        in ('COMBINED_MANIFEST', 'DELIVERY_MANIFEST', 'PICKUP_MANIFEST')
    );
  get diagnostics v_collection_deleted = row_count;

  delete from core.operations_manifest_capture_plan plan
  where (
      plan.service_date::timestamp at time zone 'America/New_York'
    ) + interval '8 days' <= now()
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
set search_path = pg_catalog, public, core
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
      and (
        batch.service_date::timestamp at time zone 'America/New_York'
      ) + interval '8 days' <= now()
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

revoke all on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  from public, anon, authenticated;
revoke all on function public.complete_operations_manifest_history_artifact_purge(uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.purge_operations_fcc_delivery_history(integer)
  from public, anon, authenticated;
revoke all on function public.materialize_operations_route_last_delivery_facts(integer)
  from public, anon, authenticated;

grant execute on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  to service_role;
grant execute on function public.complete_operations_manifest_history_artifact_purge(uuid[], uuid[])
  to service_role;
grant execute on function public.purge_operations_fcc_delivery_history(integer)
  to service_role;
grant execute on function public.materialize_operations_route_last_delivery_facts(integer)
  to service_role;

comment on function public.list_operations_manifest_history_artifacts_for_purge(integer)
  is 'Lists FCC and manifest source files after the full seventh following service day has ended.';
comment on function public.complete_operations_manifest_history_artifact_purge(uuid[], uuid[])
  is 'Deletes eligible manifest warehouse records only after their source files have been removed.';
comment on function public.purge_operations_fcc_delivery_history(integer)
  is 'Preserves date, route, delivery time, and five-digit ZIP before deleting FCC raw rows older than the inclusive seven-day reach.';
comment on function public.materialize_operations_route_last_delivery_facts(integer)
  is 'Transforms FCC route summaries into de-identified date, route, time, and ZIP facts after the inclusive seven-day reach.';
;
