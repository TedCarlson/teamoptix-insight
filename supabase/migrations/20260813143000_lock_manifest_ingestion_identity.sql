begin;

-- The runner may identify the source lane and provide collection context, but
-- only the ingestion pipeline may persist manifest identity. This RPC keeps
-- core private while allowing the service-role ingestion worker to atomically
-- store Header-derived identity before promotion.
create or replace function public.prepare_operations_collection_manifest_artifact(
  p_artifact_id uuid,
  p_service_date date,
  p_original_filename text,
  p_normalized_filename text,
  p_runner_artifact_json jsonb,
  p_ingest_metadata_json jsonb
)
returns public.operations_collection_artifact_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_manifest_type text;
  v_row public.operations_collection_artifact_v;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_artifact_id is null or p_service_date is null then
    raise exception 'Artifact id and Header service date are required.';
  end if;

  if jsonb_typeof(coalesce(p_runner_artifact_json, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_ingest_metadata_json, 'null'::jsonb)) <> 'object'
  then
    raise exception 'Manifest identity metadata must be JSON objects.';
  end if;

  if p_runner_artifact_json ->> 'identity_authority' <> 'INGESTION_PIPELINE'
    or p_ingest_metadata_json ->> 'identity_authority' <> 'INGESTION_PIPELINE'
  then
    raise exception 'Manifest identity must be ingestion-authoritative.';
  end if;

  v_manifest_type := lower(trim(coalesce(
    p_runner_artifact_json ->> 'manifest_type',
    ''
  )));
  if v_manifest_type not in ('delivery', 'pickup') then
    raise exception 'Header manifest type must be delivery or pickup.';
  end if;

  if nullif(trim(coalesce(p_runner_artifact_json ->> 'route_key', '')), '') is null
    or nullif(trim(coalesce(p_runner_artifact_json ->> 'route_label', '')), '') is null
  then
    raise exception 'Header route identity is required.';
  end if;

  if coalesce(p_runner_artifact_json ->> 'service_date', '')
      <> p_service_date::text
  then
    raise exception 'Header service date does not match the prepared artifact.';
  end if;

  if nullif(trim(coalesce(p_original_filename, '')), '') is null
    or p_normalized_filename <> p_runner_artifact_json ->> 'canonical_filename'
    or p_normalized_filename !~* '\.xls$'
  then
    raise exception 'Canonical manifest filename must match Header identity and preserve the .xls transport.';
  end if;

  update core.operations_collection_artifact
  set
    service_date = p_service_date,
    original_filename = trim(p_original_filename),
    normalized_filename = p_normalized_filename,
    artifact_status = 'READY_FOR_INGEST',
    runner_artifact_json = p_runner_artifact_json,
    ingest_metadata_json = p_ingest_metadata_json,
    error_message = null,
    updated_at = now()
  where id = p_artifact_id;

  if not found then
    raise exception 'Collection artifact not found.';
  end if;

  select *
  into v_row
  from public.operations_collection_artifact_v
  where id = p_artifact_id;

  return v_row;
end;
$$;

