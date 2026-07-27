begin;

create or replace function core.mark_runner_schedule_pending()
returns trigger
language plpgsql
set search_path to 'public', 'core'
as $$
begin
  if new.config_version > old.config_version then
    new.runner_state := 'PENDING';
  end if;
  return new;
end;
$$;

drop trigger if exists operations_runner_schedule_pending_trg
  on core.operations_runner_schedule;
create trigger operations_runner_schedule_pending_trg
before update on core.operations_runner_schedule
for each row execute function core.mark_runner_schedule_pending();

create or replace function core.broadcast_runner_schedule_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'core', 'realtime'
as $$
begin
  perform realtime.broadcast_changes(
    'runner-control:' || coalesce(new.runner_key, old.runner_key),
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists operations_runner_schedule_broadcast_trg
  on core.operations_runner_schedule;
create trigger operations_runner_schedule_broadcast_trg
after insert or update or delete on core.operations_runner_schedule
for each row execute function core.broadcast_runner_schedule_change();

commit;
