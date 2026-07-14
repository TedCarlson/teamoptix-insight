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
  v_skipped_count integer := 0;
begin
  for v_artifact in
    select *
    from public.operations_collection_artifact_v
    where artifact_kind = 'REPORT_FILE'
      and normalized_filename in (
        'Delivery Manifest.xlsx',
        'Pickup Manifest.xlsx'
      )
      and (
        artifact_status = 'READY_FOR_INGEST'
        or (
          artifact_status = 'FAILED'
          and ingest_metadata_json ->> 'source' = 'cron_artifact_ingest'
          and (
            error_message = 'FCC Header and Work Area Details sheets were not detected.'
            or error_message = 'FCC artifact is missing service date.'
          )
        )
      )
      and (p_collection_request_id is null or collection_request_id = p_collection_request_id)
    order by
      service_date nulls last,
      created_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 250))
  loop
    v_manifest_type := case
      when v_artifact.normalized_filename = 'Delivery Manifest.xlsx' then 'delivery'
      when v_artifact.normalized_filename = 'Pickup Manifest.xlsx' then 'pickup'
      else null
    end;

    v_effective_service_date := coalesce(
      v_artifact.service_date,
      nullif(substring(v_artifact.storage_path from 'service_date=(\d{4}-\d{2}-\d{2})'), '')::date,
      case
        when v_artifact.original_filename ~ '^\d{8}_'
          then to_date(substring(v_artifact.original_filename from '^(\d{8})_'), 'YYYYMMDD')
        when v_artifact.original_filename ~ '^PM\d{8}_'
          then to_date(substring(v_artifact.original_filename from '^PM(\d{8})_'), 'YYYYMMDD')
        else null
      end
    );

    v_route_key := case
      when v_manifest_type = 'delivery'
        then substring(v_artifact.original_filename from '^\d{8}_(\d{3,4})(?:\s+|_)')
      when v_manifest_type = 'pickup'
        then substring(v_artifact.original_filename from '^PM\d{8}_[^_]+_(\d{3,4})\.xls$')
      else null
    end;

    if v_route_key is not null then
      v_route_key := ltrim(v_route_key, '0');
    end if;

    if v_manifest_type is null
      or v_effective_service_date is null
      or nullif(v_route_key, '') is null
    then
      update core.operations_collection_artifact
      set
        artifact_status = 'FAILED',
        error_message = 'Unable to infer manifest type, service date, or route key for promotion.',
        ingest_metadata_json = coalesce(ingest_metadata_json, '{}'::jsonb) || jsonb_build_object(
          'source', 'promote_operations_collection_manifest_artifacts',
          'failed_at', now(),
          'reason', 'UNABLE_TO_INFER_MANIFEST_ROUTE_OR_DATE',
          'candidate_original_filename', v_artifact.original_filename,
          'candidate_storage_path', v_artifact.storage_path
        ),
        updated_at = now()
      where id = v_artifact.id;

      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    v_route_label := case
      when v_manifest_type = 'delivery'
        then regexp_replace(v_artifact.original_filename, '^\d{8}_\d{3,4}(\s+|_)', '')
      when v_manifest_type = 'pickup'
        then 'WA ' || v_route_key
      else v_route_key
    end;

    v_route_label := regexp_replace(v_route_label, '\.xls$', '', 'i');

    select p.id
    into v_plan_id
    from core.operations_manifest_capture_plan p
    where p.company_id = v_artifact.company_id
      and p.service_date = v_effective_service_date
      and p.metadata_json ->> 'source_collection_request_id' = v_artifact.collection_request_id::text
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
        'Promoted from operations collection artifacts.',
        jsonb_build_object(
          'source', 'promote_operations_collection_manifest_artifacts',
          'source_collection_request_id', v_artifact.collection_request_id,
          'company_slug', v_artifact.company_slug
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
      coalesce(nullif(v_route_label, ''), v_route_key),
      'ARTIFACTS_READY',
      'collection_artifact_promotion',
      true,
      true,
      false,
      jsonb_build_object(
        'source', 'promote_operations_collection_manifest_artifacts',
        'source_collection_request_id', v_artifact.collection_request_id
      )
    )
    on conflict (capture_plan_id, route_key)
    do update set
      route_status = case
        when core.operations_manifest_capture_plan_route.route_status in ('QUEUED', 'RUNNING', 'PARTIAL')
          then 'ARTIFACTS_READY'
        else core.operations_manifest_capture_plan_route.route_status
      end,
      route_label = coalesce(nullif(excluded.route_label, ''), core.operations_manifest_capture_plan_route.route_label),
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
        'runner_artifact_json', coalesce(v_artifact.runner_artifact_json, '{}'::jsonb),
        'effective_service_date', v_effective_service_date,
        'recovered_from_collection_status', v_artifact.artifact_status
      )
    );

    update core.operations_collection_artifact
    set
      artifact_status = 'IGNORED',
      ingest_metadata_json = coalesce(ingest_metadata_json, '{}'::jsonb) || jsonb_build_object(
        'source', 'promote_operations_collection_manifest_artifacts',
        'promoted_at', now(),
        'manifest_capture_plan_id', v_plan_id,
        'manifest_capture_plan_route_id', v_route_id,
        'manifest_type', v_manifest_type,
        'effective_service_date', v_effective_service_date
      ),
      error_message = null,
      updated_at = now()
    where id = v_artifact.id;

    v_promoted_count := v_promoted_count + 1;
  end loop;

  return jsonb_build_object(
    'promoted_count', v_promoted_count,
    'skipped_count', v_skipped_count
  );
end;
$$;

revoke all on function public.promote_operations_collection_manifest_artifacts(uuid, integer) from public;
grant all on function public.promote_operations_collection_manifest_artifacts(uuid, integer) to service_role;
