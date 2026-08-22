-- Run after 20260822120940_use_declared_contract_ranges_for_analytics.sql.
-- All fixtures are transaction-local and rolled back.

begin;

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_contract_id uuid := gen_random_uuid();
  v_patched_function_count integer;
begin
  insert into core.companies (
    id,
    company_name,
    company_slug,
    contact_email
  ) values (
    v_company_id,
    'Declared Contract Range Regression',
    'declared-contract-range-' || left(v_company_id::text, 8),
    'declared-contract-range@example.invalid'
  );

  insert into core.company_contract_config (
    id,
    company_id,
    contract_number,
    terminal_identity,
    service_area,
    effective_start_date,
    effective_end_date,
    status
  ) values (
    v_contract_id,
    v_company_id,
    'REGRESSION-53-WEEK',
    'TEST',
    'TEST',
    date '2025-08-16',
    date '2026-08-22',
    'ACTIVE'
  );

  if not core.is_declared_company_contract_range(
    v_company_id,
    date '2025-08-16',
    date '2026-08-22'
  ) then
    raise exception
      'The complete configured 53-week contract range was rejected.';
  end if;

  if not core.is_declared_company_contract_range(
    v_company_id,
    date '2025-08-16',
    date '2026-08-21'
  ) then
    raise exception
      'A current-through slice inside the configured contract was rejected.';
  end if;

  if core.is_declared_company_contract_range(
    v_company_id,
    date '2025-08-15',
    date '2026-08-21'
  ) then
    raise exception
      'A range beginning before the configured contract was accepted.';
  end if;

  if core.is_declared_company_contract_range(
    v_company_id,
    date '2025-08-16',
    date '2026-08-23'
  ) then
    raise exception
      'A range ending after the configured contract was accepted.';
  end if;

  if core.is_declared_company_contract_range(
    v_company_id,
    date '2026-08-22',
    date '2025-08-16'
  ) then
    raise exception 'A reversed contract range was accepted.';
  end if;

  select count(*)
  into v_patched_function_count
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where (
    namespace.nspname,
    proc.proname
  ) in (
    ('public', 'get_company_workforce_analytics'),
    ('public', 'get_company_territory_zip_source'),
    ('public', 'get_company_route_intelligence_detail'),
    ('public', 'get_company_route_intelligence_bundle'),
    ('core', 'get_company_driver_scorecard_index_materialized'),
    ('core', 'get_company_driver_scorecard_detail_materialized'),
    ('public', 'get_company_driver_scorecard_index_legacy'),
    ('public', 'get_company_driver_scorecard_detail_legacy'),
    ('core', 'rebuild_company_driver_scorecard_facts')
  )
    and proc.prosrc like
      '%core.is_declared_company_contract_range(%'
    and proc.prosrc not like
      '%(p_end_date - p_start_date) > 365%';

  if v_patched_function_count <> 9 then
    raise exception
      'Expected 9 declared-contract analytics functions, found %.',
      v_patched_function_count;
  end if;
end;
$$;

rollback;
