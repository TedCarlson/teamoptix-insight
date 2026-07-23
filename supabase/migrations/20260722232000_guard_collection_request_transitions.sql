-- Keep collection request state monotonic. Repeated status reports remain
-- idempotent and may add evidence, but cannot rewrite terminal timestamps.

create or replace function core.guard_operations_collection_request_transition()
returns trigger
language plpgsql
set search_path to 'public', 'core'
as $$
declare
  v_allowed boolean := false;
begin
  if new.request_status = old.request_status then
    if old.request_status in ('COMPLETE', 'FAILED', 'CANCELLED') then
      new.completed_at := old.completed_at;
    end if;
    return new;
  end if;

  v_allowed := case old.request_status
    when 'QUEUED' then new.request_status in ('CLAIMED', 'FAILED', 'CANCELLED')
    when 'CLAIMED' then new.request_status in ('RUNNING', 'FAILED', 'CANCELLED')
    when 'RUNNING' then new.request_status in ('ARTIFACTS_READY', 'COMPLETE', 'FAILED', 'CANCELLED')
    when 'ARTIFACTS_READY' then new.request_status in ('INGESTING', 'COMPLETE', 'FAILED', 'CANCELLED')
    when 'INGESTING' then new.request_status in ('COMPLETE', 'FAILED', 'CANCELLED')
    else false
  end;

  if not v_allowed then
    raise exception 'Illegal collection request transition: % -> % for request %',
      old.request_status, new.request_status, old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists z_operations_collection_request_transition_guard_trg
  on core.operations_collection_request;

-- The z-prefix intentionally runs this after the existing completion-truth
-- trigger has converted an invalid COMPLETE outcome to FAILED.
create trigger z_operations_collection_request_transition_guard_trg
before update of request_status on core.operations_collection_request
for each row
execute function core.guard_operations_collection_request_transition();

notify pgrst, 'reload schema';
