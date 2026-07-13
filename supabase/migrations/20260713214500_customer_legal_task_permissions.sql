begin;

grant usage on schema legal to authenticated;
grant usage on schema legal to service_role;

grant select, insert, update on table legal.customer_legal_task to authenticated;
grant all on table legal.customer_legal_task to service_role;

grant execute on function legal.upsert_customer_legal_task_for_version(uuid) to authenticated;
grant execute on function legal.upsert_customer_legal_task_for_version(uuid) to service_role;

grant all on table public.legal_customer_legal_task_v to authenticated;
grant all on table public.legal_customer_legal_task_v to service_role;

notify pgrst, 'reload schema';

commit;
