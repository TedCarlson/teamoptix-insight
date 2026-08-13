-- Collection and ingestion remain separate state machines.
--
-- The runner owns source interaction and byte persistence evidence. It does
-- not decide whether a stored workbook is valid. Artifact processors own
-- payload identity, validation, success/failure, retries, and elapsed time.

-- Terminal source exceptions remain in output_receipt_json and the runtime
-- event ledger as collection-health evidence. They must not overwrite the
-- request error used by the ingestion lifecycle.
drop trigger if exists operations_terminal_exception_classification_trg
  on core.operations_collection_request;

-- Automatic mileage healing scans historical DSW rows. Never run that scan
-- inside an in-day collection ingest; final-day ingestion is its only
-- synchronous boundary.
drop trigger if exists operations_automatic_mileage_policy_trg
  on core.operations_report_batch;
create constraint trigger operations_automatic_mileage_policy_trg
after insert on core.operations_report_batch
deferrable initially deferred
for each row
when (
  new.report_family_key = 'DSW'
  and new.snapshot_kind = 'FINAL'
  and new.status in ('LOADED', 'INGESTED')
)
execute function core.apply_automatic_mileage_policy_after_dsw();

-- Final-day DSW is the one ingest allowed to perform the bounded mileage
-- policy before returning. In-day ingestion retains the ordinary role limit.
alter function public.import_operations_dsw_finalized_day(
  uuid, date, text, text, text[], integer, uuid, jsonb, jsonb, jsonb
) set statement_timeout = '30s';

create or replace view public.operations_collection_request_v
with (security_invoker = true) as
select
  o.id, o.company_id, c.company_slug, o.request_type, o.request_status,
  o.priority, o.service_date, o.service_date_start, o.service_date_end,
  o.requested_reports, o.request_payload, o.claimed_by, o.claimed_at,
  o.started_at, o.completed_at,
  case when o.started_at is not null and o.completed_at is not null
    then extract(epoch from (o.completed_at - o.started_at))::integer * 1000
    else null::integer end as duration_ms,
  o.automation_run_id, o.report_batch_ids, o.error_message,
  o.created_by_profile_id, o.created_at, o.updated_at,
  coalesce((o.output_receipt_json ->> 'report_count')::integer, report_stats.report_count, 0)::integer as report_count,
  coalesce((o.output_receipt_json ->> 'manifest_count')::integer, manifest_stats.manifest_count, 0)::integer as manifest_count,
  coalesce((o.output_receipt_json ->> 'route_count')::integer, manifest_stats.route_count, 0)::integer as route_count,
  o.output_receipt_json,
  public.collection_request_lane_priority(o.request_type) as lane_priority,
  artifact_stats.registered_count,
  artifact_stats.ready_count,
  artifact_stats.ingesting_count,
  artifact_stats.ingested_count,
  artifact_stats.failed_count,
  case
    when nullif(upper(o.output_receipt_json #>> '{collection,health}'), '') is not null
      then upper(o.output_receipt_json #>> '{collection,health}')
    when upper(coalesce(o.output_receipt_json ->> 'outcome', '')) in ('FAILED', 'CANCELLED', 'INTERRUPTED')
      then 'FAILED'
    when jsonb_typeof(o.output_receipt_json -> 'exceptions') = 'object'
      then 'EXCEPTIONS'
    when upper(coalesce(o.output_receipt_json ->> 'outcome', '')) = 'COMPLETE'
      then 'HEALTHY'
    else 'PENDING'
  end as collection_health,
  coalesce(
    nullif(o.output_receipt_json #>> '{timing,completed_at}', '')::timestamptz,
    nullif(o.output_receipt_json ->> 'runner_completed_at', '')::timestamptz
  ) as collection_completed_at,
  case
    when upper(coalesce(o.output_receipt_json #>> '{error,classification}', '')) in ('COLLECTION', 'AUTHENTICATION')
      then nullif(o.output_receipt_json #>> '{error,message}', '')
    else null
  end as collection_error_message,
  nullif(o.output_receipt_json #>> '{exceptions,summary}', '') as collection_exception_message,
  case
    when artifact_stats.registered_count = 0 then 'NOT_STARTED'
    when artifact_stats.ingesting_count > 0 then 'INGESTING'
    when artifact_stats.ready_count > 0 then 'QUEUED'
    when artifact_stats.failed_count > 0 and artifact_stats.ingested_count > 0 then 'PARTIAL'
    when artifact_stats.failed_count > 0 then 'FAILED'
    when artifact_stats.ingested_count = artifact_stats.registered_count then 'COMPLETE'
    else 'PENDING'
  end as ingestion_status,
  artifact_stats.ingestion_started_at,
  artifact_stats.ingestion_completed_at,
  case
    when artifact_stats.ingestion_started_at is not null
      and artifact_stats.ingestion_completed_at is not null
      then extract(epoch from (
        artifact_stats.ingestion_completed_at
        - artifact_stats.ingestion_started_at
      ))::integer * 1000
    else null::integer
  end as ingestion_duration_ms,
  artifact_stats.ingestion_error_message
from core.operations_collection_request o
join core.companies c on c.id = o.company_id
left join lateral (
  select count(a.id)::integer as report_count
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id and a.artifact_kind = 'REPORT_FILE'
    and a.artifact_status = 'INGESTED'
) report_stats on true
left join lateral (
  select count(a.id)::integer as manifest_count,
         count(distinct a.route_key)::integer as route_count
  from core.operations_manifest_capture_plan p
  join core.operations_manifest_artifact a on a.capture_plan_id = p.id
  where p.company_id = o.company_id
    and p.metadata_json ->> 'source_collection_request_id' = o.id::text
) manifest_stats on true
left join lateral (
  select count(*)::integer as registered_count,
         count(*) filter (where a.artifact_status in ('UPLOADED', 'READY_FOR_INGEST'))::integer as ready_count,
         count(*) filter (where a.artifact_status = 'INGESTING')::integer as ingesting_count,
         count(*) filter (where a.artifact_status in ('INGESTED', 'IGNORED'))::integer as ingested_count,
         count(*) filter (where a.artifact_status = 'FAILED')::integer as failed_count,
         min(a.ingest_started_at) as ingestion_started_at,
         max(a.ingest_completed_at) as ingestion_completed_at,
         (array_agg(a.error_message order by a.updated_at desc)
           filter (where nullif(trim(coalesce(a.error_message, '')), '') is not null))[1]
           as ingestion_error_message
  from core.operations_collection_artifact a
  where a.collection_request_id = o.id
) artifact_stats on true;

grant select on table public.operations_collection_request_v to authenticated;
grant all on table public.operations_collection_request_v to service_role;
