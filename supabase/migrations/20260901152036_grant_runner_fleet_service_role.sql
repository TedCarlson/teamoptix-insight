begin;

-- Security-invoker views still require privileges on their underlying tables.
-- The first control-plane migration intentionally granted platform-owner reads
-- to authenticated users, but omitted the server-side service role used by the
-- Team Optix fleet page and command acknowledgement lookup.
grant select on core.operations_runner to service_role;
grant select on core.operations_runner_alias to service_role;
grant select on core.operations_runner_assignment to service_role;
grant select on core.operations_runner_command to service_role;

notify pgrst, 'reload schema';

commit;
