begin;

drop policy if exists operations_runner_service_receive
  on realtime.messages;
create policy operations_runner_service_receive
  on realtime.messages
  for select
  to service_role
  using (realtime.topic() like 'runner-control:%');

commit;
