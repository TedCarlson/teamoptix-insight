begin;

-- Runner 2.0 changed the request source discriminator from
-- `continuous_runner` to `continuous_runner_v2`. Keep collection liveness
-- anchored to collection-cycle lifecycle receipts for both contracts. Ingestion
-- remains a separate signal owned by the ingestion pipeline.
create or replace function core.record_continuous_runner_liveness()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
declare
  v_source text := trim(coalesce(new.request_payload ->> 'source', ''));
begin
  if v_source not in ('continuous_runner', 'continuous_runner_v2')
    or nullif(trim(coalesce(new.claimed_by, '')), '') is null
  then
    return new;
  end if;

  update core.operations_runner_schedule
  set
    runner_last_seen_at = now(),
    runner_state = case
      when new.request_status in ('FAILED', 'CANCELLED') then 'ERROR'
      when collection_enabled then 'IDLE'
      else 'DISABLED'
    end,
    runner_last_error = case
      when new.request_status in ('FAILED', 'CANCELLED')
        then nullif(trim(coalesce(new.error_message, '')), '')
      else null
    end,
    runner_metadata_json = runner_metadata_json || jsonb_build_object(
      'last_cycle_id', new.id,
      'last_cycle_request_type', new.request_type,
      'last_cycle_status', new.request_status,
      'last_cycle_completed_at', coalesce(new.completed_at, now()),
      'last_cycle_receipt_contract', coalesce(
        nullif(new.output_receipt_json ->> 'contract', ''),
        nullif(new.output_receipt_json #>> '{handoff,contract}', ''),
        ''
      )
    ),
    updated_at = now()
  where runner_key = trim(new.claimed_by);

  return new;
end;
$$;

-- Reconcile schedules that received valid Runner 2 terminal receipts while
-- the discriminator mismatch was present. Preserve the observed completion
-- time instead of manufacturing a heartbeat at migration time.
with latest_terminal as (
  select distinct on (request.claimed_by)
    request.claimed_by as runner_key,
    request.id,
    request.request_type,
    request.request_status,
    request.completed_at,
    request.error_message,
    request.output_receipt_json
  from core.operations_collection_request request
  where request.request_payload ->> 'source' = 'continuous_runner_v2'
    and request.request_status in ('COMPLETE', 'FAILED', 'CANCELLED')
    and request.completed_at is not null
    and nullif(trim(coalesce(request.claimed_by, '')), '') is not null
  order by request.claimed_by, request.completed_at desc
)
update core.operations_runner_schedule schedule
set
  runner_last_seen_at = greatest(
    coalesce(schedule.runner_last_seen_at, '-infinity'::timestamptz),
    terminal.completed_at
  ),
  runner_state = case
    when terminal.request_status in ('FAILED', 'CANCELLED') then 'ERROR'
    when schedule.collection_enabled then 'IDLE'
    else 'DISABLED'
  end,
  runner_last_error = case
    when terminal.request_status in ('FAILED', 'CANCELLED')
      then nullif(trim(coalesce(terminal.error_message, '')), '')
    else null
  end,
  runner_metadata_json = schedule.runner_metadata_json || jsonb_build_object(
    'last_cycle_id', terminal.id,
    'last_cycle_request_type', terminal.request_type,
    'last_cycle_status', terminal.request_status,
    'last_cycle_completed_at', terminal.completed_at,
    'last_cycle_receipt_contract', coalesce(
      nullif(terminal.output_receipt_json ->> 'contract', ''),
      nullif(terminal.output_receipt_json #>> '{handoff,contract}', ''),
      ''
    )
  ),
  updated_at = now()
from latest_terminal terminal
where schedule.runner_key = terminal.runner_key;

comment on function core.record_continuous_runner_liveness() is
  'Advances collection health from legacy and Runner 2 collection-cycle receipts; ingestion health remains independent.';

notify pgrst, 'reload schema';

commit;