revoke all on function public.prepare_operations_collection_manifest_artifact(
  uuid, date, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.prepare_operations_collection_manifest_artifact(
  uuid, date, text, text, jsonb, jsonb
) to service_role;

comment on function public.prepare_operations_collection_manifest_artifact(
  uuid, date, text, text, jsonb, jsonb
) is
  'Atomically persists ingestion-Header-authoritative manifest identity before promotion.';

-- Promotion consumes only identity already established by ingestion. Raw
-- runner filenames and runner collection context are never identity evidence.
create or replace function public.promote_operations_collection_manifest_artifacts(
  p_collection_request_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_artifact record;
  v_plan_id uuid;
  v_route_id uuid;
  v_manifest_type text;
  v_route_key text;
  v_route_label text;
  v_effective_service_date date;
  v_promoted_count integer := 0;
begin
  for v_artifact in
    select *
    from public.operations_collection_artifact_v
    where artifact_kind = 'REPORT_FILE'
      and artifact_status = 'READY_FOR_INGEST'
      and runner_artifact_json ->> 'identity_authority'
        = 'INGESTION_PIPELINE'
      and ingest_metadata_json ->> 'identity_authority'
        = 'INGESTION_PIPELINE'
      and lower(coalesce(runner_artifact_json ->> 'manifest_type', ''))
        in ('delivery', 'pickup')
      and nullif(trim(coalesce(runner_artifact_json ->> 'route_key', '')), '')
        is not null
      and coalesce(runner_artifact_json ->> 'service_date', '')
        ~ '^\d{4}-\d{2}-\d{2}$'
      and (
        p_collection_request_id is null
        or collection_request_id = p_collection_request_id
      )
    order by service_date nulls last, created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 250))
  loop
    v_manifest_type := lower(
      v_artifact.runner_artifact_json ->> 'manifest_type'
    );
    v_effective_service_date := (
      v_artifact.runner_artifact_json ->> 'service_date'
    )::date;
    v_route_key := trim(
      v_artifact.runner_artifact_json ->> 'route_key'
    );
    v_route_label := coalesce(
      nullif(trim(v_artifact.runner_artifact_json ->> 'route_label'), ''),
      'WA ' || v_route_key
    );

    select p.id
    into v_plan_id
    from core.operations_manifest_capture_plan p
    where p.company_id = v_artifact.company_id
      and p.service_date = v_effective_service_date
      and p.metadata_json ->> 'source_collection_request_id'
        = v_artifact.collection_request_id::text
    order by p.created_at asc
    limit 1;

    if v_plan_id is null then
      insert into core.operations_manifest_capture_plan (
        company_id,
        service_date,
        plan_status,
        collection_mode,
        manifest_types,
        skip_combined,
        priority,
        batch_label,
        created_reason,
        metadata_json
      )
      values (
        v_artifact.company_id,
        v_effective_service_date,
        'ARTIFACTS_READY',
        'full_active_route_set',
        array['delivery', 'pickup'],
        true,
        100,
        'collection-artifact-promotion',
        'Promoted from ingestion-authoritative collection artifacts.',
        jsonb_build_object(
          'source', 'promote_operations_collection_manifest_artifacts',
          'source_collection_request_id', v_artifact.collection_request_id,
          'company_slug', v_artifact.company_slug,
          'identity_authority', 'INGESTION_PIPELINE'
        )
      )
      returning id into v_plan_id;
    end if;

    insert into core.operations_manifest_capture_plan_route (
      capture_plan_id,
      company_id,
      service_date,
      route_key,
      route_label,
      route_status,
      selection_reason,
      delivery_manifest_requested,
      pickup_manifest_requested,
      combined_manifest_requested,
      metadata_json
    )
    values (
      v_plan_id,
      v_artifact.company_id,
      v_effective_service_date,
      v_route_key,
      v_route_label,
      'ARTIFACTS_READY',
      'collection_artifact_promotion',
      true,
      true,
      false,
      jsonb_build_object(
        'source', 'promote_operations_collection_manifest_artifacts',
        'source_collection_request_id', v_artifact.collection_request_id,
        'identity_authority', 'INGESTION_PIPELINE'
      )
    )
    on conflict (capture_plan_id, route_key)
    do update set
      route_status = case
        when core.operations_manifest_capture_plan_route.route_status
          in ('QUEUED', 'RUNNING', 'PARTIAL')
          then 'ARTIFACTS_READY'
        else core.operations_manifest_capture_plan_route.route_status
      end,
      route_label = excluded.route_label,
      updated_at = now()
    returning id into v_route_id;

    perform public.register_operations_manifest_artifact(
      v_plan_id,
      v_route_id,
      v_manifest_type,
      v_artifact.storage_bucket,
      v_artifact.storage_path,
      v_artifact.original_filename,
      v_artifact.normalized_filename,
      v_artifact.content_type,
      v_artifact.size_bytes,
      v_artifact.source_hash,
      v_artifact.runner_key,
      jsonb_build_object(
        'source', 'promote_operations_collection_manifest_artifacts',
        'source_collection_artifact_id', v_artifact.id,
        'source_collection_request_id', v_artifact.collection_request_id,
        'runner_artifact_json', v_artifact.runner_artifact_json,
        'effective_service_date', v_effective_service_date,
        'identity_authority', 'INGESTION_PIPELINE'
      )
    );

    update core.operations_collection_artifact
    set
      artifact_status = 'IGNORED',
      ingest_metadata_json = coalesce(
        ingest_metadata_json,
        '{}'::jsonb
      ) || jsonb_build_object(
        'source', 'promote_operations_collection_manifest_artifacts',
        'promoted_at', now(),
        'manifest_capture_plan_id', v_plan_id,
        'manifest_capture_plan_route_id', v_route_id,
        'manifest_type', v_manifest_type,
        'effective_service_date', v_effective_service_date,
        'identity_authority', 'INGESTION_PIPELINE'
      ),
      error_message = null,
      updated_at = now()
    where id = v_artifact.id;

    v_promoted_count := v_promoted_count + 1;
  end loop;

  return jsonb_build_object(
    'promoted_count', v_promoted_count,
    'skipped_count', 0
  );
end;
$$;

revoke all on function public.promote_operations_collection_manifest_artifacts(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.promote_operations_collection_manifest_artifacts(
  uuid, integer
) to service_role;

comment on function public.promote_operations_collection_manifest_artifacts(
  uuid, integer
) is
  'Promotes only manifest artifacts whose Header identity was persisted by the ingestion pipeline.';

commit;
