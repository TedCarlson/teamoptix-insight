-- Scoped first-company activation for the Driver Scorecard read model.
-- Existing public functions are retained as transitional fallbacks for any
-- company whose scorecard facts have not yet been rebuilt.

-- Supabase CLI applies migration files without guaranteeing an explicit
-- transaction block, so use a session-scoped allowance for this one-time
-- contract backfill. The migration connection is discarded afterward.
set statement_timeout = '10min';

do $$
declare
  v_company_id uuid;
  v_contract_id uuid;
  v_start_date date;
  v_end_date date;
  v_result jsonb;
begin
  select company.id into v_company_id
  from core.companies company
  where company.company_slug = 'beacon-point-ventures';

  if v_company_id is null then
    raise exception 'Beacon Point Ventures was not found; Driver Scorecard activation aborted.';
  end if;

  select
    config.id,
    config.effective_start_date,
    least(coalesce(config.effective_end_date, current_date), current_date)
    into v_contract_id, v_start_date, v_end_date
  from core.company_contract_config config
  where config.company_id = v_company_id
    and config.effective_start_date <= current_date
    and (config.effective_end_date is null or config.effective_end_date >= current_date)
  order by (config.status = 'ACTIVE') desc, config.effective_start_date desc
  limit 1;

  if v_contract_id is null then
    raise exception 'Beacon Point Ventures has no current contract; Driver Scorecard activation aborted.';
  end if;

  if v_end_date < v_start_date or (v_end_date - v_start_date) > 365 then
    raise exception 'Beacon Point Ventures contract range is not a valid 366-day analytics block.';
  end if;

  v_result := core.rebuild_company_driver_scorecard_facts(
    v_company_id, v_start_date, v_end_date
  );

  if coalesce((v_result ->> 'service_days_rebuilt')::integer, 0) = 0 then
    raise exception 'Beacon Point Ventures rebuild found no FINAL DSW service days.';
  end if;

  if not exists (
    select 1
    from core.driver_scorecard_snapshot snapshot
    where snapshot.company_id = v_company_id
      and snapshot.contract_id = v_contract_id
      and snapshot.period_key = 'LAST_5_WEEKS'
  ) then
    raise exception 'Beacon Point Ventures rebuild did not produce the five-week snapshot.';
  end if;

  if exists (
    select 1
    from core.driver_scorecard_fact_build build
    where build.company_id = v_company_id
      and build.service_date between v_start_date and v_end_date
      and build.status = 'FAILED'
  ) then
    raise exception 'Beacon Point Ventures rebuild produced failed service-day facts.';
  end if;

  raise notice 'Beacon Point Ventures Driver Scorecard rebuilt: %', v_result;
end;
$$;

alter function public.get_company_driver_scorecard_index(uuid, date, date, date)
  rename to get_company_driver_scorecard_index_legacy;
alter function public.get_company_driver_scorecard_detail(uuid, uuid, date, date)
  rename to get_company_driver_scorecard_detail_legacy;

create or replace function public.get_company_driver_scorecard_index(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_as_of_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if exists (
    select 1
    from core.driver_scorecard_snapshot snapshot
    join core.company_contract_config config on config.id = snapshot.contract_id
    where snapshot.company_id = p_company_id
      and config.company_id = p_company_id
      and config.effective_start_date = p_start_date
      and coalesce(config.effective_end_date, p_end_date) >= p_end_date
  ) then
    return core.get_company_driver_scorecard_index_materialized(
      p_company_id, p_start_date, p_end_date, p_as_of_date
    );
  end if;

  return public.get_company_driver_scorecard_index_legacy(
    p_company_id, p_start_date, p_end_date, p_as_of_date
  );
end;
$$;

create or replace function public.get_company_driver_scorecard_detail(
  p_company_id uuid,
  p_roster_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  service_date date,
  route_name text,
  wa_number text,
  delivery_stops numeric,
  delivery_packages numeric,
  pickup_stops numeric,
  pickup_packages numeric,
  early_pickups numeric,
  late_pickups numeric,
  potential_missed_pickups numeric,
  exceptions numeric,
  code_85 numeric,
  dna numeric,
  send_again numeric,
  required_signature numeric,
  miles numeric,
  road_hours numeric,
  duty_hours numeric,
  observed_ils numeric
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
begin
  if exists (
    select 1
    from core.driver_scorecard_snapshot snapshot
    where snapshot.company_id = p_company_id
      and snapshot.roster_member_id = p_roster_id
  ) then
    return query
    select *
    from core.get_company_driver_scorecard_detail_materialized(
      p_company_id, p_roster_id, p_start_date, p_end_date
    );
    return;
  end if;

  return query
  select *
  from public.get_company_driver_scorecard_detail_legacy(
    p_company_id, p_roster_id, p_start_date, p_end_date
  );
end;
$$;

revoke all on function public.get_company_driver_scorecard_index_legacy(uuid, date, date, date)
  from public, anon, authenticated;
revoke all on function public.get_company_driver_scorecard_detail_legacy(uuid, uuid, date, date)
  from public, anon, authenticated;
revoke all on function public.get_company_driver_scorecard_index(uuid, date, date, date)
  from public;
revoke all on function public.get_company_driver_scorecard_detail(uuid, uuid, date, date)
  from public;

grant execute on function public.get_company_driver_scorecard_index(uuid, date, date, date)
  to authenticated, service_role;
grant execute on function public.get_company_driver_scorecard_detail(uuid, uuid, date, date)
  to authenticated, service_role;

notify pgrst, 'reload schema';
