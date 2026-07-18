alter table core.operations_collection_request
  add column if not exists output_receipt_json jsonb;

create or replace view public.operations_collection_request_v
with (security_invoker = true) as
select
  o.id,
  o.company_id,
  c.company_slug,
  o.request_type,
  o.request_status,
  o.priority,
  o.service_date,
  o.service_date_start,
  o.service_date_end,
  o.requested_reports,
  o.request_payload,
  o.claimed_by,
  o.claimed_at,
  o.started_at,
  o.completed_at,
  case
    when o.started_at is not null and o.completed_at is not null
      then extract(epoch from (o.completed_at - o.started_at))::integer * 1000
    else null::integer
  end as duration_ms,
  o.automation_run_id,
  o.report_batch_ids,
  o.error_message,
  o.created_by_profile_id,
  o.created_at,
  o.updated_at,
  coalesce(
    (o.output_receipt_json ->> 'report_count')::integer,
    report_stats.report_count,
    0
  )::integer as report_count,
  coalesce(
    (o.output_receipt_json ->> 'manifest_count')::integer,
    manifest_stats.manifest_count,
    0
  )::integer as manifest_count,
  coalesce(
    (o.output_receipt_json ->> 'route_count')::integer,
    manifest_stats.route_count,
    0
  )::integer as route_count,
  o.output_receipt_json
from core.operations_collection_request o
join core.companies c on c.id = o.company_id
left join lateral (
  select count(a.id)::integer as report_count
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id
    and a.artifact_kind = 'REPORT_FILE'
    and a.artifact_status = 'INGESTED'
) report_stats on true
left join lateral (
  select
    count(a.id)::integer as manifest_count,
    count(distinct a.route_key)::integer as route_count
  from core.operations_manifest_capture_plan p
  join core.operations_manifest_artifact a on a.capture_plan_id = p.id
  where p.company_id = o.company_id
    and p.metadata_json ->> 'source_collection_request_id' = o.id::text
) manifest_stats on true;

grant select on table public.operations_collection_request_v to authenticated;
grant all on table public.operations_collection_request_v to service_role;

create or replace function public.capture_operations_collection_request_receipt(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_receipt jsonb;
begin
  select jsonb_build_object(
    'captured_at', now(),
    'report_count', (
      select count(a.id)::integer
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and a.artifact_status = 'INGESTED'
    ),
    'manifest_count', (
      select count(a.id)::integer
      from core.operations_manifest_capture_plan p
      join core.operations_manifest_artifact a on a.capture_plan_id = p.id
      where p.metadata_json ->> 'source_collection_request_id' = p_request_id::text
    ),
    'route_count', (
      select count(distinct a.route_key)::integer
      from core.operations_manifest_capture_plan p
      join core.operations_manifest_artifact a on a.capture_plan_id = p.id
      where p.metadata_json ->> 'source_collection_request_id' = p_request_id::text
    ),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'artifact_id', a.id,
        'family', a.report_family_key,
        'service_date', a.service_date,
        'status', a.artifact_status,
        'source_hash', a.source_hash,
        'storage_bucket', a.storage_bucket,
        'storage_path', a.storage_path,
        'report_batch_id', a.report_batch_id,
        'runner_key', a.runner_key
      ) order by a.created_at)
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and a.artifact_status = 'INGESTED'
    ), '[]'::jsonb),
    'manifests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'artifact_id', a.id,
        'route_key', a.route_key,
        'manifest_type', a.manifest_type,
        'service_date', a.service_date,
        'status', a.artifact_status,
        'source_hash', a.source_hash,
        'storage_bucket', a.storage_bucket,
        'storage_path', a.storage_path,
        'runner_key', a.runner_key
      ) order by a.route_key, a.manifest_type)
      from core.operations_manifest_capture_plan p
      join core.operations_manifest_artifact a on a.capture_plan_id = p.id
      where p.metadata_json ->> 'source_collection_request_id' = p_request_id::text
    ), '[]'::jsonb)
  ) into v_receipt;

  update core.operations_collection_request
  set output_receipt_json = v_receipt,
      updated_at = now()
  where id = p_request_id
    and output_receipt_json is null;

  select output_receipt_json into v_receipt
  from core.operations_collection_request
  where id = p_request_id;

  return v_receipt;
