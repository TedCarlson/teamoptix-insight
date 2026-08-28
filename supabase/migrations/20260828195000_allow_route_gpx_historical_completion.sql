-- GPX-only route baseline passes reuse the governed historical date-range
-- runner, but they do not claim to be DSW sweeps. Keep the DSW A1 completion
-- guard intact for every other HISTORICAL_BACKFILL request.

create or replace function core.enforce_historical_sweep_completion_truth()
returns trigger
language plpgsql
set search_path to 'public', 'core'
as $$
declare
  v_detected_dates text;
begin
  if new.request_type <> 'HISTORICAL_BACKFILL'
    or new.request_status <> 'COMPLETE'
    or coalesce(new.request_payload ->> 'collect_scope', '') =
      'ROUTE_GPX_BASELINE'
  then
    return new;
  end if;

  if not exists (
    select 1
    from core.operations_collection_artifact a
    where a.collection_request_id = new.id
      and a.artifact_kind = 'REPORT_FILE'
      and a.report_family_key = 'DSW'
  ) then
    new.request_status := 'FAILED';
    new.error_message := format(
      'Historical sweep failed: the runner returned no DSW workbooks for %s through %s.',
      coalesce(new.service_date_start::text, 'UNKNOWN'),
      coalesce(new.service_date_end::text, 'UNKNOWN')
    );
    return new;
  end if;

  if exists (
    select 1
    from generate_series(
      new.service_date_start,
      new.service_date_end,
      interval '1 day'
    ) expected(service_date)
    where not exists (
      select 1
      from core.operations_collection_artifact a
      where a.collection_request_id = new.id
        and a.artifact_kind = 'REPORT_FILE'
        and a.report_family_key = 'DSW'
        and a.artifact_status = 'INGESTED'
        and a.ingest_metadata_json #>> '{ingest,service_date}' =
          expected.service_date::date::text
        and a.ingest_metadata_json #>> '{ingest,snapshot_kind}' = 'FINAL'
        and coalesce(a.ingest_metadata_json #>> '{ingest,batch_id}', '') <> ''
    )
  ) then
    select string_agg(
      distinct format(
        '%s (%s)',
        coalesce(
          a.ingest_metadata_json #>> '{ingest,service_date}',
          'UNKNOWN'
        ),
        coalesce(
          a.ingest_metadata_json #>> '{ingest,snapshot_kind}',
          'UNKNOWN'
        )
      ),
      ', '
    )
    into v_detected_dates
    from core.operations_collection_artifact a
    where a.collection_request_id = new.id
      and a.artifact_kind = 'REPORT_FILE'
      and a.report_family_key = 'DSW';

    new.request_status := 'FAILED';
    new.error_message := format(
      'Historical sweep failed: ticket requested %s through %s, but DSW A1 produced %s. Each date in the inclusive range must be selected before download and must ingest as FINAL.',
      coalesce(new.service_date_start::text, 'UNKNOWN'),
      coalesce(new.service_date_end::text, 'UNKNOWN'),
      coalesce(v_detected_dates, 'no accepted workbooks')
    );
  end if;

  return new;
end;
$$;

comment on function core.enforce_historical_sweep_completion_truth() is
  'Requires FINAL DSW A1 coverage for historical DSW sweeps; explicit ROUTE_GPX_BASELINE passes are reconciled from their GPX artifacts instead.';
