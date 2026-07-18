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
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
    ) or exists (
      select 1
      from core.operations_collection_artifact a
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
        select 1
        from core.operations_collection_artifact a
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

  select * into v_row
  from public.operations_collection_request_v
  where id = p_request_id;

  return v_row;
end;
$$;

revoke all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) from public;
grant all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) to authenticated;
grant all on function public.update_operations_collection_request_status(uuid, text, text, uuid, uuid[]) to service_role;

update core.operations_report_batch b
set
  status = 'FAILED',
  metadata_json = coalesce(b.metadata_json, '{}'::jsonb) || jsonb_build_object(
    'invalidated_reason',
    'Invalid automated previous-day close: the DSW batch did not provide a valid A1 activity date or was not FINAL.'
  ),
  updated_at = now()
where b.id in (
  select (a.ingest_metadata_json #>> '{ingest,batch_id}')::uuid
  from core.operations_collection_artifact a
  join core.operations_collection_request r
    on r.id = a.collection_request_id
  where r.request_type = 'PREVIOUS_DAY_CLOSE'
    and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and not (
      a.artifact_status = 'INGESTED'
      and a.report_family_key = 'DSW'
      and coalesce(a.ingest_metadata_json #>> '{ingest,service_date}', '') <> ''
      and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
    )
);

update core.operations_collection_request r
set
  request_status = 'FAILED',
  error_message = 'Previous-day close invalidated: stored DSW artifacts did not satisfy the A1 activity-date and FINAL batch contract.',
  updated_at = now()
where r.request_type = 'PREVIOUS_DAY_CLOSE'
  and r.request_status = 'COMPLETE'
  and (
    not exists (
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = r.id
        and a.artifact_kind = 'REPORT_FILE'
    )
    or exists (
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = r.id
        and a.artifact_kind = 'REPORT_FILE'
        and not (
          a.artifact_status = 'INGESTED'
          and a.report_family_key = 'DSW'
          and coalesce(a.ingest_metadata_json #>> '{ingest,service_date}', '') <> ''
          and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
          and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') <> ''
        )
    )
    or exists (
      select 1
      from generate_series(
        coalesce(r.service_date_start, r.service_date),
        coalesce(r.service_date_end, r.service_date),
        interval '1 day'
      ) expected(service_date)
      where not exists (
        select 1
        from core.operations_collection_artifact a
        where a.collection_request_id = r.id
          and a.artifact_kind = 'REPORT_FILE'
          and a.report_family_key = 'DSW'
          and a.artifact_status = 'INGESTED'
          and a.ingest_metadata_json #>> '{ingest,service_date}' = expected.service_date::date::text
          and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
          and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') <> ''
      )
    )
  );
