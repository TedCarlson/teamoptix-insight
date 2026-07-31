begin;

-- DRO is an independent, once-daily governed collection lane.
alter table core.operations_collection_request
  drop constraint if exists operations_collection_request_type_chk;
alter table core.operations_collection_request
  add constraint operations_collection_request_type_chk
  check (
    request_type = any (
      array[
        'PREVIOUS_DAY_CLOSE',
        'LAST_LOOK',
        'HISTORICAL_BACKFILL',
        'TARGETED_RECOVERY',
        'OPERATIONS_FEED',
        'OPERATIONS_PULSE',
        'DRO_AM'
      ]::text[]
    )
  );

-- The existing terminal recorder predates DRO_AM. Keep its established
-- transaction and artifact registration behavior, then promote the completed
-- request to the explicit DRO lane inside the same transaction.
create or replace function public.record_operations_dro_runner_cycle_terminal(
  p_runner_key text,
  p_cycle_id uuid,
  p_service_date date,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_outcome text,
  p_requested_reports text[],
  p_request_payload jsonb,
  p_receipt_json jsonb,
  p_artifacts_json jsonb default '[]'::jsonb,
  p_error_message text default null
)
returns public.operations_collection_request_v
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_row public.operations_collection_request_v;
begin
  select *
  into v_row
  from public.record_operations_runner_cycle_terminal(
    p_runner_key,
    p_cycle_id,
    'OPERATIONS_PULSE',
    p_service_date,
    p_started_at,
    p_completed_at,
    p_outcome,
    p_requested_reports,
    coalesce(p_request_payload, '{}'::jsonb)
      || jsonb_build_object('request_type', 'DRO_AM'),
    coalesce(p_receipt_json, '{}'::jsonb)
      || jsonb_build_object('request_type', 'DRO_AM'),
    p_artifacts_json,
    p_error_message
  );

  update core.operations_collection_request
  set
    request_type = 'DRO_AM',
    priority = 70,
    updated_at = now()
  where id = p_cycle_id;

  select *
  into v_row
  from public.operations_collection_request_v
  where id = p_cycle_id;

  return v_row;
end;
$$;

revoke all on function public.record_operations_dro_runner_cycle_terminal(
  text, uuid, date, timestamptz, timestamptz, text, text[],
  jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_operations_dro_runner_cycle_terminal(
  text, uuid, date, timestamptz, timestamptz, text, text[],
  jsonb, jsonb, jsonb, text
) to service_role;

-- DSW All Status Code Packages is a governed companion artifact, but it is
-- persisted as a package-status snapshot rather than an operations report
-- batch. Only the Daily Service workbook owns the FINAL report-batch contract.
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
        and upper(coalesce(
          a.runner_artifact_json ->> 'artifact_key', ''
        )) <> 'DSW_ALL_STATUS_CODE_PACKAGES'
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
        and upper(coalesce(
          a.runner_artifact_json ->> 'artifact_key', ''
        )) <> 'DSW_ALL_STATUS_CODE_PACKAGES'
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
        and upper(coalesce(
          a.runner_artifact_json ->> 'artifact_key', ''
        )) <> 'DSW_ALL_STATUS_CODE_PACKAGES'
        and (
          a.ingest_metadata_json #>> '{ingest,service_date}'
            is distinct from v_service_date::text
          or a.ingest_metadata_json #>> '{ingest,snapshot_kind}'
            is distinct from 'FINAL'
        )
    ) then
      select string_agg(
        distinct coalesce(
          a.ingest_metadata_json #>> '{ingest,service_date}', 'UNKNOWN'
        ),
        ', '
      )
      into v_detected_dates
      from core.operations_collection_artifact a
      where a.collection_request_id = p_request_id
        and a.artifact_kind = 'REPORT_FILE'
        and upper(coalesce(
          a.runner_artifact_json ->> 'artifact_key', ''
        )) <> 'DSW_ALL_STATUS_CODE_PACKAGES';

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
    started_at = case
      when v_status = 'RUNNING' and started_at is null then now()
      else started_at
    end,
    completed_at = case
      when v_status in ('COMPLETE', 'FAILED', 'CANCELLED') then now()
      else completed_at
    end,
    error_message = case
      when v_error is not null then v_error
      when v_status = 'COMPLETE' then null
      else error_message
    end,
    automation_run_id = coalesce(p_automation_run_id, automation_run_id),
    report_batch_ids = coalesce(p_report_batch_ids, report_batch_ids),
    updated_at = now()
  where id = p_request_id;

  if v_status in ('COMPLETE', 'FAILED', 'CANCELLED') then
    perform public.capture_operations_collection_request_receipt(p_request_id);
  end if;

  select *
  into v_row
  from public.operations_collection_request_v
  where id = p_request_id;

  return v_row;
