begin;

-- Report staging, finalized imports, payroll fact rebuilds, supersession, and
-- mileage healing are controlled mutations. Authorized application routes,
-- Cron, and artifact processors perform them through the service role.
do $$
declare
  target record;
  affected_count integer := 0;
  target_names constant text[] := array[
    'apply_operations_mileage_heal',
    'import_operations_dsw_finalized_day',
    'rebuild_payroll_activity_fact',
    'stage_operations_dro_report',
    'stage_operations_dsw_report',
    'stage_operations_dsw_summary_rows',
    'stage_operations_fcc_report',
    'supersede_operations_report_batch'
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

  if affected_count <> 9 then
    raise exception
      'Expected 9 report-ingest SECURITY DEFINER overloads, found %',
      affected_count;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
