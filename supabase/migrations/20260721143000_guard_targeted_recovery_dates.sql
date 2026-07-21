-- Targeted recovery is strictly historical: prior dates only, bounded to the
-- most recent 12 months. Cancel any active request that predates this guardrail
-- so a bad date cannot continue holding the single runner lane.

update core.operations_collection_request
set
  request_status = 'CANCELLED',
  claimed_by = null,
  completed_at = now(),
  error_message = case
    when service_date >= (now() at time zone 'America/New_York')::date
      then 'Cancelled: targeted recovery only accepts prior service dates; today and future dates are not allowed.'
    else 'Cancelled: targeted recovery is limited to service dates within the last 12 months.'
  end,
  updated_at = now()
where request_type = 'TARGETED_RECOVERY'
  and request_status in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
  and (
    service_date is null
    or service_date >= (now() at time zone 'America/New_York')::date
    or service_date < ((now() at time zone 'America/New_York')::date - interval '12 months')::date
  );

create or replace function core.enforce_targeted_recovery_service_date()
returns trigger
language plpgsql
set search_path to 'core', 'public'
as $$
declare
  v_operational_date date := (now() at time zone 'America/New_York')::date;
  v_earliest_date date := ((now() at time zone 'America/New_York')::date - interval '12 months')::date;
begin
  if new.request_type <> 'TARGETED_RECOVERY'
    or new.request_status not in ('QUEUED', 'CLAIMED', 'RUNNING', 'ARTIFACTS_READY', 'INGESTING')
  then
    return new;
  end if;

  if new.service_date is null then
    raise exception 'Targeted recovery requires exactly one service_date.';
  end if;

  if new.service_date >= v_operational_date then
    raise exception 'Targeted recovery only accepts prior service dates; today and future dates are not allowed.';
  end if;

  if new.service_date < v_earliest_date then
    raise exception 'Targeted recovery is limited to service dates within the last 12 months.';
  end if;

  if new.service_date_start is not null or new.service_date_end is not null then
    raise exception 'Targeted recovery accepts one service_date and does not accept a date range.';
  end if;

  return new;
end;
$$;

drop trigger if exists operations_targeted_recovery_service_date_trg
on core.operations_collection_request;

create trigger operations_targeted_recovery_service_date_trg
before insert or update of request_type, request_status, service_date, service_date_start, service_date_end
on core.operations_collection_request
for each row
execute function core.enforce_targeted_recovery_service_date();

notify pgrst, 'reload schema';
