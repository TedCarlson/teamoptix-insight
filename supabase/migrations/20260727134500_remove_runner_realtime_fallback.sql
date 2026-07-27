begin;

drop trigger if exists operations_runner_schedule_broadcast_trg
  on core.operations_runner_schedule;
drop function if exists core.broadcast_runner_schedule_change();

drop policy if exists operations_runner_service_receive
  on realtime.messages;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'core'
      and tablename = 'operations_runner_schedule'
  ) then
    alter publication supabase_realtime
      drop table core.operations_runner_schedule;
  end if;
end
$$;

commit;