end;
$$;

revoke all on function public.capture_operations_collection_request_receipt(uuid) from public;
grant all on function public.capture_operations_collection_request_receipt(uuid) to service_role;

create or replace function public.update_operations_collection_request_status(
  p_request_id uuid,
  p_request_status text,
  p_error_message text default null,
  p_automation_run_id uuid default null,
  p_report_batch_ids uuid[] default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_collection_request_v;
  v_status text := p_request_status;
  v_error text := p_error_message;
  v_request_type text;
  v_service_date date;
  v_service_date_start date;
  v_service_date_end date;
begin
  select request_type, service_date, service_date_start, service_date_end
  into v_request_type, v_service_date, v_service_date_start, v_service_date_end
  from core.operations_collection_request
  where id = p_request_id;

  if v_status = 'COMPLETE' and v_request_type = 'PREVIOUS_DAY_CLOSE' then
    if not exists (
      select 1 from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id and a.artifact_kind = 'REPORT_FILE'
    ) or exists (
      select 1 from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and not (
          a.artifact_status = 'INGESTED'
          and a.report_family_key = 'DSW'
          and coalesce(a.ingest_metadata_json #>> '{ingest,service_date}', '') <> ''
          and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
          and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') <> ''
        )
    ) or exists (
      select 1
      from generate_series(
        coalesce(v_service_date_start, v_service_date),
        coalesce(v_service_date_end, v_service_date),
        interval '1 day'
      ) expected(service_date)
      where not exists (
        select 1 from core.operations_collection_artifact a
        where a.collection_request_id = p_request_id
          and a.artifact_kind = 'REPORT_FILE'
          and a.report_family_key = 'DSW'
          and a.artifact_status = 'INGESTED'
          and a.ingest_metadata_json #>> '{ingest,service_date}' = expected.service_date::date::text
          and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
          and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') <> ''
      )
    ) then
      v_status := 'FAILED';
      v_error := 'Previous-day close failed: ingested DSW A1 dates must cover the ticket range and produce FINAL report batches.';
    end if;
  end if;

  update core.operations_collection_request
  set
    request_status = v_status,
    started_at = case when v_status = 'RUNNING' and started_at is null then now() else started_at end,
    completed_at = case when v_status in ('COMPLETE', 'FAILED', 'CANCELLED') then now() else completed_at end,
    error_message = case when v_error is not null then v_error else error_message end,
    automation_run_id = coalesce(p_automation_run_id, automation_run_id),
    report_batch_ids = coalesce(p_report_batch_ids, report_batch_ids),
    updated_at = now()
  where id = p_request_id;

  if v_status in ('COMPLETE', 'FAILED', 'CANCELLED') then
    perform public.capture_operations_collection_request_receipt(p_request_id);
  end if;

  select * into v_row
  from public.operations_collection_request_v
  where id = p_request_id;

  return v_row;
end;
$$;

revoke all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) from public;
grant all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) to authenticated;
grant all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) to service_role;

do $$
declare
  v_request record;
begin
  for v_request in
    select id
    from core.operations_collection_request
    where request_status in ('COMPLETE', 'FAILED', 'CANCELLED')
      and output_receipt_json is null
      and not (
        request_type = 'PREVIOUS_DAY_CLOSE'
        and (
          service_date is null
          or service_date_start is not null
          or service_date_end is not null
        )
      )
    order by completed_at desc nulls last
  loop
    perform public.capture_operations_collection_request_receipt(v_request.id);
  end loop;
end;
$$;
