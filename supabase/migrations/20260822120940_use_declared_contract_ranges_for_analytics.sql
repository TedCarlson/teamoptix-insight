-- A contract "year" is the date range declared by company configuration.
-- Analytics callers may request the whole contract or a smaller slice inside
-- it; they must not reinterpret that range as a 365/366-day calendar year.

create index if not exists company_contract_config_range_idx
  on core.company_contract_config (
    company_id,
    effective_start_date,
    effective_end_date
  );

create or replace function core.is_declared_company_contract_range(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_company_id is not null
    and p_start_date is not null
    and p_end_date is not null
    and p_end_date >= p_start_date
    and exists (
      select 1
      from core.company_contract_config config
      where config.company_id = p_company_id
        and config.effective_start_date <= p_start_date
        and (
          config.effective_end_date is null
          or config.effective_end_date >= p_end_date
        )
    );
$$;

revoke all on function core.is_declared_company_contract_range(
  uuid,
  date,
  date
) from public, anon, authenticated, service_role;

comment on function core.is_declared_company_contract_range(
  uuid,
  date,
  date
) is
  'True when the requested range is ordered and contained by a company-declared contract configuration; contract duration is intentionally not inferred from the calendar.';

-- Preserve the current function definitions and their security/access
-- behavior while replacing only the legacy calendar-year duration guard.
-- Fail closed if any expected definition has drifted from the migration
-- history so a future schema change cannot be patched silently.
do $migration$
declare
  target record;
  function_definition text;
  patched_definition text;
  calendar_guard constant text :=
    'or (p_end_date - p_start_date) > 365';
begin
  for target in
    select *
    from (
      values
        (
          'public.get_company_workforce_analytics(text,date,date)'::regprocedure,
          'v_company_id'
        ),
        (
          'public.get_company_territory_zip_source(text,date,date)'::regprocedure,
          'v_company_id'
        ),
        (
          'public.get_company_route_intelligence_detail(uuid,uuid,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'public.get_company_route_intelligence_bundle(uuid,uuid,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'core.get_company_driver_scorecard_index_materialized(uuid,date,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'core.get_company_driver_scorecard_detail_materialized(uuid,uuid,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'public.get_company_driver_scorecard_index_legacy(uuid,date,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'public.get_company_driver_scorecard_detail_legacy(uuid,uuid,date,date)'::regprocedure,
          'p_company_id'
        ),
        (
          'core.rebuild_company_driver_scorecard_facts(uuid,date,date)'::regprocedure,
          'p_company_id'
        )
    ) as targets(function_signature, company_expression)
  loop
    select pg_get_functiondef(target.function_signature::oid)
    into function_definition;

    if position(calendar_guard in function_definition) = 0 then
      raise exception
        'Expected calendar-year guard was not found in %.',
        target.function_signature::text;
    end if;

    patched_definition := replace(
      function_definition,
      calendar_guard,
      format(
        'or not core.is_declared_company_contract_range(%s, p_start_date, p_end_date)',
        target.company_expression
      )
    );

    patched_definition := replace(
      patched_definition,
      'A valid workforce date range of no more than 366 days is required.',
      'A valid declared workforce contract range is required.'
    );
    patched_definition := replace(
      patched_definition,
      'A valid territory date range of no more than 366 days is required.',
      'A valid declared territory contract range is required.'
    );
    patched_definition := replace(
      patched_definition,
      'A company and date range of no more than 366 days is required.',
      'A company and valid declared contract range are required.'
    );

    execute patched_definition;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
