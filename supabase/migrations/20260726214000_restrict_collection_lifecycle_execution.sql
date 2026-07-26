begin;

-- Collection artifacts and request lifecycle transitions are machine-owned.
-- Cron, runners, and explicitly authorized application routes use the service
-- role; signed-in users must not mutate this state through direct RPC calls.
do $$
declare
  target record;
  affected_count integer := 0;
  target_names constant text[] := array[
    'create_operations_manifest_capture_plan',
    'queue_operations_collection_recovery',
    'register_operations_collection_artifact',
    'update_operations_collection_artifact_status',
    'update_operations_collection_request_status'
  ];
begin
  for target in
    select procedure.oid::regprocedure as identity
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname = any(target_names)
      and has_function_privilege(
        'authenticated',
        procedure.oid,
        'EXECUTE'
      )
    order by procedure.proname, procedure.oid
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target.identity
    );
    execute format(
      'grant execute on function %s to service_role',
      target.identity
    );
    affected_count := affected_count + 1;
  end loop;

  if affected_count <> 5 then
    raise exception
      'Expected 5 collection lifecycle SECURITY DEFINER functions, found %',
      affected_count;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
