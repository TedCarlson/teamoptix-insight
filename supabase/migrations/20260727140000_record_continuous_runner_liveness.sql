begin;

-- The terminal receipt is already the runner's one database write per cycle.
-- Fold liveness into that transaction instead of adding a heartbeat RPC.
create or replace function core.record_continuous_runner_liveness()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'core'
as $$
begin
  if coalesce(new.request_payload ->> 'source', '') <> 'continuous_runner'
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
      'last_cycle_receipt_contract',
        coalesce(new.output_receipt_json ->> 'contract', '')
    ),
    updated_at = now()
  where runner_key = trim(new.claimed_by);

  return new;
end;
$$;

drop trigger if exists operations_collection_continuous_runner_liveness_trg
  on core.operations_collection_request;
create trigger operations_collection_continuous_runner_liveness_trg
after insert or update of request_status, error_message
on core.operations_collection_request
for each row execute function core.record_continuous_runner_liveness();

notify pgrst, 'reload schema';

commit;
