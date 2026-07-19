-- Make PREVIOUS_DAY_CLOSE failures describe the failed handoff precisely.
-- The ticket date tells the runner what to select; DSW A1 remains the sole
-- ingestion authority for the workbook's business date and FINAL class.

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
  v_detected_dates text;
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
    ) then
      v_status := 'FAILED';
      v_error := format(
        'Previous-day close failed: the runner returned no DSW workbook for ticket service date %s.',
        coalesce(v_service_date::text, 'UNKNOWN')
      );
    elsif exists (
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and (
          a.report_family_key is distinct from 'DSW'
          or a.artifact_status is distinct from 'INGESTED'
          or coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') = ''
        )
    ) then
      v_status := 'FAILED';
      v_error := format(
        'Previous-day close failed: the DSW workbook for %s did not complete ingestion with a report batch.',
        coalesce(v_service_date::text, 'UNKNOWN')
      );
    elsif exists (
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and (
          a.ingest_metadata_json #>> '{ingest,service_date}' is distinct from v_service_date::text
          or a.ingest_metadata_json #>> '{ingest,snapshot_kind}' is distinct from 'FINAL'
        )
    ) then
      select string_agg(
        distinct coalesce(a.ingest_metadata_json #>> '{ingest,service_date}', 'UNKNOWN'),
        ', '
      )
      into v_detected_dates
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE';

      v_status := 'FAILED';
      v_error := format(
        'Previous-day close failed: ticket requested %s, but DSW A1 reported %s. The runner must select the ticket date before downloading; ingestion will not rewrite A1.',
        coalesce(v_service_date::text, 'UNKNOWN'),
        coalesce(v_detected_dates, 'UNKNOWN')
      );
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