end;
$$;

revoke all on function public.update_operations_collection_request_status(
  uuid, text, text, uuid, uuid[]
) from public;
grant all on function public.update_operations_collection_request_status(
  uuid, text, text, uuid, uuid[]
) to authenticated;
grant all on function public.update_operations_collection_request_status(
  uuid, text, text, uuid, uuid[]
) to service_role;

-- Repair only the false-negative close records produced by the invalid
-- companion-artifact batch requirement. The loaded report and snapshot rows
-- remain untouched.
--
-- The table lock taken by this transactional trigger change prevents another
-- request write from bypassing the monotonic transition guard while the known
-- false terminal state is reconciled.
drop trigger if exists z_operations_collection_request_transition_guard_trg
  on core.operations_collection_request;

do $$
declare
  v_request record;
  v_batch_ids uuid[];
begin
  for v_request in
    select request.id
    from core.operations_collection_request request
    where request.request_type = 'PREVIOUS_DAY_CLOSE'
      and request.request_status = 'FAILED'
      and request.error_message like
        'Previous-day close failed: the DSW workbook for % did not complete ingestion with a report batch.'
      and exists (
        select 1
        from core.operations_collection_artifact artifact
        where artifact.collection_request_id = request.id
          and artifact.artifact_kind = 'REPORT_FILE'
          and upper(coalesce(
            artifact.runner_artifact_json ->> 'artifact_key', ''
          )) <> 'DSW_ALL_STATUS_CODE_PACKAGES'
          and artifact.report_family_key = 'DSW'
          and artifact.artifact_status = 'INGESTED'
          and coalesce(
            artifact.ingest_metadata_json #>> '{ingest,batch_id}', ''
          ) <> ''
          and artifact.ingest_metadata_json #>> '{ingest,service_date}'
            = request.service_date::text
          and artifact.ingest_metadata_json #>> '{ingest,snapshot_kind}'
            = 'FINAL'
      )
      and not exists (
        select 1
        from core.operations_collection_artifact artifact
        where artifact.collection_request_id = request.id
          and artifact.artifact_kind = 'REPORT_FILE'
          and upper(coalesce(
            artifact.runner_artifact_json ->> 'artifact_key', ''
          )) <> 'DSW_ALL_STATUS_CODE_PACKAGES'
          and (
            artifact.report_family_key is distinct from 'DSW'
            or artifact.artifact_status is distinct from 'INGESTED'
            or coalesce(
              artifact.ingest_metadata_json #>> '{ingest,batch_id}', ''
            ) = ''
            or artifact.ingest_metadata_json #>> '{ingest,service_date}'
              is distinct from request.service_date::text
            or artifact.ingest_metadata_json #>> '{ingest,snapshot_kind}'
              is distinct from 'FINAL'
          )
      )
  loop
    select coalesce(array_agg(artifact.report_batch_id), '{}'::uuid[])
    into v_batch_ids
    from core.operations_collection_artifact artifact
    where artifact.collection_request_id = v_request.id
      and artifact.report_batch_id is not null;

    perform public.update_operations_collection_request_status(
      v_request.id,
      'COMPLETE',
      null,
      null,
      v_batch_ids
    );
  end loop;
end;
$$;

create trigger z_operations_collection_request_transition_guard_trg
before update of request_status on core.operations_collection_request
for each row
execute function core.guard_operations_collection_request_transition();

notify pgrst, 'reload schema';

commit;
